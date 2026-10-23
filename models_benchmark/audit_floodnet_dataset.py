"""Audit local FloodNet image/mask pairing, palette coverage, and split overlap."""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "models_benchmark"))

from utils.dataset_loader import (  # noqa: E402
    COLOR_PALETTE,
    IGNORE_INDEX,
)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
PALETTE_BY_PACKED_RGB = {
    (color[0] << 16) | (color[1] << 8) | color[2]: (class_id, class_name)
    for class_id, (class_name, color) in COLOR_PALETTE.items()
}


def _files_by_id(directory, is_mask=False):
    directory = Path(directory)
    files = {}
    duplicates = []
    if not directory.is_dir():
        return files, duplicates

    for path in sorted(directory.iterdir()):
        if not path.is_file():
            continue
        if is_mask:
            if not path.name.endswith("_lab.png"):
                continue
            file_id = path.name[: -len("_lab.png")]
        else:
            if path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            file_id = path.stem

        if file_id in files:
            duplicates.append(file_id)
        else:
            files[file_id] = path
    return files, duplicates


def _readable_dimensions(path):
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        return image.size


def audit_split(name, image_dir, mask_dir, expected_ids=None):
    image_dir = Path(image_dir)
    mask_dir = Path(mask_dir)
    images, duplicate_images = _files_by_id(image_dir)
    masks, duplicate_masks = _files_by_id(mask_dir, is_mask=True)
    image_ids = set(images)
    mask_ids = set(masks)
    expected = set(expected_ids) if expected_ids is not None else None
    candidate_ids = expected if expected is not None else image_ids | mask_ids
    partial_files = (
        sorted(
            path.name
            for path in image_dir.iterdir()
            if path.is_file() and path.suffix.lower() == ".part"
        )
        if image_dir.is_dir()
        else []
    )

    missing_images = sorted(candidate_ids - image_ids)
    missing_masks = sorted(candidate_ids - mask_ids)
    paired_ids = sorted(candidate_ids & image_ids & mask_ids)
    invalid_images = []
    invalid_masks = []
    image_dimensions = Counter()
    mask_dimensions = Counter()
    class_pixel_counts = Counter()
    class_image_counts = Counter()
    unknown_color_counts = Counter()
    unknown_pixel_count = 0
    readable_pairs = 0

    for image_id in sorted(candidate_ids & image_ids):
        try:
            image_dimensions[str(_readable_dimensions(images[image_id]))] += 1
        except (OSError, ValueError) as exc:
            invalid_images.append({"id": image_id, "reason": str(exc)})

    for image_id in sorted(candidate_ids & mask_ids):
        try:
            with Image.open(masks[image_id]) as mask_file:
                mask_rgb = np.array(mask_file.convert("RGB"))
            mask_dimensions[str((mask_rgb.shape[1], mask_rgb.shape[0]))] += 1
            flat_rgb = mask_rgb.reshape(-1, 3).astype(np.uint32)
            packed_rgb = (flat_rgb[:, 0] << 16) | (flat_rgb[:, 1] << 8) | flat_rgb[:, 2]
            unique_colors, color_counts = np.unique(packed_rgb, return_counts=True)
            present_classes = set()
            for packed_color, pixel_count in zip(unique_colors, color_counts):
                palette_entry = PALETTE_BY_PACKED_RGB.get(int(packed_color))
                if palette_entry is not None:
                    class_id, class_name = palette_entry
                    class_pixel_counts[class_name] += int(pixel_count)
                    present_classes.add(class_id)
                else:
                    unknown_pixel_count += int(pixel_count)
                    rgb_color = (
                        int(packed_color >> 16),
                        int((packed_color >> 8) & 0xFF),
                        int(packed_color & 0xFF),
                    )
                    unknown_color_counts[rgb_color] += int(pixel_count)
            for class_id in present_classes:
                class_image_counts[COLOR_PALETTE[class_id][0]] += 1
        except (OSError, ValueError) as exc:
            invalid_masks.append({"id": image_id, "reason": str(exc)})

    invalid_image_ids = {entry["id"] for entry in invalid_images}
    invalid_mask_ids = {entry["id"] for entry in invalid_masks}
    readable_pairs = sum(
        image_id not in invalid_image_ids and image_id not in invalid_mask_ids
        for image_id in paired_ids
    )

    return {
        "split": name,
        "image_directory_exists": image_dir.is_dir(),
        "mask_directory_exists": mask_dir.is_dir(),
        "image_file_count": len(images),
        "mask_file_count": len(masks),
        "ignored_partial_file_count": len(partial_files),
        "ignored_partial_files": partial_files,
        "expected_id_count": len(expected) if expected is not None else None,
        "paired_id_count": len(paired_ids),
        "readable_pair_count": readable_pairs,
        "missing_image_ids": missing_images,
        "missing_mask_ids": missing_masks,
        "images_without_expected_masks": sorted(
            (image_ids & candidate_ids) - mask_ids
        ),
        "masks_without_expected_images": sorted(
            (mask_ids & candidate_ids) - image_ids
        ),
        "images_outside_expected_ids": (
            sorted(image_ids - expected) if expected is not None else []
        ),
        "masks_outside_expected_ids": (
            sorted(mask_ids - expected) if expected is not None else []
        ),
        "duplicate_image_ids": sorted(set(duplicate_images)),
        "duplicate_mask_ids": sorted(set(duplicate_masks)),
        "invalid_images": invalid_images,
        "invalid_masks": invalid_masks,
        "image_dimensions": dict(sorted(image_dimensions.items())),
        "mask_dimensions": dict(sorted(mask_dimensions.items())),
        "class_pixel_counts": dict(class_pixel_counts),
        "images_with_class_pixels": dict(class_image_counts),
        "unknown_pixel_count": unknown_pixel_count,
        "unknown_rgb_pixel_counts": {
            ",".join(map(str, color)): count
            for color, count in sorted(unknown_color_counts.items())
        },
    }


