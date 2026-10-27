"""
06_segformer_finetune.py
========================
Fine-tunes SegFormer or optional SMP DeepLabV3+ on FloodNet's 10-class
semantic segmentation task. Runs on CUDA, Apple Silicon MPS, or CPU.

Training Setup:
  - Dataset  : Official FloodNet train split; official validation split for model selection
  - Model    : SegFormer-B3 head re-initialized for 10 FloodNet classes
  - Loss     : DiceFocalLoss (handles extreme class imbalance)
  - Augment  : paired flips, small rotations, and mild color jitter
  - Optimizer: AdamW + CosineAnnealingLR
  - Epochs   : configurable (default 30)
  - Output   : checkpoints/segformer_full/, results/segformer_full_finetune_results.json

Usage:
    python models_benchmark/06_segformer_finetune.py
    python models_benchmark/06_segformer_finetune.py --epochs 50 --batch_size 1
"""

import sys
import io
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
import json
import time
import argparse
import random
import numpy as np
from pathlib import Path
from PIL import Image, ImageEnhance

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from transformers import (
    SegformerImageProcessor,
    SegformerForSemanticSegmentation,
    SegformerConfig,
)

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "models_benchmark"))
from utils.metrics import (  # noqa: E402
    CLASS_NAMES_FLOODNET,
    metrics_from_confusion,
)
from utils.dataset_loader import IGNORE_INDEX, rgb_mask_to_class_ids  # noqa: E402

# ── Constants ────────────────────────────────────────────────────────────────
NUM_CLASSES = 10
IMG_SIZE = 512

CLASS_NAMES = list(CLASS_NAMES_FLOODNET.values())
ID2LABEL = {i: name for i, name in CLASS_NAMES_FLOODNET.items()}
LABEL2ID = {name: i for i, name in ID2LABEL.items()}


def seed_everything(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    if hasattr(torch.backends, "cudnn"):
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


def resolve_dataset_sources(dataset_root, img_dir=None, mask_dir=None):
    """Keep official validation images out of training for the FloodNet dataset."""
    if bool(img_dir) != bool(mask_dir):
        raise ValueError("--img_dir and --mask_dir must be provided together.")
    if img_dir:
        return [(Path(img_dir), Path(mask_dir))], None, "seeded_random_custom_split"

    dataset_root = Path(dataset_root)
    train_sources = [
        (
            dataset_root / "FloodNet-Supervised_v1.0" / "train" / "train-org-img",
            dataset_root / "ColorMasks-FloodNetv1" / "ColorMasks-TrainSet",
        )
    ]
    validation_sources = [
        (
            dataset_root / "FloodNet-Supervised_v1.0" / "val" / "val-org-img",
            dataset_root / "ColorMasks-FloodNetv1" / "ColorMasks-ValSet",
        )
    ]
    return train_sources, validation_sources, "official_train_official_validation"


def load_official_train_ids(dataset_root):
    manifest_path = (
        Path(dataset_root)
        / "FloodNet-Supervised_v1.0"
        / "train"
        / "train-labeled-ids.txt"
    )
    if not manifest_path.is_file():
        raise FileNotFoundError(
            "Official labeled train-ID manifest not found. Run "
            "models_benchmark/download_floodnet_train_images.py first."
        )
    image_ids = {
        line.strip()
        for line in manifest_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }
    if len(image_ids) != 398:
        raise ValueError(
            f"Expected 398 official labeled train IDs in {manifest_path}; "
            f"found {len(image_ids)}."
        )
    return image_ids


# ── Dataset ──────────────────────────────────────────────────────────────────
class FloodNetDataset(Dataset):
    """Loads labeled FloodNet image/mask pairs with paired augmentations."""

    def __init__(
        self,
        processor,
        img_size=512,
        sources=None,
        valid_pairs=None,
        augment=False,
        cache=None,
        allowed_stems=None,
    ):
        self.processor = processor
        self.img_size = img_size
        self.augment = augment
        self.valid_pairs = list(valid_pairs or [])
        self.cache = cache if cache is not None else {}
        self.skipped_pairs = []
        self.unmapped_pixel_count = 0

        for img_dir, mask_dir in sources or []:
            img_dir = Path(img_dir)
            mask_dir = Path(mask_dir)
            if not img_dir.is_dir():
                raise FileNotFoundError(f"FloodNet image directory not found: {img_dir}")
            if not mask_dir.is_dir():
                raise FileNotFoundError(f"FloodNet mask directory not found: {mask_dir}")

            for img_path in sorted(img_dir.iterdir()):
                if img_path.suffix.lower() not in {".jpg", ".png"}:
                    continue
                if allowed_stems is not None and img_path.stem not in allowed_stems:
                    continue
                mask_path = mask_dir / f"{img_path.stem}_lab.png"
                if (
                    mask_path.is_file()
                    and img_path.stat().st_size > 5000
                    and mask_path.stat().st_size > 500
                ):
                    self.valid_pairs.append((img_path, mask_path))

        self.unmapped_pixel_count = sum(
            int(np.count_nonzero(self.cache[(img_path, mask_path)][1] == IGNORE_INDEX))
            for img_path, mask_path in self.valid_pairs
        )
        for skipped_pair in self.skipped_pairs:
            print(
                f"[Dataset] Skipping unreadable pair "
                f"{skipped_pair['image']}: {skipped_pair['reason']}"
            )

        if not self.valid_pairs:
            raise ValueError("No valid FloodNet image-mask pairs were found.")
        print(
            f"[Dataset] {len(self.valid_pairs)} valid pairs | "
            f"augment={self.augment}"
        )

    def __len__(self):
        return len(self.valid_pairs)

    def _rgb_to_class(self, mask_rgb: np.ndarray) -> np.ndarray:
        return rgb_mask_to_class_ids(mask_rgb)

    def _load_pair(self, img_path, mask_path):
        with Image.open(img_path) as image_file:
            img = image_file.convert("RGB").resize(
                (self.img_size, self.img_size), Image.Resampling.BILINEAR
            )
        with Image.open(mask_path) as mask_file:
            mask_img = mask_file.convert("RGB").resize(
                (self.img_size, self.img_size), Image.Resampling.NEAREST
            )
        image_array = np.array(img, dtype=np.uint8, copy=True)
        class_mask = self._rgb_to_class(np.array(mask_img)).astype(np.uint8)
        return image_array, class_mask

    def __getitem__(self, idx):
        img_path, mask_path = self.valid_pairs[idx]
        cache_key = (img_path, mask_path)
        if cache_key not in self.cache:
            try:
                self.cache[cache_key] = self._load_pair(img_path, mask_path)
            except Exception:
                return self.__getitem__((idx + 1) % len(self.valid_pairs))
        image_array, class_mask = self.cache[cache_key]
        img = Image.fromarray(image_array)
        mask_img = Image.fromarray(class_mask)

        if self.augment:
            if random.random() < 0.5:
                img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                mask_img = mask_img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            if random.random() < 0.5:
                img = img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
                mask_img = mask_img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            angle = random.uniform(-10, 10)
            img = img.rotate(
                angle,
                resample=Image.Resampling.BILINEAR,
                fillcolor=(0, 0, 0),
            )
            mask_img = mask_img.rotate(
                angle,
                resample=Image.Resampling.NEAREST,
                fillcolor=IGNORE_INDEX,
            )
            img = ImageEnhance.Brightness(img).enhance(random.uniform(0.9, 1.1))
            img = ImageEnhance.Contrast(img).enhance(random.uniform(0.9, 1.1))
            img = ImageEnhance.Color(img).enhance(random.uniform(0.9, 1.1))

        class_mask = np.asarray(mask_img, dtype=np.int64)
        encoding = self.processor(images=img, return_tensors="pt")
        pixel_values = encoding["pixel_values"].squeeze(0)
        labels = torch.tensor(class_mask, dtype=torch.long)
        return pixel_values, labels, img_path.name


class ImageNetImageProcessor:
    def __init__(self):
        self.mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        self.std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)

    def __call__(self, images, return_tensors="pt"):
        image = np.asarray(images.convert("RGB"), dtype=np.float32) / 255.0
        tensor = torch.from_numpy(image.transpose(2, 0, 1).copy())
        tensor = (tensor - self.mean) / self.std
        if return_tensors != "pt":
            raise ValueError("ImageNetImageProcessor supports return_tensors='pt' only.")
        return {"pixel_values": tensor.unsqueeze(0)}


