import unittest

import numpy as np

from models_benchmark.utils.metrics import (
    aggregate_metrics,
    aggregate_multiclass_metrics,
    compute_multiclass_metrics,
    compute_segmentation_metrics,
)


class SegmentationMetricTests(unittest.TestCase):
    def test_absent_classes_do_not_count_as_perfect(self):
        metrics = compute_multiclass_metrics(
            np.array([[0, 0]], dtype=np.uint8),
            np.array([[0, 0]], dtype=np.uint8),
            num_classes=3,
            class_names={0: "Class_0", 1: "Class_1", 2: "Class_2"},
        )

        self.assertEqual(metrics["mIoU"], 1.0)
        self.assertEqual(metrics["per_class"]["Class_1"]["iou"], 0.0)
        self.assertEqual(metrics["per_class"]["Class_2"]["f1_score"], 0.0)

    def test_false_positive_for_absent_ground_truth_class_is_penalized(self):
        metrics = compute_multiclass_metrics(
            np.array([[0, 1]], dtype=np.uint8),
            np.array([[0, 0]], dtype=np.uint8),
            num_classes=2,
            class_names={0: "Class_0", 1: "Class_1"},
        )

        self.assertEqual(metrics["mIoU"], 0.25)
        self.assertEqual(metrics["per_class"]["Class_1"]["iou"], 0.0)

    def test_multiclass_aggregation_uses_combined_confusion_counts(self):
        results = [
            compute_multiclass_metrics(
                np.array([[0]], dtype=np.uint8),
                np.array([[0]], dtype=np.uint8),
                num_classes=2,
                class_names={0: "Class_0", 1: "Class_1"},
            ),
            compute_multiclass_metrics(
                np.array([[1, 1, 1]], dtype=np.uint8),
                np.array([[0, 0, 0]], dtype=np.uint8),
                num_classes=2,
                class_names={0: "Class_0", 1: "Class_1"},
            ),
        ]

        aggregated = aggregate_multiclass_metrics(results)

        self.assertEqual(aggregated["mIoU"], 0.125)
        self.assertEqual(aggregated["overall_pixel_accuracy"], 0.25)
        self.assertEqual(aggregated["per_class"]["Class_1"]["iou"], 0.0)

    def test_binary_aggregation_uses_pixel_counts(self):
        results = [
            compute_segmentation_metrics(
                np.array([[1]], dtype=np.uint8),
                np.array([[1]], dtype=np.uint8),
            ),
            compute_segmentation_metrics(
                np.array([[0, 0, 0]], dtype=np.uint8),
                np.array([[1, 1, 1]], dtype=np.uint8),
            ),
        ]

        aggregated = aggregate_metrics(results)

        self.assertEqual(aggregated["iou"], 0.25)
        self.assertEqual(aggregated["pixel_accuracy"], 0.25)

    def test_invalid_shapes_and_class_ids_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "same shape"):
            compute_multiclass_metrics(
                np.zeros((2, 2), dtype=np.uint8),
                np.zeros((2, 3), dtype=np.uint8),
            )
        with self.assertRaisesRegex(ValueError, "range"):
            compute_multiclass_metrics(
                np.array([[10]], dtype=np.uint8),
                np.array([[0]], dtype=np.uint8),
            )


if __name__ == "__main__":
    unittest.main()
