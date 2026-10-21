"""
08_compare_finetuned.py
=======================
After running 06_segformer_finetune.py and 07_floodseg_finetune.py,
this script loads the best checkpoints of both models and runs a unified
evaluation on the test split (or val subset), printing a full comparison
table and saving results/finetune_comparison.json.

Usage:
    python models_benchmark/08_compare_finetuned.py
    python models_benchmark/08_compare_finetuned.py --segformer_ckpt checkpoints/segformer/segformer_best.pt --floodseg_ckpt checkpoints/floodseg/floodseg_best.pt
"""

import os
import sys
import json
import time
import argparse
import numpy as np
from pathlib import Path
from PIL import Image

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

import timm
from transformers import SegformerForSemanticSegmentation, SegformerConfig, SegformerImageProcessor
import torchvision.transforms as T

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "models_benchmark"))
from utils.metrics import (
    compute_multiclass_metrics,
    aggregate_multiclass_metrics,
    CLASS_NAMES_FLOODNET,
)

NUM_CLASSES = 10
CLASS_NAMES = list(CLASS_NAMES_FLOODNET.values())
ID2LABEL = {i: name for i, name in CLASS_NAMES_FLOODNET.items()}
LABEL2ID = {name: i for i, name in ID2LABEL.items()}

COLOR_PALETTE = {
    0:(0,0,0), 1:(255,0,0), 2:(180,120,120), 3:(160,150,20),
    4:(140,140,140), 5:(61,230,250), 6:(0,82,255), 7:(255,0,245),
    8:(255,235,0), 9:(4,250,7)
}

MEAN = [0.485, 0.456, 0.406]
STD  = [0.229, 0.224, 0.225]


# ── Dataset ──────────────────────────────────────────────────────────────────
class EvalDataset(Dataset):
    def __init__(self, img_dir, mask_dir, img_size=512):
        self.img_dir = Path(img_dir)
        self.mask_dir = Path(mask_dir)
        self.img_size = img_size
        image_files = sorted([f for f in os.listdir(img_dir) if f.endswith((".jpg",".png"))])
        self.valid_pairs = []
        for img_file in image_files:
            base = Path(img_file).stem
            img_p = self.img_dir / img_file
            mask_p = self.mask_dir / f"{base}_lab.png"
            if mask_p.exists() and img_p.stat().st_size > 5000 and mask_p.stat().st_size > 500:
                self.valid_pairs.append((img_file, f"{base}_lab.png"))
        print(f"[EvalDataset] {len(self.valid_pairs)} real valid pairs")

        self.to_tensor = T.Compose([T.ToTensor(), T.Normalize(mean=MEAN, std=STD)])

    def _rgb_to_class(self, mask_rgb):
        class_mask = np.zeros(mask_rgb.shape[:2], dtype=np.int64)
        for cid, color in COLOR_PALETTE.items():
            match = np.all(np.abs(mask_rgb.astype(int) - np.array(color)) <= 15, axis=-1)
            class_mask[match] = cid
        return class_mask

    def __len__(self):
        return len(self.valid_pairs)

    def __getitem__(self, idx):
        img_file, mask_file = self.valid_pairs[idx]
        img = Image.open(self.img_dir / img_file).convert("RGB").resize((self.img_size, self.img_size), Image.BILINEAR)
        mask_img = Image.open(self.mask_dir / mask_file).convert("RGB").resize((self.img_size, self.img_size), Image.NEAREST)
        class_mask = self._rgb_to_class(np.array(mask_img))
        return self.to_tensor(img), torch.tensor(class_mask, dtype=torch.long), img_file


# ── FloodSeg Model (inline) ───────────────────────────────────────────────────
class ChannelShiftBlock(nn.Module):
    def __init__(self, channels, shift_size=4):
        super().__init__()
        self.shift_size = shift_size
        self.dw_conv = nn.Conv2d(channels, channels, 3, padding=1, groups=channels, bias=False)
        self.pw_conv = nn.Conv2d(channels, channels, 1, bias=False)
        self.norm = nn.BatchNorm2d(channels)
        self.act = nn.GELU()
    def forward(self, x):
        out = self.dw_conv(torch.roll(x, self.shift_size, dims=1))
        return self.act(self.norm(self.pw_conv(out))) + x