def get_image_processor(model_type, model_name):
    if model_type == "segformer":
        return SegformerImageProcessor.from_pretrained(
            model_name,
            do_resize=False,
            do_rescale=True,
            do_normalize=True,
        )
    if model_type == "deeplabv3plus":
        return ImageNetImageProcessor()
    raise ValueError(f"Unsupported segmentation model type: {model_type}")


def get_model_logits(model, pixel_values, model_type):
    outputs = (
        model(pixel_values=pixel_values)
        if model_type == "segformer"
        else model(pixel_values)
    )
    if hasattr(outputs, "logits"):
        return outputs.logits
    if isinstance(outputs, dict) and "out" in outputs:
        return outputs["out"]
    if isinstance(outputs, torch.Tensor):
        return outputs
    raise TypeError("Segmentation model must return logits or an 'out' tensor.")


# ── Loss: DiceFocalLoss ───────────────────────────────────────────────────────
class DiceFocalLoss(nn.Module):
    """Combined Dice + Focal loss for imbalanced multi-class segmentation."""

    def __init__(
        self,
        num_classes=10,
        alpha=0.25,
        gamma=2.0,
        dice_weight=0.5,
        class_weights=None,
    ):
        super().__init__()
def _lovasz_grad(gt_sorted):
    """Computes gradient of the Lovasz extension w.r.t sorted errors."""
    p = len(gt_sorted)
    gts = gt_sorted.sum()
    intersection = gts - gt_sorted.float().cumsum(0)
    union = gts + (1.0 - gt_sorted.float()).cumsum(0)
    jaccard = 1.0 - intersection / torch.clamp(union, min=1e-7)
    jaccard_diff = jaccard.clone()
    if p > 1:
        jaccard_diff[1:p] = jaccard[1:p] - jaccard[0:-1]
    return jaccard_diff


