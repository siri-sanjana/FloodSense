"""Lightweight post-processing for the Hugging Face segmentation trial."""

import cv2
import numpy as np
from PIL import Image

CLASS_NAMES = {
    0: "background",
    1: "building-flooded",
    2: "building-non-flooded",
    3: "road-flooded",
    4: "road-non-flooded",
    5: "water",
    6: "tree",
    7: "vehicle",
    8: "pool",
    9: "grass",
}

CLASS_COLORS = {
    0: (0, 0, 0),
    1: (255, 0, 0),
    2: (180, 120, 120),
    3: (160, 150, 20),
    4: (140, 140, 140),
    5: (61, 230, 250),
    6: (0, 82, 255),
    7: (255, 0, 245),
    8: (255, 235, 0),
    9: (4, 250, 7),
}


def map_ade20k_to_floodnet(ade_mask):
    """Map selected ADE20K classes to FloodNet-style classes."""
    ade_mask = np.asarray(ade_mask)
    if ade_mask.ndim != 2:
        raise ValueError("Expected a two-dimensional ADE20K class mask.")

    class_mask = np.zeros(ade_mask.shape, dtype=np.uint8)
    water = np.isin(ade_mask, [21, 26, 113, 128])
    pool = np.isin(ade_mask, [60, 61])
    tree = np.isin(ade_mask, [4, 17, 66])
    grass = np.isin(ade_mask, [9, 29, 46])
    vehicle = np.isin(ade_mask, [20, 80, 83, 102, 103, 116])
    building = np.isin(ade_mask, [1, 25, 48, 84])
    road = np.isin(ade_mask, [6, 11, 13, 52])

    class_mask[tree] = 6
    class_mask[grass] = 9
    class_mask[vehicle] = 7
    class_mask[pool] = 8
    class_mask[water] = 5

    if np.any(water):
        water_distance = cv2.distanceTransform(
            (~water).astype(np.uint8),
            cv2.DIST_L2,
            5,
        )
        class_mask[building & (water_distance >= 25)] = 2
        class_mask[building & (water_distance < 25)] = 1
        class_mask[road & (water_distance >= 20)] = 4
        class_mask[road & (water_distance < 20)] = 3
    else:
        class_mask[building] = 2
        class_mask[road] = 4

    return class_mask


def build_overlay(image, class_mask, opacity=0.55):
    """Blend class colors over the source image."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    if class_mask.shape != rgb.shape[:2]:
        class_mask = cv2.resize(
            class_mask,
            (rgb.shape[1], rgb.shape[0]),
            interpolation=cv2.INTER_NEAREST,
        )

    color_mask = np.zeros_like(rgb)
    for class_id, color in CLASS_COLORS.items():
        color_mask[class_mask == class_id] = color

    visible = class_mask != 0
    result = rgb.copy()
    result[visible] = (
        rgb[visible].astype(np.float32) * (1 - opacity)
        + color_mask[visible].astype(np.float32) * opacity
    ).astype(np.uint8)
    return Image.fromarray(result)


def summarize_mask(class_mask):
    """Return per-class pixel counts and percentages."""
    total_pixels = int(class_mask.size)
    return {
        CLASS_NAMES[class_id]: {
            "pixels": int(np.count_nonzero(class_mask == class_id)),
            "percentage": round(
                float(np.count_nonzero(class_mask == class_id) / total_pixels * 100),
                2,
            ),
        }
        for class_id in CLASS_NAMES
    }
