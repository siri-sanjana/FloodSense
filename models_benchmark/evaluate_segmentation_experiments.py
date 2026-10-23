"""Evaluate SegFormer checkpoints with the same FloodNet validation protocol."""

import argparse
import json
import resource
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader
from transformers import SegformerConfig, SegformerForSemanticSegmentation

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "models_benchmark"))

from utils.dataset_loader import IGNORE_INDEX  # noqa: E402
from utils.metrics import CLASS_NAMES_FLOODNET, metrics_from_confusion  # noqa: E402

from importlib import import_module  # noqa: E402

training_module = import_module("06_segformer_finetune")
FloodNetDataset = training_module.FloodNetDataset
get_image_processor = training_module.get_image_processor
get_model_logits = training_module.get_model_logits
NUM_CLASSES = len(CLASS_NAMES_FLOODNET)


def choose_device(requested):
    if requested != "auto":
        if requested == "mps" and not torch.backends.mps.is_available():
            raise RuntimeError("MPS was requested but is unavailable.")
        if requested == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but is unavailable.")
        return torch.device(requested)
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def build_model(model_type, model_name, checkpoint_path, device, encoder_name):
    if model_type == "segformer":
        config = SegformerConfig.from_pretrained(model_name)
        config.num_labels = NUM_CLASSES
        config.id2label = CLASS_NAMES_FLOODNET
        config.label2id = {
            name: class_id for class_id, name in CLASS_NAMES_FLOODNET.items()
        }
        model = SegformerForSemanticSegmentation.from_pretrained(
            model_name,
            config=config,
            ignore_mismatched_sizes=True,
        )
    elif model_type == "deeplabv3plus":
        try:
            import segmentation_models_pytorch as smp
        except ImportError as exc:
            raise ImportError(
                "DeepLabV3+ evaluation requires "
                "requirements-segmentation-experiments.txt."
            ) from exc
        model = smp.DeepLabV3Plus(
            encoder_name=encoder_name,
            encoder_weights=None,
            in_channels=3,
            classes=NUM_CLASSES,
        )
    else:
        raise ValueError(f"Unsupported segmentation model type: {model_type}")
    checkpoint_path = Path(checkpoint_path)
    if not checkpoint_path.is_absolute():
        checkpoint_path = PROJECT_ROOT / checkpoint_path
    if not checkpoint_path.is_file():
        raise FileNotFoundError(f"Model checkpoint not found: {checkpoint_path}")
    state_dict = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    if isinstance(state_dict, dict) and "model_state_dict" in state_dict:
        state_dict = state_dict["model_state_dict"]
    model.load_state_dict(state_dict, strict=True)
    model.to(device)
    model.eval()
    return model


def _memory_snapshot(device):
    snapshot = {"process_max_rss_mib": None, "mps_driver_allocated_bytes": None}
    max_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    snapshot["process_max_rss_mib"] = round(
        max_rss / (1024 * 1024 if sys.platform == "darwin" else 1024),
        2,
    )
    if device.type == "mps":
        snapshot["mps_driver_allocated_bytes"] = torch.mps.driver_allocated_memory()
    elif device.type == "cuda":
        snapshot["cuda_max_allocated_bytes"] = torch.cuda.max_memory_allocated(device)
    return snapshot