def _lovasz_softmax_flat(probas, labels, classes="present"):
    """
    Multi-class Lovasz-Softmax loss on flattened inputs.
    probas: [P, C] class probabilities at each pixel
    labels: [P] ground truth class indices
    """
    if probas.numel() == 0:
        return probas * 0.0

    C = probas.size(1)
    losses = []
    class_to_sum = list(range(C)) if classes in ("all", "present") else classes

    for c in class_to_sum:
        fg = (labels == c).float()
        if classes == "present" and fg.sum() == 0:
            continue
        errors = (fg - probas[:, c]).abs()
        errors_sorted, perm = torch.sort(errors, 0, descending=True)
        grad = _lovasz_grad(fg[perm]).detach()
        losses.append(torch.dot(errors_sorted, grad))

    if len(losses) == 0:
        return torch.tensor(0.0, device=probas.device, requires_grad=True)
    return torch.stack(losses).mean()


class LovaszSoftmaxLoss(nn.Module):
    """
    Lovasz-Softmax surrogate loss for Multi-Class Semantic Segmentation.
    Always computed in float32 for numerical stability.
    """
    def __init__(self, classes="present"):
        super().__init__()
        self.classes = classes

    def forward(self, logits, labels):
        probas = F.softmax(logits.float(), dim=1)
        return _lovasz_softmax_flat(
            probas.permute(0, 2, 3, 1).contiguous().view(-1, probas.size(1)),
            labels.view(-1),
            classes=self.classes,
        )


class CompoundIoULoss(nn.Module):
    """
    Combines Focal Loss (handling class frequencies) + Lovasz-Softmax (direct IoU booster).
    Always computed in float32 to prevent float16 overflow.
    """
    def __init__(self, class_weights=None, lovasz_weight=0.6, focal_gamma=2.0):
        super().__init__()
        self.lovasz_weight = lovasz_weight
        self.lovasz = LovaszSoftmaxLoss(classes="present")
        self.gamma = focal_gamma
        if class_weights is not None:
            self.register_buffer("weights", torch.as_tensor(class_weights, dtype=torch.float32))
        else:
            self.weights = None

    def forward(self, logits, targets):
        logits = logits.float()
        targets = targets.long()
        ce = F.cross_entropy(logits, targets, weight=self.weights, reduction="none")
        p = F.softmax(logits, dim=1)
        pt = p.gather(1, targets.unsqueeze(1)).squeeze(1)
        focal = ((1.0 - pt).clamp(0.0, 1.0) ** self.gamma) * ce
        focal_loss = focal.mean()

        lovasz_loss = self.lovasz(logits, targets)

        loss = (1.0 - self.lovasz_weight) * focal_loss + self.lovasz_weight * lovasz_loss
        return loss


class DiceFocalLoss(nn.Module):
    def __init__(
        self,
        num_classes,
        alpha=1.0,
        gamma=2.0,
        dice_weight=0.5,
        class_weights=None,
    ):
        super().__init__()
        self.num_classes = num_classes
        self.alpha = alpha
        self.gamma = gamma
        self.dice_weight = dice_weight
        self.focal_weight = 1.0 - dice_weight
        self.register_buffer(
            "class_weights",
            torch.as_tensor(class_weights, dtype=torch.float32)
            if class_weights is not None
            else None,
        )

    def focal_loss(self, logits, targets):
        valid = targets != IGNORE_INDEX
        if not valid.any():
            return logits.sum() * 0
        safe_targets = targets.masked_fill(~valid, 0)
        ce = F.cross_entropy(
            logits,
            targets,
            reduction="none",
            ignore_index=IGNORE_INDEX,
        )
        if self.class_weights is not None:
            ce = ce * self.class_weights[safe_targets]
        pt = torch.exp(-ce)
        focal = self.alpha * (1 - pt) ** self.gamma * ce
        return focal[valid].mean()

    def dice_loss(self, logits, targets):
        valid = targets != IGNORE_INDEX
        if not valid.any():
            return logits.sum() * 0
        probs = F.softmax(logits, dim=1)
        target_one_hot = torch.zeros_like(probs)
        safe_targets = targets.masked_fill(~valid, 0)
        target_one_hot.scatter_(1, safe_targets.unsqueeze(1), 1)
        valid_pixels = valid.unsqueeze(1)
        target_one_hot *= valid_pixels
        probs = probs * valid_pixels
        intersection = (probs * target_one_hot).sum(dim=(0, 2, 3))
        cardinality = (probs + target_one_hot).sum(dim=(0, 2, 3))
        dice_per_class = 1 - (2 * intersection + 1e-6) / (cardinality + 1e-6)
        return dice_per_class.mean()

    def forward(self, logits, targets):
        return (
            self.focal_weight * self.focal_loss(logits, targets)
            + self.dice_weight * self.dice_loss(logits, targets)
        )


def build_segmentation_loss(loss_type, class_weights=None):
    if loss_type == "cross_entropy":
        return nn.CrossEntropyLoss(ignore_index=IGNORE_INDEX)
    if loss_type == "weighted_cross_entropy":
        if class_weights is None:
            raise ValueError(
                "weighted_cross_entropy requires --class_weight_cap greater than 0."
            )
        return nn.CrossEntropyLoss(
            weight=torch.as_tensor(class_weights, dtype=torch.float32),
            ignore_index=IGNORE_INDEX,
        )
    if loss_type == "dice_focal":
        return DiceFocalLoss(
            num_classes=NUM_CLASSES,
            class_weights=class_weights,
        )
    raise ValueError(f"Unsupported segmentation loss: {loss_type}")


