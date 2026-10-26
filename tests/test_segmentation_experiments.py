import json
import tempfile
import unittest
from importlib import import_module
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np
import torch
from PIL import Image

from models_benchmark.utils.metrics import (
    compute_multiclass_metrics,
    metrics_from_confusion,
)

finetune = import_module("models_benchmark.06_segformer_finetune")
evaluation = import_module(
    "models_benchmark.evaluate_segmentation_experiments"
)
reporting = import_module(
    "models_benchmark.report_segmentation_comparison"
)
segmenter_module = import_module("models_benchmark.05_segformer")


class SegmentationExperimentTests(unittest.TestCase):
    def test_config_file_defaults_can_be_overridden_from_command_line(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.json"
            config.write_text(
                json.dumps({"model_name": "nvidia/mit-b4", "epochs": 1}),
                encoding="utf-8",
            )
            with patch(
                "sys.argv",
                [
                    "06_segformer_finetune.py",
                    "--config",
                    str(config),
                    "--epochs",
                    "2",
                ],
            ):
                args = finetune.parse_args()

        self.assertEqual(args.model_name, "nvidia/mit-b4")
        self.assertEqual(args.epochs, 2)

    def test_cpu_device_fallback_is_selectable(self):
        self.assertEqual(evaluation.choose_device("cpu"), torch.device("cpu"))

    def test_auto_device_selection_falls_back_to_cpu(self):
        with (
            patch.object(torch.backends.mps, "is_available", return_value=False),
            patch.object(torch.cuda, "is_available", return_value=False),
        ):
            self.assertEqual(evaluation.choose_device("auto"), torch.device("cpu"))

    def test_deeplab_training_rejects_batch_size_one_before_model_work(self):
        args = SimpleNamespace(epochs=1, batch_size=1, model_type="deeplabv3plus")

        with self.assertRaisesRegex(ValueError, "batch_size of at least 2"):
            finetune.SegFormerTrainer(args)

    def test_deeplab_floodnet_recipe_uses_full_official_split(self):
        config_path = (
            Path(__file__).resolve().parents[1]
            / "configs"
            / "segmentation"
            / "deeplabv3plus_floodnet.json"
        )
        config = json.loads(config_path.read_text(encoding="utf-8"))

        self.assertEqual(config["model_type"], "deeplabv3plus")
        self.assertEqual(config["encoder_name"], "resnet50")
        self.assertEqual(config["batch_size"], 2)
        self.assertEqual(config["max_train_batches"], 0)
        self.assertEqual(config["dataset_root"], "FloodNet")
        self.assertNotEqual(
            config["checkpoint_dir"],
            "checkpoints/segformer_full",
        )

    def test_training_and_evaluation_processors_match(self):
        image = Image.fromarray(
            np.random.default_rng(42).integers(
                0,
                256,
                size=(32, 48, 3),
                dtype=np.uint8,
            )
        )
        segformer_processor = finetune.get_image_processor(
            "segformer",
            "nvidia/mit-b3",
        )

        expected = segformer_processor(
            images=image,
            return_tensors="pt",
        )["pixel_values"]
        actual = finetune.get_image_processor(
            "deeplabv3plus",
            "",
        )(images=image, return_tensors="pt")["pixel_values"]

        self.assertTrue(torch.equal(expected, actual))

    def test_loss_factory_supports_ce_weighted_ce_and_dice_focal(self):
        weights = [1.0] * 10

        cross_entropy = finetune.build_segmentation_loss("cross_entropy")
        weighted = finetune.build_segmentation_loss(
            "weighted_cross_entropy",
            class_weights=weights,
        )
        dice_focal = finetune.build_segmentation_loss(
            "dice_focal",
            class_weights=weights,
        )

        self.assertIsInstance(cross_entropy, torch.nn.CrossEntropyLoss)
        self.assertEqual(cross_entropy.ignore_index, 255)
        self.assertIsInstance(weighted, torch.nn.CrossEntropyLoss)
        self.assertTrue(torch.equal(weighted.weight, torch.ones(10)))
        self.assertIsInstance(dice_focal, finetune.DiceFocalLoss)
        with self.assertRaisesRegex(ValueError, "class_weight_cap"):
            finetune.build_segmentation_loss("weighted_cross_entropy")

    def test_class_balanced_sampling_weights_rare_class_images_more(self):
        class DatasetFixture:
            def __init__(self):
                self.valid_pairs = [
                    ("common-1.jpg", "common-1_lab.png"),
                    ("common-2.jpg", "common-2_lab.png"),
                    ("rare.jpg", "rare_lab.png"),
                ]
                self.cache = {
                    self.valid_pairs[0]: (
                        None,
                        np.array([[1, 2], [2, 255]], dtype=np.uint8),
                    ),
                    self.valid_pairs[1]: (
                        None,
                        np.array([[1, 2], [2, 255]], dtype=np.uint8),
                    ),
                    self.valid_pairs[2]: (
                        None,
                        np.array([[1, 9], [9, 255]], dtype=np.uint8),
                    ),
                }

        sample_weights, class_image_counts = (
            finetune.build_class_balanced_sample_weights(DatasetFixture())
        )

        self.assertEqual(class_image_counts[1], 3)
        self.assertEqual(class_image_counts[2], 2)
        self.assertEqual(class_image_counts[9], 1)
        self.assertGreater(sample_weights[2], sample_weights[0])
        self.assertTrue(torch.isfinite(sample_weights).all())

    def test_class_balanced_sampling_rejects_all_ignored_masks(self):
        class DatasetFixture:
            valid_pairs = [("ignored.jpg", "ignored_lab.png")]
            cache = {
                valid_pairs[0]: (
                    None,
                    np.full((2, 2), 255, dtype=np.uint8),
                )
            }

        with self.assertRaisesRegex(ValueError, "no recognized class pixels"):
            finetune.build_class_balanced_sample_weights(DatasetFixture())

    def test_shared_confusion_metric_matches_array_metric(self):
        prediction = np.array([[0, 1, 1], [2, 2, 0]], dtype=np.int64)
        target = np.array([[0, 1, 0], [2, 255, 0]], dtype=np.int64)
        confusion_metrics = compute_multiclass_metrics(
            prediction,
            target,
            num_classes=3,
            class_names={0: "a", 1: "b", 2: "c"},
        )
        from_confusion = metrics_from_confusion(
            confusion_metrics["confusion_matrix"],
            {0: "a", 1: "b", 2: "c"},
        )

        for metric in ("mIoU", "macro_f1", "overall_pixel_accuracy"):
            self.assertEqual(confusion_metrics[metric], from_confusion[metric])
        self.assertEqual(
            confusion_metrics["confusion_matrix"],
            from_confusion["confusion_matrix"],
        )

    def test_evaluator_loads_architecture_specific_weights_strictly(self):
        class FakeModel(torch.nn.Module):
            def __init__(self, size):
                super().__init__()
                self.weight = torch.nn.Parameter(torch.ones(size))

        class FakeSegformer:
            model = FakeModel(3)

            @staticmethod
            def from_pretrained(model_name, config, ignore_mismatched_sizes):
                self_name.append(model_name)
                return FakeSegformer.model

        self_name = []
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "b4.pt"
            torch.save(FakeSegformer.model.state_dict(), checkpoint)
            with (
                patch.object(
                    evaluation.SegformerConfig,
                    "from_pretrained",
                    return_value=SimpleNamespace(),
                ),
                patch.object(
                    evaluation,
                    "SegformerForSemanticSegmentation",
                    FakeSegformer,
                ),
            ):
                loaded = evaluation.build_model(
                    "segformer",
                    "nvidia/mit-b4",
                    checkpoint,
                    torch.device("cpu"),
                    "resnet50",
                )

            self.assertIs(loaded, FakeSegformer.model)
            self.assertEqual(self_name, ["nvidia/mit-b4"])

            incompatible = Path(directory) / "b3.pt"
            torch.save({"weight": torch.ones(4)}, incompatible)
            with (
                patch.object(
                    evaluation.SegformerConfig,
                    "from_pretrained",
                    return_value=SimpleNamespace(),
                ),
                patch.object(
                    evaluation,
                    "SegformerForSemanticSegmentation",
                    FakeSegformer,
                ),
                self.assertRaises(RuntimeError),
            ):
                evaluation.build_model(
                    "segformer",
                    "nvidia/mit-b4",
                    incompatible,
                    torch.device("cpu"),
                    "resnet50",
                )

    def test_inference_preprocessing_uses_the_trainer_contract(self):
        class InputBatch(dict):
            def to(self, device):
                return self

        class FakeModel(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.weight = torch.nn.Parameter(torch.ones(1))

            def forward(self, **kwargs):
                logits = torch.zeros((1, 10, 2, 2))
                logits[:, 5] = 1
                return SimpleNamespace(logits=logits)

        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "checkpoint.pt"
            fake_model = FakeModel()
            torch.save(fake_model.state_dict(), checkpoint)
            processor = Mock(
                side_effect=lambda **kwargs: InputBatch(
                    pixel_values=torch.ones((1, 3, 8, 10))
                )
            )
            with (
                patch.object(
                    segmenter_module.SegformerImageProcessor,
                    "from_pretrained",
                    return_value=processor,
                ) as processor_factory,
                patch.object(
                    segmenter_module.SegformerConfig,
                    "from_pretrained",
                    return_value=SimpleNamespace(),
                ),
                patch.object(
                    segmenter_module.SegformerForSemanticSegmentation,
                    "from_pretrained",
                    return_value=fake_model,
                ),
            ):
                segmenter = segmenter_module.SegFormerSegmenter(
                    model_name="nvidia/mit-b3",
                    device=torch.device("cpu"),
                    checkpoint_path=str(checkpoint),
                )
                _, class_mask = segmenter.segment_image(
                    np.zeros((8, 10, 3), dtype=np.uint8)
                )

        processor_factory.assert_called_once_with(
            "nvidia/mit-b3",
            do_resize=False,
            do_rescale=True,
            do_normalize=True,
        )
        processor.assert_called_once()
        self.assertEqual(class_mask.shape, (8, 10))
        self.assertTrue(np.all(class_mask == 5))

    def test_comparison_report_records_deltas_and_preserves_confusion(self):
        confusion = [[5, 0], [0, 5]]
        candidates = []
        for name, miou in (("baseline", 0.5), ("candidate", 0.6)):
            candidates.append(
                {
                    "name": name,
                    "architecture": "test",
                    "pretrained_initialization": "test weights",
                    "metrics": {
                        "mIoU": miou,
                        "macro_f1": miou,
                        "overall_pixel_accuracy": miou,
                        "confusion_matrix": confusion,
                        "per_class": {
                            "a": {"iou": miou, "f1_score": miou},
                            "b": {"iou": miou, "f1_score": miou},
                        },
                    },
                    "parameter_count": 10,
                    "validation_image_ids": ["sample-1"],
                }
            )
        report = reporting.build_comparison(
            {
                "dataset": "FloodNet",
                "evaluation_split": "validation",
                "evaluation_image_count": 1,
                "evaluation_image_ids": ["sample-1"],
                "metric_policy": "ignore unknowns",
                "validation_used_for_model_selection": True,
                "candidates": candidates,
            },
            "baseline",
        )

        self.assertAlmostEqual(
            report["comparisons"][1]["deltas_from_baseline"]["mIoU"],
            0.1,
        )
        self.assertEqual(
            report["candidates"][1]["metrics"]["confusion_matrix"],
            confusion,
        )
        self.assertFalse(report["test_metrics_available"])


if __name__ == "__main__":
    unittest.main()