def evaluate_candidate(candidate, dataset, device, batch_size=1, warmup_images=5):
    model_name = candidate["model_name"]
    training = {}
    if candidate.get("training_results"):
        training_path = Path(candidate["training_results"])
        if not training_path.is_absolute():
            training_path = PROJECT_ROOT / training_path
        if training_path.is_file():
            training = json.loads(training_path.read_text(encoding="utf-8"))
    model_type = candidate.get(
        "model_type",
        training.get("config", {}).get("model_type", "segformer"),
    )
    encoder_name = candidate.get(
        "encoder_name",
        training.get("config", {}).get("encoder_name", "resnet50"),
    )
    model_load_start = time.perf_counter()
    model = build_model(
        model_type,
        model_name,
        candidate["checkpoint"],
        device,
        encoder_name,
    )
    model_load_seconds = time.perf_counter() - model_load_start
    parameter_count = sum(parameter.numel() for parameter in model.parameters())
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    confusion = np.zeros((NUM_CLASSES, NUM_CLASSES), dtype=np.int64)
    model_latencies_ms = []
    pipeline_latencies_ms = []
    processed_ids = []
    warmup_batches = max(0, warmup_images // batch_size)
    before_memory = _memory_snapshot(device)
    start_eval = time.perf_counter()

    with torch.inference_mode():
        for batch_index, (pixel_values, labels, filenames) in enumerate(loader):
            pipeline_start = time.perf_counter()
            model_start = time.perf_counter()
            logits = get_model_logits(
                model,
                pixel_values.to(device),
                model_type,
            )
            logits = F.interpolate(
                logits,
                size=labels.shape[-2:],
                mode="bilinear",
                align_corners=False,
            )
            predictions = logits.argmax(dim=1).cpu().numpy()
            model_elapsed_ms = (time.perf_counter() - model_start) * 1000
            pipeline_elapsed_ms = (time.perf_counter() - pipeline_start) * 1000

            if batch_index >= warmup_batches:
                model_latencies_ms.append(model_elapsed_ms / len(filenames))
                pipeline_latencies_ms.append(pipeline_elapsed_ms / len(filenames))

            for prediction, label, filename in zip(
                predictions, labels.numpy(), filenames
            ):
                gt = label.reshape(-1).astype(np.int64, copy=False)
                pred = prediction.reshape(-1).astype(np.int64, copy=False)
                valid = gt != IGNORE_INDEX
                confusion += np.bincount(
                    gt[valid] * NUM_CLASSES + pred[valid],
                    minlength=NUM_CLASSES**2,
                ).reshape(NUM_CLASSES, NUM_CLASSES)
                processed_ids.append(Path(filename).stem)

    if device.type == "mps":
        torch.mps.synchronize()
    elif device.type == "cuda":
        torch.cuda.synchronize(device)

    metrics = metrics_from_confusion(confusion, CLASS_NAMES_FLOODNET)
    after_memory = _memory_snapshot(device)
    training_history = training.get("training_history", {})
    training_seconds = training.get("training_seconds")
    if training_seconds is None:
        epoch_times = training_history.get("epoch_times", [])
        if epoch_times:
            training_seconds = sum(epoch_times)
    training_epochs = training.get("epochs_trained")
    if training_epochs is None and training_history.get("train_loss"):
        training_epochs = len(training_history["train_loss"])

    result = {
        "name": candidate["name"],
        "architecture": training.get(
            "architecture",
            f"DeepLabV3Plus/{encoder_name}"
            if model_type == "deeplabv3plus"
            else model_name.rsplit("/", 1)[-1],
        ),
        "model_type": model_type,
        "encoder_name": encoder_name if model_type == "deeplabv3plus" else None,
        "model_name": model_name,
        "checkpoint": str(candidate["checkpoint"]),
        "pretrained_initialization": candidate.get(
            "pretrained_initialization", model_name
        ),
        "run_type": training.get(
            "run_type",
            candidate.get(
                "run_type",
                "historical_training_provenance_unknown",
            ),
        ),
        "training_epochs": training_epochs,
        "best_epoch": training.get("best_epoch"),
        "training_seconds": training_seconds,
        "training_config": training.get("config", {}),
        "parameter_count": parameter_count,
        "device": str(device),
        "validation_split": "official FloodNet validation",
        "validation_image_count": len(processed_ids),
        "validation_image_ids": processed_ids,
        "ignored_unknown_ground_truth_pixels": dataset.unmapped_pixel_count,
        "unknown_mask_policy": "exact documented RGB palette; other colors ignored (255)",
        "metrics": metrics,
        "model_forward_latency_ms_per_image": (
            float(np.mean(model_latencies_ms)) if model_latencies_ms else None
        ),
        "model_forward_latency_p50_ms_per_image": (
            float(np.percentile(model_latencies_ms, 50))
            if model_latencies_ms
            else None
        ),
        "pipeline_latency_ms_per_image": (
            float(np.mean(pipeline_latencies_ms)) if pipeline_latencies_ms else None
        ),
        "warmup_images_excluded_from_latency": warmup_batches * batch_size,
        "model_load_seconds": model_load_seconds,
        "evaluation_seconds": time.perf_counter() - start_eval,
        "memory_before_inference": before_memory,
        "memory_after_inference": after_memory,
        "memory_note": (
            "RSS is process high-water mark, not model-exclusive memory. MPS driver "
            "allocation is sampled before and after inference; it is not a guaranteed "
            "peak allocation."
        ),
        "test_metrics_available": False,
    }
    del model
    if device.type == "mps":
        torch.mps.empty_cache()
    elif device.type == "cuda":
        torch.cuda.empty_cache()
    return result


def evaluate_config(config_path, output_path, device_override=None):
    config_path = Path(config_path)
    if not config_path.is_absolute():
        config_path = PROJECT_ROOT / config_path
    config = json.loads(config_path.read_text(encoding="utf-8"))
    dataset_root = Path(config.get("dataset_root", PROJECT_ROOT / "FloodNet"))
    if not dataset_root.is_absolute():
        dataset_root = PROJECT_ROOT / dataset_root
    val_images = dataset_root / "FloodNet-Supervised_v1.0" / "val" / "val-org-img"
    val_masks = dataset_root / "ColorMasks-FloodNetv1" / "ColorMasks-ValSet"
    processor = get_image_processor("deeplabv3plus", "")
    dataset = FloodNetDataset(
        processor=processor,
        img_size=int(config.get("img_size", 512)),
        sources=[(val_images, val_masks)],
    )
    device = choose_device(device_override or config.get("device", "auto"))
    candidates = []
    reference_ids = None
    for candidate in config["candidates"]:
        result = evaluate_candidate(
            candidate,
            dataset,
            device,
            batch_size=int(config.get("batch_size", 1)),
            warmup_images=int(config.get("warmup_images", 5)),
        )
        current_ids = result["validation_image_ids"]
        if reference_ids is None:
            reference_ids = current_ids
        elif current_ids != reference_ids:
            raise ValueError(
                "Candidate validation IDs differ; comparisons are not comparable."
            )
        candidates.append(result)
        print(
            f"{result['name']}: mIoU={result['metrics']['mIoU']:.4f} "
            f"macro-F1={result['metrics']['macro_f1']:.4f} "
            f"accuracy={result['metrics']['overall_pixel_accuracy']:.4f} "
            f"latency={result['model_forward_latency_ms_per_image']:.1f} ms/image"
        )

    output = {
        "dataset": "FloodNet",
        "evaluation_split": "official FloodNet validation",
        "evaluation_image_count": len(reference_ids or []),
        "evaluation_image_ids": reference_ids or [],
        "class_names": CLASS_NAMES_FLOODNET,
        "metric_policy": (
            "One dataset-level confusion matrix per candidate; exact documented "
            "RGB palette; unknown ground-truth pixels ignored; absent classes "
            "excluded from macro averages."
        ),
        "validation_used_for_model_selection": True,
        "test_metrics_available": False,
        "candidates": candidates,
    }
    output_path = Path(output_path)
    if not output_path.is_absolute():
        output_path = PROJECT_ROOT / output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"Saved evaluation results to {output_path}")
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        default="configs/segmentation/compare_candidates.json",
    )
    parser.add_argument(
        "--output",
        default="results/segmentation_model_comparison.json",
    )
    parser.add_argument(
        "--device",
        choices=("auto", "mps", "cuda", "cpu"),
        default=None,
    )
    args = parser.parse_args()
    evaluate_config(args.config, args.output, device_override=args.device)


if __name__ == "__main__":
    main()