def audit_dataset(dataset_root):
    dataset_root = Path(dataset_root)
    train_dir = dataset_root / "FloodNet-Supervised_v1.0" / "train"
    manifest = train_dir / "train-labeled-ids.txt"
    if not manifest.is_file():
        raise FileNotFoundError(f"Official train-ID manifest not found: {manifest}")
    train_id_lines = [
        line.strip()
        for line in manifest.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    official_train_ids = set(train_id_lines)

    splits = {
        "train": audit_split(
            "train",
            train_dir / "train-org-img",
            dataset_root / "ColorMasks-FloodNetv1" / "ColorMasks-TrainSet",
            expected_ids=official_train_ids,
        ),
        "validation": audit_split(
            "validation",
            dataset_root / "FloodNet-Supervised_v1.0" / "val" / "val-org-img",
            dataset_root / "ColorMasks-FloodNetv1" / "ColorMasks-ValSet",
        ),
        "test": audit_split(
            "test",
            dataset_root / "FloodNet-Supervised_v1.0" / "test" / "test-org-img",
            dataset_root / "ColorMasks-FloodNetv1" / "ColorMasks-TestSet",
        ),
    }
    split_ids = {
        "train": official_train_ids,
        "validation": set(
            _files_by_id(
                dataset_root / "FloodNet-Supervised_v1.0" / "val" / "val-org-img"
            )[0]
        ),
        "test": set(
            _files_by_id(
                dataset_root / "FloodNet-Supervised_v1.0" / "test" / "test-org-img"
            )[0]
        ),
    }
    overlap = {}
    split_names = tuple(split_ids)
    for index, first in enumerate(split_names):
        for second in split_names[index + 1 :]:
            overlap[f"{first}_vs_{second}"] = sorted(
                split_ids[first] & split_ids[second]
            )

    return {
        "dataset": "FloodNet",
        "official_train_manifest_count": len(train_id_lines),
        "duplicate_train_manifest_ids": sorted(
            image_id
            for image_id, count in Counter(train_id_lines).items()
            if count > 1
        ),
        "splits": splits,
        "split_image_id_overlap": overlap,
        "group_split_metadata_available": False,
        "unknown_color_policy": (
            f"Exact documented RGB palette only; all other colors map to "
            f"ignore index {IGNORE_INDEX}."
        ),
        "notes": [
            "Only official labeled train IDs are eligible for training.",
            "Validation is used for model selection; test assets are never used for training.",
            "Files ending in .part are not treated as images.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset-root",
        type=Path,
        default=PROJECT_ROOT / "FloodNet",
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = audit_dataset(args.dataset_root)
    rendered = json.dumps(report, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
