import tempfile
import unittest
from importlib import import_module
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from models_benchmark.audit_floodnet_dataset import audit_dataset
from models_benchmark.utils.dataset_loader import (
    IGNORE_INDEX,
    FloodNetDatasetLoader,
    rgb_mask_to_class_ids,
)
from models_benchmark.utils.metrics import (
    compute_multiclass_metrics,
    compute_segmentation_metrics,
)

DiceFocalLoss = import_module(
    "models_benchmark.06_segformer_finetune"
).DiceFocalLoss
FloodSegDiceFocalLoss = import_module(
    "models_benchmark.07_floodseg_finetune"
).DiceFocalLoss


class FloodNetMaskHandlingTests(unittest.TestCase):
    def test_unknown_palette_colors_are_ignored_not_background(self):
        mask_rgb = np.array(
            [
                [(0, 0, 0), (255, 0, 0)],
                [(0, 163, 255), (120, 120, 70)],
            ],
            dtype=np.uint8,
        )

        class_mask = rgb_mask_to_class_ids(mask_rgb)

        np.testing.assert_array_equal(
            class_mask,
            np.array([[0, 1], [IGNORE_INDEX, IGNORE_INDEX]], dtype=np.uint8),
        )

    def test_binary_loader_preserves_ignore_pixels(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            image_dir = root / "FloodNet-Supervised_v1.0" / "val" / "val-org-img"
            mask_dir = root / "ColorMasks-FloodNetv1" / "ColorMasks-ValSet"
            image_dir.mkdir(parents=True)
            mask_dir.mkdir(parents=True)
            Image.new("RGB", (2, 2)).save(image_dir / "sample.jpg")
            mask = np.array(
                [
                    [(0, 0, 0), (255, 0, 0)],
                    [(0, 163, 255), (61, 230, 250)],
                ],
                dtype=np.uint8,
            )
            Image.fromarray(mask).save(mask_dir / "sample_lab.png")

            _, binary_mask, class_mask = FloodNetDatasetLoader(
                root_dir=str(root),
                split="val",
                target_size=None,
            ).load_item(0)

        np.testing.assert_array_equal(
            class_mask,
            np.array([[0, 1], [IGNORE_INDEX, 5]], dtype=np.int64),
        )
        np.testing.assert_array_equal(
            binary_mask,
            np.array([[0, 1], [IGNORE_INDEX, 1]], dtype=np.uint8),
        )

    def test_segmentation_metrics_exclude_unknown_ground_truth_pixels(self):
        prediction = np.array([[1, 0, 0]], dtype=np.uint8)
        ground_truth = np.array([[IGNORE_INDEX, 0, 1]], dtype=np.uint8)

        binary = compute_segmentation_metrics(prediction, ground_truth)
        multiclass = compute_multiclass_metrics(
            prediction,
            ground_truth,
            num_classes=10,
        )

        self.assertEqual(binary["pixel_accuracy"], 0.5)
        self.assertEqual(multiclass["per_class"]["Background"]["gt_pixel_count"], 1)
        self.assertEqual(multiclass["per_class"]["Building-Flooded"]["gt_pixel_count"], 1)
        self.assertEqual(sum(sum(row) for row in multiclass["confusion_matrix"]), 2)

    def test_binary_metrics_handle_all_ignored_ground_truth(self):
        metrics = compute_segmentation_metrics(
            np.array([[0, 1]], dtype=np.uint8),
            np.array([[IGNORE_INDEX, IGNORE_INDEX]], dtype=np.uint8),
        )

        self.assertEqual(metrics["pixel_accuracy"], 0.0)
        self.assertEqual(metrics["iou"], 0.0)
        self.assertEqual(metrics["tp"] + metrics["fp"] + metrics["fn"] + metrics["tn"], 0)

    def test_dice_focal_loss_ignores_unknown_and_rotation_fill_pixels(self):
        criterion = DiceFocalLoss(num_classes=3)
        logits = torch.zeros((1, 3, 2, 2), requires_grad=True)
        targets = torch.tensor([[[1, IGNORE_INDEX], [2, IGNORE_INDEX]]])
        changed_logits = logits.detach().clone()
        changed_logits[:, :, :, 1] = torch.tensor(
            [[[0.0, 1000.0], [0.0, -1000.0], [500.0, -500.0]]]
        )
        changed_logits.requires_grad_()

        loss = criterion(logits, targets)
        changed_loss = criterion(changed_logits, targets)

        self.assertTrue(torch.isfinite(loss))
        self.assertTrue(torch.allclose(loss, changed_loss))
        loss.backward()
        self.assertTrue(torch.isfinite(logits.grad).all())

    def test_all_ignored_targets_produce_finite_zero_loss(self):
        criterion = DiceFocalLoss(num_classes=3)
        logits = torch.randn((1, 3, 2, 2), requires_grad=True)
        targets = torch.full((1, 2, 2), IGNORE_INDEX)

        loss = criterion(logits, targets)
        loss.backward()

        self.assertEqual(loss.item(), 0.0)
        self.assertEqual(torch.count_nonzero(logits.grad).item(), 0)

    def test_floodseg_loss_ignores_unknown_palette_pixels(self):
        criterion = FloodSegDiceFocalLoss(num_classes=3)
        logits = torch.zeros((1, 3, 2, 2), requires_grad=True)
        targets = torch.tensor([[[1, IGNORE_INDEX], [2, IGNORE_INDEX]]])

        loss = criterion(logits, targets)
        loss.backward()

        self.assertTrue(torch.isfinite(loss))
        self.assertTrue(torch.isfinite(logits.grad).all())

    def test_audit_reports_missing_pairs_and_unknown_pixels(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            train_dir = root / "FloodNet-Supervised_v1.0" / "train"
            image_dir = train_dir / "train-org-img"
            mask_dir = root / "ColorMasks-FloodNetv1" / "ColorMasks-TrainSet"
            image_dir.mkdir(parents=True)
            mask_dir.mkdir(parents=True)
            (train_dir / "train-labeled-ids.txt").write_text(
                "image-a\nimage-b\nimage-c\n", encoding="utf-8"
            )
            Image.new("RGB", (2, 2)).save(image_dir / "image-a.jpg")
            Image.new("RGB", (2, 2)).save(
                image_dir / "image-c.jpg.part",
                format="JPEG",
            )
            Image.fromarray(
                np.array(
                    [
                        [(0, 0, 0), (255, 0, 0)],
                        [(0, 163, 255), (0, 0, 0)],
                    ],
                    dtype=np.uint8,
                )
            ).save(mask_dir / "image-a_lab.png")
            Image.fromarray(np.zeros((2, 2, 3), dtype=np.uint8)).save(
                mask_dir / "image-c_lab.png"
            )

            report = audit_dataset(root)
            train = report["splits"]["train"]

        self.assertEqual(report["official_train_manifest_count"], 3)
        self.assertEqual(train["image_file_count"], 1)
        self.assertEqual(train["mask_file_count"], 2)
        self.assertEqual(train["paired_id_count"], 1)
        self.assertEqual(train["missing_image_ids"], ["image-b", "image-c"])
        self.assertEqual(train["missing_mask_ids"], ["image-b"])
        self.assertEqual(train["unknown_pixel_count"], 1)
        self.assertEqual(train["unknown_rgb_pixel_counts"], {"0,163,255": 1})
        self.assertFalse(report["group_split_metadata_available"])


if __name__ == "__main__":
    unittest.main()