class ASPPModule(nn.Module):
    def __init__(self, in_channels, out_channels=256, rates=(6,12,18)):
        super().__init__()
        self.conv1 = nn.Sequential(nn.Conv2d(in_channels, out_channels, 1, bias=False), nn.BatchNorm2d(out_channels), nn.GELU())
        self.atrous_convs = nn.ModuleList([nn.Sequential(nn.Conv2d(in_channels, out_channels, 3, padding=r, dilation=r, bias=False), nn.BatchNorm2d(out_channels), nn.GELU()) for r in rates])
        self.gap = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Conv2d(in_channels, out_channels, 1, bias=False), nn.GroupNorm(1, out_channels), nn.GELU())
        n = 1 + len(rates) + 1
        self.proj = nn.Sequential(nn.Conv2d(out_channels * n, out_channels, 1, bias=False), nn.BatchNorm2d(out_channels), nn.GELU())
    def forward(self, x):
        h, w = x.shape[2:]
        branches = [self.conv1(x)] + [ac(x) for ac in self.atrous_convs]
        branches.append(F.interpolate(self.gap(x), (h, w), mode='bilinear', align_corners=False))
        return self.proj(torch.cat(branches, dim=1))

class DecoderBlock(nn.Module):
    def __init__(self, in_channels, skip_channels, out_channels):
        super().__init__()
        self.skip_channels = skip_channels
        self.up = nn.ConvTranspose2d(in_channels, out_channels, 2, stride=2)
        in_c = out_channels + skip_channels
        self.conv = nn.Sequential(nn.Conv2d(in_c, out_channels, 3, padding=1, bias=False), nn.BatchNorm2d(out_channels), nn.GELU(), nn.Conv2d(out_channels, out_channels, 3, padding=1, bias=False), nn.BatchNorm2d(out_channels), nn.GELU())
        self.css = ChannelShiftBlock(out_channels)
    def forward(self, x, skip):
        x = self.up(x)
        if skip is not None:
            x = torch.cat([x, skip], dim=1)
        return self.css(self.conv(x))

class FloodSegNet(nn.Module):
    def __init__(self, num_classes=10, backbone='mobilenetv2_100'):
        super().__init__()
        self.encoder = timm.create_model(backbone, pretrained=False, features_only=True, out_indices=(1,2,3,4))
        ch = self.encoder.feature_info.channels()
        self.css1=ChannelShiftBlock(ch[0]); self.css2=ChannelShiftBlock(ch[1])
        self.css3=ChannelShiftBlock(ch[2]); self.css4=ChannelShiftBlock(ch[3])
        self.aspp = ASPPModule(ch[3])
        self.dec4 = DecoderBlock(256, ch[2], 128)
        self.dec3 = DecoderBlock(128, ch[1], 64)
        self.dec2 = DecoderBlock(64, ch[0], 32)
        self.dec1 = DecoderBlock(32, 0, 16)
        self.head = nn.Sequential(nn.Conv2d(16, num_classes, 1))
    def forward(self, x):
        f1, f2, f3, f4 = self.encoder(x)
        f1=self.css1(f1); f2=self.css2(f2); f3=self.css3(f3); f4=self.css4(f4)
        neck = self.aspp(f4)
        d4=self.dec4(neck,f3); d3=self.dec3(d4,f2); d2=self.dec2(d3,f1); d1=self.dec1(d2,None)
        return F.interpolate(self.head(d1), x.shape[2:], mode='bilinear', align_corners=False)


# ── Evaluation ────────────────────────────────────────────────────────────────
def evaluate_model(model, dataloader, device, model_name):
    model.eval()
    metrics_list = []
    inference_times = []

    with torch.no_grad():
        for imgs, labels, filenames in dataloader:
            imgs = imgs.to(device)
            t0 = time.time()
            logits = model(imgs)
            if logits.shape[-2:] != labels.shape[-2:]:
                logits = F.interpolate(logits, labels.shape[-2:], mode='bilinear', align_corners=False)
            elapsed = (time.time() - t0) * 1000
            inference_times.append(elapsed)

            pred = logits.argmax(dim=1).squeeze(0).cpu().numpy()
            gt = labels.squeeze(0).numpy()
            metrics_list.append(compute_multiclass_metrics(pred, gt))

    agg = aggregate_multiclass_metrics(metrics_list)
    agg["avg_inference_ms"] = round(float(np.mean(inference_times)), 1)
    return agg


def load_segformer(ckpt_path, device):
    config = SegformerConfig.from_pretrained("nvidia/mit-b3")
    config.num_labels = NUM_CLASSES
    config.id2label = ID2LABEL
    config.label2id = LABEL2ID
    model = SegformerForSemanticSegmentation(config)
    if ckpt_path and Path(ckpt_path).exists():
        state = torch.load(ckpt_path, map_location=device)
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        model.load_state_dict(state)
        print(f"[SegFormer] Loaded checkpoint: {ckpt_path}")
    else:
        print(f"[SegFormer] WARNING: No checkpoint at {ckpt_path}, using random weights")
    return model.to(device)


def load_floodseg(ckpt_path, device):
    model = FloodSegNet(num_classes=NUM_CLASSES)
    if ckpt_path and Path(ckpt_path).exists():
        state = torch.load(ckpt_path, map_location=device)
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        model.load_state_dict(state)
        print(f"[FloodSeg] Loaded checkpoint: {ckpt_path}")
    else:
        print(f"[FloodSeg] WARNING: No checkpoint at {ckpt_path}, using random weights")
    return model.to(device)


