"""Relative monocular depth estimation for FloodSense aerial images."""

import os

os.environ.setdefault("USE_TF", "0")

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from transformers import AutoImageProcessor, DepthAnythingForDepthEstimation


class RelativeDepthEstimator:
    """Predicts a per-image relative depth visualization, not metric distance."""

    def __init__(
        self,
        model_name="depth-anything/Depth-Anything-V2-Small-hf",
        device=None,
    ):
        if device is None:
            if torch.backends.mps.is_available():
                device = torch.device("mps")
            elif torch.cuda.is_available():
                device = torch.device("cuda")
            else:
                device = torch.device("cpu")
        self.device = torch.device(device)
        self.processor = AutoImageProcessor.from_pretrained(model_name)
        self.model = DepthAnythingForDepthEstimation.from_pretrained(
            model_name
        ).to(self.device)
        self.model.eval()

    @torch.inference_mode()
    def estimate(self, image: Image.Image, output_size: tuple[int, int]) -> np.ndarray:
        """Return an RGB colorized relative-depth map at (width, height)."""
        inputs = self.processor(images=image.convert("RGB"), return_tensors="pt")
        inputs = {key: value.to(self.device) for key, value in inputs.items()}
        predicted_depth = self.model(**inputs).predicted_depth
        resized_depth = F.interpolate(
            predicted_depth.unsqueeze(1),
            size=(output_size[1], output_size[0]),
            mode="bicubic",
            align_corners=False,
        )[0, 0]
        depth = resized_depth.float().cpu().numpy()

        if not np.isfinite(depth).all():
            raise RuntimeError("Depth model produced non-finite values.")
        low, high = np.percentile(depth, (2, 98))
        if high <= low:
            raise RuntimeError("Depth model produced a constant depth map.")

        normalized = np.clip((depth - low) / (high - low), 0, 1)
        grayscale = np.round(normalized * 255).astype(np.uint8)
        return cv2.cvtColor(
            cv2.applyColorMap(grayscale, cv2.COLORMAP_TURBO),
            cv2.COLOR_BGR2RGB,
        )