def build_class_balanced_sample_weights(dataset):
    """Weight images by the inverse square root of their class-presence counts."""
    class_image_counts = np.zeros(NUM_CLASSES, dtype=np.int64)
    image_classes = []
    for image_path, mask_path in dataset.valid_pairs:
        class_mask = dataset.cache[(image_path, mask_path)][1]
        present_classes = np.unique(class_mask)
        present_classes = present_classes[
            (present_classes >= 0) & (present_classes < NUM_CLASSES)
        ]
        image_classes.append(present_classes)
        class_image_counts[present_classes] += 1

    if not np.any(class_image_counts):
        raise ValueError("Training annotations contain no recognized class pixels.")

    inverse_sqrt_frequency = np.zeros(NUM_CLASSES, dtype=np.float64)
    present = class_image_counts > 0
    inverse_sqrt_frequency[present] = 1.0 / np.sqrt(class_image_counts[present])
    sample_weights = np.asarray(
        [inverse_sqrt_frequency[classes].mean() for classes in image_classes],
        dtype=np.float64,
    )
    if not np.isfinite(sample_weights).all() or np.any(sample_weights <= 0):
        raise ValueError("Unable to calculate valid class-balanced sample weights.")

    return (
        torch.as_tensor(sample_weights, dtype=torch.double),
        class_image_counts.tolist(),
    )