def wrap_segformer_forward(model):
    """Wrap SegFormer so it returns logits like a standard model."""
    class SegFormerWrapper(nn.Module):
        def __init__(self, m):
            super().__init__()
            self.segformer = m
        def forward(self, x):
            out = self.segformer(pixel_values=x)
            return F.interpolate(out.logits, x.shape[2:], mode='bilinear', align_corners=False)
    return SegFormerWrapper(model)


def print_comparison_table(results):
    metrics = ["mIoU", "macro_f1", "overall_pixel_accuracy", "avg_inference_ms"]
    labels = ["mIoU", "Macro F1", "Pixel Acc", "Inf. Time (ms)"]

    print("\n" + "=" * 70)
    print("  FINE-TUNED MODEL COMPARISON — FloodNet 10-Class Segmentation")
    print("=" * 70)
    print(f"  {'Metric':<22} {'Zero-Shot Baseline':>20} {'SegFormer (FT)':>15} {'FloodSeg (FT)':>14}")
    print("-" * 70)

    baselines = {"mIoU": 0.0937, "macro_f1": 0.1175, "overall_pixel_accuracy": "N/A", "avg_inference_ms": 95.2}
    for m, lbl in zip(metrics, labels):
        row = [lbl]
        bl = baselines.get(m, "N/A")
        row.append(f"{bl}" if isinstance(bl, str) else f"{bl:.4f}")
        for model_name in ["SegFormer", "FloodSeg"]:
            val = results[model_name].get(m, "N/A")
            row.append(f"{val:.4f}" if isinstance(val, float) else str(val))
        print(f"  {row[0]:<22} {row[1]:>20} {row[2]:>15} {row[3]:>14}")

    print("=" * 70)
    print("\n  Per-Class IoU Comparison:")
    print(f"  {'Class':<28} {'SegFormer (FT)':>15} {'FloodSeg (FT)':>14}")
    print("-" * 60)
    for cname in CLASS_NAMES:
        sf_iou = results["SegFormer"].get("per_class", {}).get(cname, {}).get("iou", 0)
        fg_iou = results["FloodSeg"].get("per_class", {}).get(cname, {}).get("iou", 0)
        print(f"  {cname:<28} {sf_iou:>14.4f} {fg_iou:>14.4f}")
    print("=" * 70)


def main(args):
    device = torch.device("mps" if torch.backends.mps.is_available() else
                          "cuda" if torch.cuda.is_available() else "cpu")
    print(f"[Compare] Device: {device}")

    ds = EvalDataset(args.img_dir, args.mask_dir, img_size=args.img_size)
    loader = DataLoader(ds, batch_size=1, shuffle=False, num_workers=0)

    print("\n-- Loading SegFormer --")
    sf_model = wrap_segformer_forward(load_segformer(args.segformer_ckpt, device))

    print("\n-- Loading FloodSeg --")
    fg_model = load_floodseg(args.floodseg_ckpt, device)

    print("\n-- Evaluating SegFormer --")
    sf_metrics = evaluate_model(sf_model, loader, device, "SegFormer")

    print("-- Evaluating FloodSeg --")
    fg_metrics = evaluate_model(fg_model, loader, device, "FloodSeg")

    results = {
        "SegFormer": {**{k: round(v, 4) for k, v in sf_metrics.items() if k != "per_class"},
                      "per_class": {k: {m: round(v, 4) for m, v in vals.items()} for k, vals in sf_metrics.get("per_class", {}).items()}},
        "FloodSeg": {**{k: round(v, 4) for k, v in fg_metrics.items() if k != "per_class"},
                     "per_class": {k: {m: round(v, 4) for m, v in vals.items()} for k, vals in fg_metrics.get("per_class", {}).items()}},
        "zero_shot_baseline": {"mIoU": 0.0937, "macro_f1": 0.1175, "model": "SegFormer/OneFormer (zero-shot ADE20K)"}
    }

    print_comparison_table(results)

    out_path = PROJECT_ROOT / "results" / "finetune_comparison.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n  Results saved: {out_path}")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--segformer_ckpt", default="checkpoints/segformer/segformer_best.pt")
    p.add_argument("--floodseg_ckpt", default="checkpoints/floodseg/floodseg_best.pt")
    p.add_argument("--img_dir", default="FloodNet/FloodNet-Supervised_v1.0/val/val-org-img")
    p.add_argument("--mask_dir", default="FloodNet/ColorMasks-FloodNetv1/ColorMasks-ValSet")
    p.add_argument("--img_size", type=int, default=512)
    return p.parse_args()


if __name__ == "__main__":
    main(parse_args())
