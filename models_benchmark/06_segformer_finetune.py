"""
06_segformer_finetune.py
========================
Fine-tunes SegFormer-B3 (nvidia/mit-b3) on the FloodNet dataset (10-class
semantic segmentation). Runs on Apple Silicon MPS or CPU if CUDA unavailable.

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
from torch.utils.data import Dataset, DataLoader
from transformers import (
    SegformerImageProcessor,
    SegformerForSemanticSegmentation,
    SegformerConfig,
)

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "models_benchmark"))
from utils.metrics import (
    CLASS_NAMES_FLOODNET,
)

# ── Constants ────────────────────────────────────────────────────────────────
NUM_CLASSES = 10
IMG_SIZE = 512

# FloodNet RGB color palette (color mask -> class index)
COLOR_PALETTE = {
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

CLASS_NAMES = list(CLASS_NAMES_FLOODNET.values())
ID2LABEL = {i: name for i, name in CLASS_NAMES_FLOODNET.items()}
LABEL2ID = {name: i for i, name in ID2LABEL.items()}


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
        h, w = mask_rgb.shape[:2]
        class_mask = np.zeros((h, w), dtype=np.int64)
        for class_id, color in COLOR_PALETTE.items():
            color_arr = np.array(color, dtype=np.uint8)
            match = np.all(
                np.abs(mask_rgb.astype(int) - color_arr.astype(int)) <= 15, axis=-1
            )
            class_mask[match] = class_id
        return class_mask

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
                fillcolor=0,
            )
            img = ImageEnhance.Brightness(img).enhance(random.uniform(0.9, 1.1))
            img = ImageEnhance.Contrast(img).enhance(random.uniform(0.9, 1.1))
            img = ImageEnhance.Color(img).enhance(random.uniform(0.9, 1.1))

        class_mask = np.asarray(mask_img, dtype=np.int64)
        encoding = self.processor(images=img, return_tensors="pt")
        pixel_values = encoding["pixel_values"].squeeze(0)
        labels = torch.tensor(class_mask, dtype=torch.long)
        return pixel_values, labels, img_path.name


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
        ce = F.cross_entropy(logits, targets, weight=self.class_weights, reduction="none")
        p = F.softmax(logits, dim=1)
        pt = p.gather(1, targets.unsqueeze(1)).squeeze(1)
        focal = self.alpha * (1 - pt) ** self.gamma * ce
        return focal.mean()

    def dice_loss(self, logits, targets):
        probs = F.softmax(logits, dim=1)
        N, C, H, W = probs.shape
        target_one_hot = torch.zeros_like(probs)
        target_one_hot.scatter_(1, targets.unsqueeze(1), 1)
        intersection = (probs * target_one_hot).sum(dim=(0, 2, 3))
        cardinality = (probs + target_one_hot).sum(dim=(0, 2, 3))
        dice_per_class = 1 - (2 * intersection + 1e-6) / (cardinality + 1e-6)
        return dice_per_class.mean()

    def forward(self, logits, targets):
        return (
            self.focal_weight * self.focal_loss(logits, targets)
            + self.dice_weight * self.dice_loss(logits, targets)
        )


# ── Trainer ───────────────────────────────────────────────────────────────────
class SegFormerTrainer:
    def __init__(self, args):
        if args.epochs < 1:
            raise ValueError("--epochs must be at least 1.")
        if args.batch_size < 1:
            raise ValueError("--batch_size must be at least 1.")
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
        if not 0 < args.val_fraction < 1:
            raise ValueError("--val_fraction must be between 0 and 1.")
        if args.min_delta < 0:
            raise ValueError("--min_delta cannot be negative.")
        if args.early_stopping_patience < 0:
            raise ValueError("--early_stopping_patience cannot be negative.")

        self.args = args
        self.device = self._pick_device()
        print(f"[SegFormerTrainer] Device: {self.device}")

        self.ckpt_dir = Path(args.checkpoint_dir)
        if not self.ckpt_dir.is_absolute():
            self.ckpt_dir = PROJECT_ROOT / self.ckpt_dir
        self.ckpt_dir.mkdir(parents=True, exist_ok=True)
        self.results_path = Path(args.results_file)
        if not self.results_path.is_absolute():
            self.results_path = PROJECT_ROOT / self.results_path
        self.results_path.parent.mkdir(parents=True, exist_ok=True)

        random.seed(args.seed)
        np.random.seed(args.seed)
        torch.manual_seed(args.seed)

        self.processor = SegformerImageProcessor.from_pretrained(
            args.model_name, do_resize=False, do_rescale=True, do_normalize=True
        )

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
        self.train_loader = DataLoader(
            train_ds, batch_size=args.batch_size, shuffle=True, num_workers=0
        )
        self.val_loader = DataLoader(val_ds, batch_size=1, shuffle=False, num_workers=0)
        self.dataset_pair_count = len(train_ds) + len(val_ds)
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
            max_weight=args.class_weight_cap,
        )
        loss_type = getattr(args, "loss", "lovasz_compound")
        if loss_type == "lovasz_compound":
            self.criterion = CompoundIoULoss(
                class_weights=class_weights,
                lovasz_weight=getattr(args, "lovasz_weight", 0.6),
            ).to(self.device)
            print(f"[SegFormerTrainer] Criterion: CompoundIoULoss (Lovasz-Softmax + Focal, weight={getattr(args, 'lovasz_weight', 0.6)})")
        else:
            self.criterion = DiceFocalLoss(
                num_classes=NUM_CLASSES,
                class_weights=class_weights,
            ).to(self.device)
            print("[SegFormerTrainer] Criterion: DiceFocalLoss")
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
        }
        self.best_miou = float("-inf")
        self.best_epoch = 0
        self.epochs_without_improvement = 0

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
        print(f"[SegFormerTrainer] Loading '{model_name}' ...")
        config = SegformerConfig.from_pretrained(model_name)
        config.num_labels = NUM_CLASSES
        config.id2label = ID2LABEL
        config.label2id = LABEL2ID
        model = SegformerForSemanticSegmentation.from_pretrained(
            model_name, config=config, ignore_mismatched_sizes=True
        )
        print(f"  Decode head re-initialised for {NUM_CLASSES} FloodNet classes.")
        return model

    def _train_one_epoch(self, epoch):
        self.model.train()
        total_loss = 0.0
        accum_steps = self.args.grad_accum_steps
        if accum_steps < 1:
            raise ValueError("--grad_accum_steps must be at least 1.")
        self.optimizer.zero_grad()
        use_cuda_amp = self.device.type == "cuda" and getattr(self.args, "use_amp", False)
        scaler = torch.amp.GradScaler("cuda", enabled=use_cuda_amp)

        for i, (pixel_values, labels, _) in enumerate(self.train_loader):
            pixel_values = pixel_values.to(self.device)
            labels = labels.to(self.device)

            with torch.amp.autocast("cuda", enabled=use_cuda_amp):
                outputs = self.model(pixel_values=pixel_values)
                logits = outputs.logits
                upsampled = F.interpolate(logits, size=labels.shape[-2:],
                                          mode="bilinear", align_corners=False)
                loss = self.criterion(upsampled, labels)
            
            group_start = (i // accum_steps) * accum_steps
            group_size = min(accum_steps, len(self.train_loader) - group_start)
            scaler.scale(loss / group_size).backward()

            if (i + 1) % accum_steps == 0 or (i + 1) == len(self.train_loader):
                scaler.unscale_(self.optimizer)
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
                scaler.step(self.optimizer)
                scaler.update()
                self.optimizer.zero_grad()

            total_loss += loss.item()
            if (i + 1) % (40 * accum_steps) == 0:
                print(f"  [{i+1}/{len(self.train_loader)}] loss={loss.item():.4f}")
        return total_loss / len(self.train_loader)

    @torch.no_grad()
    def _validate(self):
        self.model.eval()
        confusion = torch.zeros((NUM_CLASSES, NUM_CLASSES), dtype=torch.int64)
        for pixel_values, labels, _ in self.val_loader:
            pixel_values = pixel_values.to(self.device)
            outputs = self.model(pixel_values=pixel_values)
            logits = outputs.logits
            upsampled = F.interpolate(logits, size=labels.shape[-2:],
                                      mode="bilinear", align_corners=False).contiguous()
            pred = upsampled.argmax(dim=1).view(-1).cpu()
            gt = labels.view(-1).cpu()
            batch_confusion = torch.bincount(
                gt * NUM_CLASSES + pred, minlength=NUM_CLASSES**2
            ).reshape(NUM_CLASSES, NUM_CLASSES)
            confusion += batch_confusion

        confusion = confusion.numpy().astype(np.float64)
        true_positive = np.diag(confusion)
        gt_counts = confusion.sum(axis=1)
        pred_counts = confusion.sum(axis=0)
        unions = gt_counts + pred_counts - true_positive
        valid_classes = unions > 0
        ious = np.divide(
            true_positive, unions, out=np.zeros_like(true_positive), where=valid_classes
        )
        f1_denominator = gt_counts + pred_counts
        f1_scores = np.divide(
            2 * true_positive,
            f1_denominator,
            out=np.zeros_like(true_positive),
            where=f1_denominator > 0,
        )
        precisions = np.divide(
            true_positive,
            pred_counts,
            out=np.zeros_like(true_positive),
            where=pred_counts > 0,
        )
        recalls = np.divide(
            true_positive,
            gt_counts,
            out=np.zeros_like(true_positive),
            where=gt_counts > 0,
        )
        total_pixels = gt_counts.sum()
        per_class = {}
        for class_id, class_name in enumerate(CLASS_NAMES):
            per_class[class_name] = {
                "class_id": class_id,
                "iou": float(ious[class_id]),
                "f1_score": float(f1_scores[class_id]),
                "precision": float(precisions[class_id]),
                "recall": float(recalls[class_id]),
                "gt_pixel_count": int(gt_counts[class_id]),
                "pred_pixel_count": int(pred_counts[class_id]),
            }

        return {
            "mIoU": float(ious[valid_classes].mean()) if valid_classes.any() else 0.0,
            "macro_f1": float(f1_scores[valid_classes].mean()) if valid_classes.any() else 0.0,
            "macro_precision": float(precisions[valid_classes].mean()) if valid_classes.any() else 0.0,
            "macro_recall": float(recalls[valid_classes].mean()) if valid_classes.any() else 0.0,
            "frequency_weighted_iou": (
                float(np.sum(ious * gt_counts) / total_pixels) if total_pixels else 0.0
            ),
            "overall_pixel_accuracy": (
                float(true_positive.sum() / total_pixels) if total_pixels else 0.0
            ),
            "per_class": per_class,
        }

    def _save_checkpoint(self, epoch, miou, is_best=False):
        path = self.ckpt_dir / f"segformer_ep{epoch:03d}_miou{miou:.4f}.pt"
        torch.save({"epoch": epoch, "model_state_dict": self.model.state_dict(), "miou": miou}, path)
        if is_best:
            torch.save(self.model.state_dict(), self.ckpt_dir / "segformer_best.pt")
            print(f"  [BEST] Best mIoU={miou:.4f} checkpoint saved")

    def train(self):
        print("\n" + "=" * 60)
        print("  SegFormer Fine-Tuning on FloodNet (10 classes)")
        print("=" * 60)

        last_val_m = {"mIoU": 0.0, "overall_pixel_accuracy": 0.0, "macro_f1": 0.0, "per_class": {}}
        for epoch in range(1, self.args.epochs + 1):
            t0 = time.time()
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
        best_checkpoint = self.ckpt_dir / "segformer_best.pt"
        if not best_checkpoint.is_file():
            raise RuntimeError("Training did not produce a best-model checkpoint.")
        self.model.load_state_dict(
            torch.load(best_checkpoint, map_location=self.device, weights_only=True)
        )
        final = self._validate()
        output = {
            "model": "SegFormer-B3 (Fine-tuned on FloodNet)",
            "epochs_trained": len(self.history["train_loss"]),
            "best_epoch": self.best_epoch,
            "best_val_mIoU": round(self.best_miou, 4),
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
    p = argparse.ArgumentParser()
    p.add_argument("--model_name", default="nvidia/mit-b3")
    p.add_argument("--dataset_root", default=str(PROJECT_ROOT / "FloodNet"))
    p.add_argument("--img_dir", default=None)
    p.add_argument("--mask_dir", default=None)
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch_size", type=int, default=1)
    p.add_argument("--grad_accum_steps", type=int, default=4)
    p.add_argument("--lr", type=float, default=6e-5)
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
    p.add_argument("--checkpoint_dir", default="checkpoints/segformer_full")
    p.add_argument(
        "--results_file",
        default="results/segformer_full_finetune_results.json",
    )
    p.add_argument("--save_every", type=int, default=5)
    p.add_argument(
        "--val_interval",
        type=int,
        default=1,
        help="Run validation every N epochs (default 1).",
    )
    p.add_argument(
        "--loss",
        choices=["lovasz_compound", "dice_focal"],
        default="lovasz_compound",
        help="Loss function: 'lovasz_compound' (Lovasz-Softmax + Focal) or 'dice_focal'.",
    )
    p.add_argument(
        "--lovasz_weight",
        type=float,
        default=0.6,
        help="Weight for Lovasz-Softmax loss in CompoundIoULoss (default 0.6).",
    )
    p.add_argument(
        "--use_amp",
        action="store_true",
        default=False,
        help="Enable CUDA mixed precision training (default False for GTX 1650 FP32 stability).",
    )
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    trainer = SegFormerTrainer(args)
    trainer.train()