# ── Trainer ───────────────────────────────────────────────────────────────────
class SegFormerTrainer:
    def __init__(self, args):
        if args.epochs < 1:
            raise ValueError("--epochs must be at least 1.")
        if args.batch_size < 1:
            raise ValueError("--batch_size must be at least 1.")
        if args.model_type == "deeplabv3plus" and args.batch_size < 2:
            raise ValueError(
                "DeepLabV3+ requires --batch_size of at least 2 because its "
                "pooled decoder branch uses batch normalization."
            )
        if args.grad_accum_steps < 1:
            raise ValueError("--grad_accum_steps must be at least 1.")
        if args.save_every < 1:
            raise ValueError("--save_every must be at least 1.")
        if args.img_size < 32:
            raise ValueError("--img_size must be at least 32.")
        if args.lr <= 0:
            raise ValueError("--lr must be greater than 0.")
        if args.class_weight_cap < 0:
            raise ValueError("--class_weight_cap cannot be negative.")
        if args.sampling_strategy not in {"uniform", "class_balanced"}:
            raise ValueError(
                "--sampling_strategy must be 'uniform' or 'class_balanced'."
            )
        if not 0 < args.val_fraction < 1:
            raise ValueError("--val_fraction must be between 0 and 1.")
        if args.min_delta < 0:
            raise ValueError("--min_delta cannot be negative.")
        if args.early_stopping_patience < 0:
            raise ValueError("--early_stopping_patience cannot be negative.")
        if args.max_train_batches < 0:
            raise ValueError("--max_train_batches cannot be negative.")
        if args.loss_type == "weighted_cross_entropy" and args.class_weight_cap <= 0:
            raise ValueError(
                "weighted_cross_entropy requires --class_weight_cap greater than 0."
            )

        self.args = args
        self.device = self._pick_device()
        print(f"[SegFormerTrainer] Device: {self.device}")

        self.ckpt_dir = Path(args.checkpoint_dir)
        if not self.ckpt_dir.is_absolute():
            self.ckpt_dir = PROJECT_ROOT / self.ckpt_dir
        self.ckpt_dir.mkdir(parents=True, exist_ok=True)
        self.best_checkpoint_name = (
            "segformer_best.pt"
            if args.model_type == "segformer"
            else "deeplabv3plus_best.pt"
        )
        self.best_checkpoint_path = self.ckpt_dir / self.best_checkpoint_name
        self.results_path = Path(args.results_file)
        if not self.results_path.is_absolute():
            self.results_path = PROJECT_ROOT / self.results_path
        self.results_path.parent.mkdir(parents=True, exist_ok=True)

        seed_everything(args.seed)
        if args.deterministic:
            torch.use_deterministic_algorithms(True, warn_only=True)
        else:
            torch.use_deterministic_algorithms(False)

        self.processor = get_image_processor(args.model_type, args.model_name)

        train_sources, validation_sources, self.split_strategy = resolve_dataset_sources(
            args.dataset_root,
            args.img_dir,
            args.mask_dir,
        )
        if validation_sources is not None:
            official_train_ids = load_official_train_ids(args.dataset_root)
            train_ds = FloodNetDataset(
                processor=self.processor,
                img_size=args.img_size,
                sources=train_sources,
                augment=True,
                allowed_stems=official_train_ids,
            )
            val_ds = FloodNetDataset(
                processor=self.processor,
                img_size=args.img_size,
                sources=validation_sources,
            )
            self.skipped_pairs = train_ds.skipped_pairs + val_ds.skipped_pairs
        else:
            full_ds = FloodNetDataset(
                processor=self.processor,
                img_size=args.img_size,
                sources=train_sources,
            )
            if len(full_ds) < 2:
                raise ValueError("At least two valid image-mask pairs are required.")
            n_val = max(1, int(args.val_fraction * len(full_ds)))
            n_train = len(full_ds) - n_val
            indices = list(range(len(full_ds)))
            random.Random(args.seed).shuffle(indices)
            train_pairs = [full_ds.valid_pairs[i] for i in indices[:n_train]]
            val_pairs = [full_ds.valid_pairs[i] for i in indices[n_train:]]
            train_ds = FloodNetDataset(
                processor=self.processor,
                img_size=args.img_size,
                valid_pairs=train_pairs,
                augment=True,
                cache=full_ds.cache,
            )
            val_ds = FloodNetDataset(
                processor=self.processor,
                img_size=args.img_size,
                valid_pairs=val_pairs,
                cache=full_ds.cache,
            )
            self.skipped_pairs = full_ds.skipped_pairs

        if len(train_ds) < 2:
            raise ValueError("At least two valid training image-mask pairs are required.")
        if len(val_ds) < 1:
            raise ValueError("At least one valid validation image-mask pair is required.")
        self.class_image_counts = None
        self.sample_weights = None
        sampler = None
        if args.sampling_strategy == "class_balanced":
            self.sample_weights, self.class_image_counts = (
                build_class_balanced_sample_weights(train_ds)
            )
            sampler = WeightedRandomSampler(
                self.sample_weights,
                num_samples=len(train_ds),
                replacement=True,
                generator=torch.Generator().manual_seed(args.seed),
            )
        self.train_loader = DataLoader(
            train_ds,
            batch_size=args.batch_size,
            shuffle=sampler is None,
            sampler=sampler,
            num_workers=0,
        )
        self.val_loader = DataLoader(val_ds, batch_size=1, shuffle=False, num_workers=0)
        self.dataset_pair_count = len(train_ds) + len(val_ds)
        self.train_unmapped_pixel_count = train_ds.unmapped_pixel_count
        self.validation_unmapped_pixel_count = val_ds.unmapped_pixel_count
        print(
            f"[SegFormerTrainer] Split={self.split_strategy} | "
            f"Total={self.dataset_pair_count} | "
            f"Train={len(train_ds)} | Val={len(val_ds)}"
        )

        self.model = self._build_model(args.model_name)
        if args.init_checkpoint:
            init_checkpoint = Path(args.init_checkpoint)
            if not init_checkpoint.is_absolute():
                init_checkpoint = PROJECT_ROOT / init_checkpoint
            if not init_checkpoint.is_file():
                raise FileNotFoundError(
                    f"Initialization checkpoint not found: {init_checkpoint}"
                )
            checkpoint_state = torch.load(
                init_checkpoint,
                map_location="cpu",
                weights_only=True,
            )
            if "model_state_dict" in checkpoint_state:
                checkpoint_state = checkpoint_state["model_state_dict"]
            self.model.load_state_dict(checkpoint_state)
            print(f"[SegFormerTrainer] Warm-started from {init_checkpoint}")
        self.model.to(self.device)

        class_weights = self._get_class_weights(
            train_ds,
            max_weight=(
                args.class_weight_cap
                if args.loss_type != "cross_entropy"
                else 0
            ),
        )
        self.class_weights = class_weights
        self.criterion = build_segmentation_loss(
            args.loss_type,
            class_weights=class_weights,
        ).to(self.device)
        self.optimizer = torch.optim.AdamW(
            self.model.parameters(), lr=args.lr, weight_decay=1e-4
        )
        self.scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer, T_max=args.epochs, eta_min=1e-6
        )

        self.history = {
            "train_loss": [],
            "val_mIoU": [],
            "val_pixel_acc": [],
            "epoch_times": [],
            "epochs": [],
        }
        self.model_parameter_count = sum(
            parameter.numel() for parameter in self.model.parameters()
        )
        self.best_miou = float("-inf")
        self.best_epoch = 0
        self.epochs_without_improvement = 0
        self.training_start_time = None

    @staticmethod
    def _get_class_weights(dataset, max_weight):
        if max_weight <= 0:
            return None

        counts = np.zeros(NUM_CLASSES, dtype=np.int64)
        # Sample up to 100 images to quickly estimate balanced class frequencies without blocking
        sample_pairs = dataset.valid_pairs[:100] if len(dataset.valid_pairs) > 100 else dataset.valid_pairs
        for img_path, mask_path in sample_pairs:
            cache_key = (img_path, mask_path)
            if cache_key in dataset.cache:
                class_mask = dataset.cache[cache_key][1]
            else:
                try:
                    with Image.open(mask_path) as mask_file:
                        mask_img = mask_file.convert("RGB").resize(
                            (dataset.img_size, dataset.img_size), Image.Resampling.NEAREST
                        )
                    class_mask = dataset._rgb_to_class(np.array(mask_img)).astype(np.uint8)
                except Exception:
                    continue
            counts += np.bincount(
                class_mask.ravel(),
                minlength=NUM_CLASSES,
            )[:NUM_CLASSES]

        if counts.sum() == 0:
            raise ValueError("Training annotations contain no recognized class pixels.")
        present = counts > 0
        frequencies = counts[present] / counts.sum()
        reference_frequency = np.median(frequencies)
        weights = np.ones(NUM_CLASSES, dtype=np.float32)
        weights[present] = np.sqrt(reference_frequency / frequencies)
        weights = np.clip(weights, 1.0 / max_weight, max_weight)
        weights /= weights.mean()
        print(
            "[SegFormerTrainer] Class-balanced loss weights: "
            + ", ".join(f"{weight:.2f}" for weight in weights)
        )
        return weights.tolist()

    def _pick_device(self):
        if torch.backends.mps.is_available():
            return torch.device("mps")
        if torch.cuda.is_available():
            return torch.device("cuda")
        return torch.device("cpu")

    def _build_model(self, model_name):
        if self.args.model_type == "segformer":
            print(f"[SegFormerTrainer] Loading '{model_name}' ...")
            config = SegformerConfig.from_pretrained(model_name)
            config.num_labels = NUM_CLASSES
            config.id2label = ID2LABEL
            config.label2id = LABEL2ID
            model = SegformerForSemanticSegmentation.from_pretrained(
                model_name,
                config=config,
                ignore_mismatched_sizes=True,
            )
            print(f"  Decode head re-initialised for {NUM_CLASSES} FloodNet classes.")
            return model
        if self.args.model_type == "deeplabv3plus":
            try:
                import segmentation_models_pytorch as smp
            except ImportError as exc:
                raise ImportError(
                    "DeepLabV3+ experiments require "
                    "requirements-segmentation-experiments.txt."
                ) from exc
            print(
                "[SegFormerTrainer] Building SMP DeepLabV3+ with "
                f"{self.args.encoder_name} encoder initialized from "
                f"{self.args.encoder_weights}."
            )
            return smp.DeepLabV3Plus(
                encoder_name=self.args.encoder_name,
                encoder_weights=self.args.encoder_weights,
                in_channels=3,
                classes=NUM_CLASSES,
            )
        raise ValueError(f"Unsupported segmentation model type: {self.args.model_type}")

    def _train_one_epoch(self, epoch):
        self.model.train()
        total_loss = 0.0
        accum_steps = self.args.grad_accum_steps
        if accum_steps < 1:
            raise ValueError("--grad_accum_steps must be at least 1.")
        self.optimizer.zero_grad()
        epoch_batches = (
            min(self.args.max_train_batches, len(self.train_loader))
            if self.args.max_train_batches
            else len(self.train_loader)
        )
        for i, (pixel_values, labels, _) in enumerate(self.train_loader):
            if i >= epoch_batches:
                break
            pixel_values = pixel_values.to(self.device)
            labels = labels.to(self.device)

            logits = get_model_logits(
                self.model,
                pixel_values,
                self.args.model_type,
            )
            upsampled = F.interpolate(logits, size=labels.shape[-2:],
                                      mode="bilinear", align_corners=False)
            loss = self.criterion(upsampled, labels)
            group_start = (i // accum_steps) * accum_steps
            group_size = min(accum_steps, epoch_batches - group_start)
            (loss / group_size).backward()

            if (i + 1) % accum_steps == 0 or (i + 1) == epoch_batches:
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
                scaler.step(self.optimizer)
                scaler.update()
                self.optimizer.zero_grad()

            total_loss += loss.item()
            if (i + 1) % (40 * accum_steps) == 0:
                print(f"  [{i+1}/{epoch_batches}] loss={loss.item():.4f}")
        return total_loss / epoch_batches

    @torch.no_grad()
    def _validate(self):
        self.model.eval()
        confusion = torch.zeros((NUM_CLASSES, NUM_CLASSES), dtype=torch.int64)
        for pixel_values, labels, _ in self.val_loader:
            pixel_values = pixel_values.to(self.device)
            logits = get_model_logits(
                self.model,
                pixel_values,
                self.args.model_type,
            )
            upsampled = F.interpolate(logits, size=labels.shape[-2:],
                                      mode="bilinear", align_corners=False).contiguous()
            pred = upsampled.argmax(dim=1).view(-1).cpu()
            gt = labels.view(-1).cpu()
            valid = gt != IGNORE_INDEX
            batch_confusion = torch.bincount(
                gt[valid] * NUM_CLASSES + pred[valid],
                minlength=NUM_CLASSES**2,
            ).reshape(NUM_CLASSES, NUM_CLASSES)
            confusion += batch_confusion

        metrics = metrics_from_confusion(
            confusion.numpy(),
            CLASS_NAMES_FLOODNET,
        )
        return metrics

    def _save_checkpoint(self, epoch, miou, is_best=False):
        if epoch % self.args.save_every == 0:
            path = self.ckpt_dir / (
                f"{self.args.model_type}_ep{epoch:03d}_miou{miou:.4f}.pt"
            )
            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": self.model.state_dict(),
                    "miou": miou,
                },
                path,
            )
        if is_best:
            best_path = self.best_checkpoint_path
            temporary_path = best_path.with_suffix(".pt.tmp")
            torch.save(self.model.state_dict(), temporary_path)
            temporary_path.replace(best_path)
            print(f"  ★ Best mIoU={miou:.4f} checkpoint saved")

    def train(self):
        print("\n" + "=" * 60)
        print(
            f"  SegFormer Fine-Tuning on FloodNet "
            f"({self.args.model_name}, {self.args.loss_type})"
        )
        print("=" * 60)
        self.training_start_time = time.perf_counter()

        last_val_m = {"mIoU": 0.0, "overall_pixel_accuracy": 0.0, "macro_f1": 0.0, "per_class": {}}
        for epoch in range(1, self.args.epochs + 1):
            t0 = time.time()
            learning_rate = self.optimizer.param_groups[0]["lr"]
            train_loss = self._train_one_epoch(epoch)
            self.scheduler.step()

            should_val = (epoch % getattr(self.args, "val_interval", 1) == 0) or (epoch == self.args.epochs)
            if should_val:
                val_m = self._validate()
                last_val_m = val_m
                is_best = val_m["mIoU"] > self.best_miou + self.args.min_delta
                if is_best:
                    self.best_miou = val_m["mIoU"]
                    self.best_epoch = epoch
                    self.epochs_without_improvement = 0
                else:
                    self.epochs_without_improvement += 1
            else:
                val_m = last_val_m
                is_best = False

            elapsed = time.time() - t0
            self.history["train_loss"].append(round(train_loss, 4))
            self.history["val_mIoU"].append(round(val_m["mIoU"], 4))
            self.history["val_pixel_acc"].append(round(val_m["overall_pixel_accuracy"], 4))
            self.history["epoch_times"].append(round(elapsed, 2))
            self.history["epochs"].append(
                {
                    "epoch": epoch,
                    "train_loss": train_loss,
                    "validation_metrics": val_m,
                    "learning_rate": learning_rate,
                    "runtime_seconds": elapsed,
                }
            )

            if epoch % self.args.save_every == 0 or is_best:
                self._save_checkpoint(epoch, val_m["mIoU"], is_best)

            print(
                f"[Ep {epoch:3d}/{self.args.epochs}] "
                f"Loss={train_loss:.4f}  mIoU={val_m['mIoU']:.4f}  "
                f"Acc={val_m['overall_pixel_accuracy']:.4f}  "
                f"F1={val_m['macro_f1']:.4f}  {elapsed:.1f}s"
            )

            if epoch % 5 == 0:
                print("  Per-class IoU:")
                for cname, cm in val_m["per_class"].items():
                    print(f"    {cname:<28} IoU={cm['iou']:.4f}  F1={cm['f1_score']:.4f}")
                print()

            if (
                self.args.early_stopping_patience > 0
                and self.epochs_without_improvement >= self.args.early_stopping_patience
            ):
                print(
                    f"Early stopping after {epoch} epochs; "
                    f"best validation mIoU was {self.best_miou:.4f} "
                    f"at epoch {self.best_epoch}."
                )
                break

        return self._save_results()

    def _save_results(self):
        best_checkpoint = self.best_checkpoint_path
        if not best_checkpoint.is_file():
            raise RuntimeError("Training did not produce a best-model checkpoint.")
        self.model.load_state_dict(
            torch.load(best_checkpoint, map_location=self.device, weights_only=True)
        )
        final = self._validate()
        total_training_seconds = (
            time.perf_counter() - self.training_start_time
            if self.training_start_time is not None
            else None
        )
        model_name = self.args.model_name
        if self.args.model_type == "deeplabv3plus":
            architecture = (
                f"DeepLabV3Plus/{self.args.encoder_name}"
            )
            pretrained_initialization = (
                f"segmentation-models-pytorch {self.args.encoder_name} "
                f"encoder_weights={self.args.encoder_weights}"
            )
        else:
            architecture = model_name.rsplit("/", 1)[-1]
            pretrained_initialization = model_name
        if self.args.max_train_batches:
            run_type = "smoke_test"
        else:
            run_type = "full_training"
        output = {
            "model": f"{architecture} fine-tuned on FloodNet",
            "architecture": architecture,
            "model_type": self.args.model_type,
            "pretrained_initialization": pretrained_initialization,
            "initialization_checkpoint": self.args.init_checkpoint,
            "checkpoint": str(best_checkpoint),
            "run_type": run_type,
            "epochs_trained": len(self.history["train_loss"]),
            "best_epoch": self.best_epoch,
            "best_val_mIoU": round(self.best_miou, 4),
            "training_seconds": total_training_seconds,
            "device": str(self.device),
            "parameter_count": self.model_parameter_count,
            "mps_allocated_bytes_after_training": (
                torch.mps.current_allocated_memory()
                if self.device.type == "mps"
                else None
            ),
            "mps_driver_allocated_bytes_after_training": (
                torch.mps.driver_allocated_memory()
                if self.device.type == "mps"
                else None
            ),
            "validation_metric_scope": (
                "Official validation split used for model selection; not an "
                "independent test result."
            ),
            "test_metrics_available": False,
            "final_val_metrics": {
                "mIoU": round(final["mIoU"], 4),
                "macro_f1": round(final["macro_f1"], 4),
                "macro_precision": round(final["macro_precision"], 4),
                "macro_recall": round(final["macro_recall"], 4),
                "frequency_weighted_iou": round(final["frequency_weighted_iou"], 4),
                "overall_pixel_accuracy": round(final["overall_pixel_accuracy"], 4),
                "per_class": {
                    k: {
                        m: round(v, 4) if isinstance(v, float) else v
                        for m, v in vals.items()
                    }
                    for k, vals in final["per_class"].items()
                },
            },
            "dataset_pair_count": self.dataset_pair_count,
            "split_strategy": self.split_strategy,
            "train_label_policy": (
                "official_labeled_train_ids_only"
                if self.split_strategy == "official_train_official_validation"
                else "custom_seeded_split"
            ),
            "train_image_count": len(self.train_loader.dataset),
            "validation_image_count": len(self.val_loader.dataset),
            "train_image_ids": sorted(
                Path(image_path).stem
                for image_path, _ in self.train_loader.dataset.valid_pairs
            ),
            "validation_image_ids": sorted(
                Path(image_path).stem
                for image_path, _ in self.val_loader.dataset.valid_pairs
            ),
            "train_unmapped_pixel_count": self.train_unmapped_pixel_count,
            "validation_unmapped_pixel_count": self.validation_unmapped_pixel_count,
            "class_weights": self.class_weights,
            "sampling_strategy": self.args.sampling_strategy,
            "class_image_counts": self.class_image_counts,
            "sample_weights": (
                self.sample_weights.tolist()
                if self.sample_weights is not None
                else None
            ),
            "unknown_mask_color_policy": "ignore_index_255_exact_rgb",
            "determinism_note": (
                "Python, NumPy, and Torch seeds set; deterministic Torch "
                "algorithms requested with warn_only=True. Backend kernels may "
                "remain nondeterministic."
                if self.args.deterministic
                else "Random seeds set; deterministic Torch algorithms disabled."
            ),
            "skipped_pairs": self.skipped_pairs,
            "training_history": self.history,
            "config": vars(self.args),
        }
        with open(self.results_path, "w") as f:
            json.dump(output, f, indent=2)

        print("\n" + "=" * 60)
        print("  DONE — SegFormer Fine-Tuning")
        print(f"  Best mIoU : {self.best_miou:.4f}  ({self.best_miou*100:.2f}%)")
        print(f"  Final mIoU: {final['mIoU']:.4f}")
        print(f"  Results   : {self.results_path}")
        print("=" * 60)
        return output


