import unittest

import numpy as np
from PIL import Image

from hf_space.segmentation import (
    build_overlay,
    map_ade20k_to_floodnet,
    summarize_mask,
)


class HuggingFaceSegmentationTests(unittest.TestCase):
    def test_maps_ade20k_classes_to_floodnet_style_labels(self):
        ade_mask = np.array([[21, 4, 1, 6, 20, 60, 9]], dtype=np.uint8)

        result = map_ade20k_to_floodnet(ade_mask)

        self.assertEqual(result.tolist(), [[5, 6, 1, 3, 7, 8, 9]])

    def test_builds_overlay_and_pixel_summary(self):
        image = Image.new("RGB", (2, 1), (100, 100, 100))
        mask = np.array([[5, 0]], dtype=np.uint8)

        overlay = build_overlay(image, mask)
        summary = summarize_mask(mask)

        self.assertEqual(overlay.size, image.size)
        self.assertNotEqual(overlay.getpixel((0, 0)), image.getpixel((0, 0)))
        self.assertEqual(summary["water"], {"pixels": 1, "percentage": 50.0})
        self.assertEqual(summary["background"], {"pixels": 1, "percentage": 50.0})

    def test_rejects_non_2d_semantic_mask(self):
        with self.assertRaises(ValueError):
            map_ade20k_to_floodnet(np.zeros((2, 2, 3), dtype=np.uint8))


if __name__ == "__main__":
    unittest.main()
