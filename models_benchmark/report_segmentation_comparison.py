"""Build a readable comparison report from full-split evaluation results."""

import argparse
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
METRICS = ("mIoU", "macro_f1", "overall_pixel_accuracy")


def _markdown_cell(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def build_comparison(evaluation, baseline_name):
    candidates = evaluation["candidates"]
    by_name = {candidate["name"]: candidate for candidate in candidates}
    if baseline_name not in by_name:
        raise ValueError(f"Baseline candidate '{baseline_name}' not found.")
    baseline = by_name[baseline_name]
    baseline_metrics = baseline["metrics"]
    class_balanced = by_name.get("segformer_b3_class_balanced")
    if class_balanced:
        balanced_metrics = class_balanced["metrics"]
        road_iou_delta = (
            balanced_metrics["per_class"]["Road-Flooded"]["iou"]
            - baseline_metrics["per_class"]["Road-Flooded"]["iou"]
        )
        recommendation = (
            "The class-balanced B3 run improved validation mIoU by "
            f"{balanced_metrics['mIoU'] - baseline_metrics['mIoU']:+.4f} and "
            "macro-F1 by "
            f"{balanced_metrics['macro_f1'] - baseline_metrics['macro_f1']:+.4f}, "
            "but pixel accuracy changed by "
            f"{balanced_metrics['overall_pixel_accuracy'] - baseline_metrics['overall_pixel_accuracy']:+.4f} "
            f"and Road-Flooded IoU changed by {road_iou_delta:+.4f}. These "
            "validation-selected results have meaningful class tradeoffs; keep "
            "the current production configuration until gains are repeatable "
            "and confirmed on independent test data."
        )
    else:
        recommendation = (
            "Keep the current production configuration unchanged unless a "
            "fully trained candidate shows a meaningful and repeatable "
            "improvement. Smoke runs are not quality comparisons, and no "
            "independent test metrics are available."
        )

    comparisons = []
    for candidate in candidates:
        metrics = candidate["metrics"]
        comparisons.append(
            {
                "name": candidate["name"],
                "deltas_from_baseline": {
                    metric: metrics[metric] - baseline_metrics[metric]
                    for metric in METRICS
                },
                "per_class_deltas_from_baseline": {
                    class_name: {
                        metric: candidate["metrics"]["per_class"][class_name][metric]
                        - baseline["metrics"]["per_class"][class_name][metric]
                        for metric in ("iou", "f1_score")
                    }
                    for class_name in candidate["metrics"]["per_class"]
                },
            }
        )
    return {
        "dataset": evaluation["dataset"],
        "evaluation_split": evaluation["evaluation_split"],
        "evaluation_image_count": evaluation["evaluation_image_count"],
        "evaluation_image_ids": evaluation["evaluation_image_ids"],
        "metric_policy": evaluation["metric_policy"],
        "validation_used_for_model_selection": evaluation[
            "validation_used_for_model_selection"
        ],
        "test_metrics_available": False,
        "baseline_candidate": baseline_name,
        "candidates": candidates,
        "comparisons": comparisons,
        "recommendation": recommendation,
    }


def render_markdown(report, evaluation_config_path):
    rows = []
    comparison_by_name = {
        item["name"]: item for item in report["comparisons"]
    }
    for candidate in report["candidates"]:
        delta = comparison_by_name[candidate["name"]]["deltas_from_baseline"]
        metrics = candidate["metrics"]
        memory = candidate.get("memory_after_inference", {})
        train_time = candidate.get("training_seconds")
        train_time_text = f"{train_time / 3600:.2f} h" if train_time else "unknown"
        rows.append(
            "| {name} | {architecture} | {initialization} | {epochs} | "
            "{best_epoch} | {train_time} | {miou:.4f} ({miou_delta:+.4f}) | "
            "{f1:.4f} ({f1_delta:+.4f}) | {accuracy:.4f} ({acc_delta:+.4f}) | "
            "{latency} | {parameters:,} | {rss} |".format(
                name=_markdown_cell(candidate["name"]),
                architecture=_markdown_cell(candidate["architecture"]),
                initialization=_markdown_cell(
                    candidate.get("pretrained_initialization", "unknown")
                ),
                epochs=candidate.get("training_epochs") or "unknown",
                best_epoch=candidate.get("best_epoch") or "unknown",
                train_time=train_time_text,
                miou=metrics["mIoU"],
                miou_delta=delta["mIoU"],
                f1=metrics["macro_f1"],
                f1_delta=delta["macro_f1"],
                accuracy=metrics["overall_pixel_accuracy"],
                acc_delta=delta["overall_pixel_accuracy"],
                latency=(
                    f"{candidate['model_forward_latency_ms_per_image']:.1f} ms"
                    if candidate.get("model_forward_latency_ms_per_image") is not None
                    else "not measured"
                ),
                parameters=candidate["parameter_count"],
                rss=(
                    f"{memory['process_max_rss_mib']:.0f} MiB process max RSS"
                    if memory.get("process_max_rss_mib") is not None
                    else "not measured"
                ),
            )
        )

    class_rows = []
    baseline = next(
        candidate
        for candidate in report["candidates"]
        if candidate["name"] == report["baseline_candidate"]
    )
    for class_name, baseline_class in baseline["metrics"]["per_class"].items():
        values = [class_name, f"{baseline_class['iou']:.4f}", f"{baseline_class['f1_score']:.4f}"]
        for candidate in report["candidates"]:
            if candidate["name"] == report["baseline_candidate"]:
                continue
            current = candidate["metrics"]["per_class"][class_name]
            values.extend(
                [
                    f"{current['iou']:.4f}",
                    f"{current['iou'] - baseline_class['iou']:+.4f}",
                    f"{current['f1_score']:.4f}",
                    f"{current['f1_score'] - baseline_class['f1_score']:+.4f}",
                ]
            )
        class_rows.append("| " + " | ".join(values) + " |")

    candidate_headers = []
    for candidate in report["candidates"]:
        if candidate["name"] != report["baseline_candidate"]:
            candidate_headers.extend(
                [
                    f"{candidate['name']} IoU",
                    "Δ IoU",
                    f"{candidate['name']} F1",
                    "Δ F1",
                ]
            )
    class_header = "| Class | Baseline IoU | Baseline F1 | " + " | ".join(candidate_headers) + " |"
    class_separator = "|" + "|".join(["---"] * (3 + len(candidate_headers))) + "|"

    return f"""# FloodSense Segmentation Experiments

## Protocol and limitations

- Split: {report['evaluation_split']} ({report['evaluation_image_count']} images).
- Every candidate was evaluated on the same ordered image IDs with the same
  512×512 preprocessing, exact documented palette, ignore index 255, and
  dataset-level confusion-matrix metrics.
- The official validation split is used for model selection. **These are not
  independent test results.**
- Unknown annotation colors remain ignored; their authoritative class mapping
  is unavailable. Event/group metadata is unavailable, so event-independent
  split status cannot be verified.
- Latency measures model forward + output resize + device-to-host prediction,
  excluding image decode and preprocessing. Warm-up images are excluded.
- Process max RSS is a process high-water mark, not model-exclusive memory.
  MPS allocator readings are in the JSON and are not guaranteed peak values.

## Model comparison

All metric deltas are absolute differences from `{report['baseline_candidate']}`.

| Candidate | Architecture | Pretrained initialization | Epochs | Best epoch | Training time | mIoU (Δ) | Macro-F1 (Δ) | Pixel accuracy (Δ) | Inference latency | Parameters | Memory |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
{chr(10).join(rows)}

## Per-class metrics

{class_header}
{class_separator}
{chr(10).join(class_rows)}

The complete dataset-level confusion matrices, training configurations,
evaluation image IDs, memory samples, and per-class precision/recall are stored
in `results/segmentation_model_comparison.json`.

## Recommendation

{report['recommendation']}

The B4 result is a bounded smoke test only and must not be treated as a trained
quality candidate. The DeepLabV3+ result is also a four-batch smoke test. The
B3 class-balanced run is fully trained, but its class-level validation changes
are mixed; it is not an independent test result. Preserve the existing
production checkpoint until a repeatable comparison and independent test
evaluation are available. The B3/B4 weights are subject to the NVIDIA Source
Code License (non-commercial research or evaluation).

## Reproduction

The experiments here use only four labeled training batches for B4 and
DeepLabV3+ smoke checks; they do not establish quality or convergence.

1. Reproduce the SegFormer-B4 smoke run:

   ```sh
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/06_segformer_finetune.py --config configs/segmentation/segformer_b4_smoke.json
   ```

2. Reproduce the DeepLabV3+ smoke run (install the optional dependency first):

   ```sh
   .venv/bin/pip install -r requirements-segmentation-experiments.txt
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/06_segformer_finetune.py --config configs/segmentation/deeplabv3plus_smoke.json
   ```

3. Run full training with the B3 recipe after ensuring enough memory and disk:

   ```sh
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/06_segformer_finetune.py --config configs/segmentation/segformer_b3_retrain.json
   ```

4. Run the class-balanced B3 experiment using only the 398 verified labeled
   training pairs:

   ```sh
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/06_segformer_finetune.py --config configs/segmentation/segformer_b3_class_balanced.json
   ```

5. Evaluate the configured candidates on the same full validation split:

   ```sh
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/evaluate_segmentation_experiments.py --config {evaluation_config_path}
   ```

6. Render this report:

   ```sh
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/report_segmentation_comparison.py
   ```
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--evaluation",
        default="results/segmentation_model_comparison.json",
    )
    parser.add_argument(
        "--baseline",
        default="segformer_b3_original",
    )
    parser.add_argument(
        "--output-json",
        default="results/segmentation_comparison_report.json",
    )
    parser.add_argument(
        "--output-markdown",
        default="SEGMENTATION_MODEL_COMPARISON.md",
    )
    parser.add_argument(
        "--evaluation-config",
        default="configs/segmentation/compare_candidates.json",
    )
    args = parser.parse_args()
    evaluation_path = Path(args.evaluation)
    if not evaluation_path.is_absolute():
        evaluation_path = PROJECT_ROOT / evaluation_path
    evaluation = json.loads(evaluation_path.read_text(encoding="utf-8"))
    report = build_comparison(evaluation, args.baseline)
    json_path = Path(args.output_json)
    markdown_path = Path(args.output_markdown)
    if not json_path.is_absolute():
        json_path = PROJECT_ROOT / json_path
    if not markdown_path.is_absolute():
        markdown_path = PROJECT_ROOT / markdown_path
    json_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(
        render_markdown(report, args.evaluation_config),
        encoding="utf-8",
    )
    print(f"Saved comparison JSON to {json_path}")
    print(f"Saved comparison report to {markdown_path}")


if __name__ == "__main__":
    main()