def parse_args():
    config_parser = argparse.ArgumentParser(add_help=False)
    config_parser.add_argument("--config")
    config_args, _ = config_parser.parse_known_args()
    config_defaults = {}
    if config_args.config:
        config_path = Path(config_args.config)
        if not config_path.is_absolute():
            config_path = PROJECT_ROOT / config_path
        with config_path.open(encoding="utf-8") as config_file:
            config_defaults = json.load(config_file)

    p = argparse.ArgumentParser()
    p.add_argument("--config", default=config_args.config)
    p.add_argument(
        "--model_type",
        choices=("segformer", "deeplabv3plus"),
        default="segformer",
    )
    p.add_argument("--model_name", default="nvidia/mit-b3")
    p.add_argument("--encoder_name", default="resnet50")
    p.add_argument("--encoder_weights", default="imagenet")
    p.add_argument("--dataset_root", default=str(PROJECT_ROOT / "FloodNet"))
    p.add_argument("--img_dir", default=None)
    p.add_argument("--mask_dir", default=None)
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch_size", type=int, default=1)
    p.add_argument("--grad_accum_steps", type=int, default=4)
    p.add_argument("--lr", type=float, default=6e-5)
    p.add_argument(
        "--loss_type",
        choices=("cross_entropy", "weighted_cross_entropy", "dice_focal"),
        default="dice_focal",
    )
    p.add_argument(
        "--sampling_strategy",
        choices=("uniform", "class_balanced"),
        default="uniform",
        help="Optionally oversample images containing less frequent classes.",
    )
    p.add_argument(
        "--init_checkpoint",
        default=None,
        help="Optional SegFormer state_dict checkpoint to fine-tune from.",
    )
    p.add_argument(
        "--class_weight_cap",
        type=float,
        default=0.0,
        help=(
            "Enable capped inverse-square-root class-frequency weights for the "
            "focal loss; 0 disables class weighting."
        ),
    )
    p.add_argument("--img_size", type=int, default=512)
    p.add_argument("--val_fraction", type=float, default=0.2)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--min_delta", type=float, default=0.001)
    p.add_argument("--early_stopping_patience", type=int, default=8)
    p.add_argument(
        "--max_train_batches",
        type=int,
        default=0,
        help="Limit batches per epoch for a smoke test; 0 uses the full training set.",
    )
    p.add_argument(
        "--deterministic",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Request deterministic Torch algorithms where available.",
    )
    p.add_argument("--checkpoint_dir", default="checkpoints/segformer_full")
    p.add_argument(
        "--results_file",
        default="results/segformer_full_finetune_results.json",
    )
    p.add_argument("--save_every", type=int, default=5)
    p.set_defaults(**config_defaults)
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    trainer = SegFormerTrainer(args)
    trainer.train()
