import os
import numpy as np
from PIL import Image

# FloodNet RGB Color Palette Definition
# Map class index to (R, G, B) color tuple and class label name
COLOR_PALETTE = {
    0: ("background", (0, 0, 0)),
    1: ("building-flooded", (255, 0, 0)),
    2: ("building-non-flooded", (180, 120, 120)),
    3: ("road-flooded", (160, 150, 20)),
    4: ("road-non-flooded", (140, 140, 140)),
    5: ("water", (61, 230, 250)),
    6: ("tree", (0, 82, 255)),
    7: ("vehicle", (255, 0, 245)),
    8: ("pool", (255, 235, 0)),
    9: ("grass", (4, 250, 7))
}

# Flooded and Water class indices (Classes 1, 3, 5, 8)
FLOODED_CLASS_IDS = [1, 3, 5, 8]
IGNORE_INDEX = 255


def rgb_mask_to_class_ids(mask_rgb):
    """Decode only documented palette colors; preserve unknowns for safe handling."""
    mask_rgb = np.asarray(mask_rgb)
    if mask_rgb.ndim != 3 or mask_rgb.shape[2] != 3:
        raise ValueError("FloodNet color masks must be RGB arrays.")

    class_mask = np.full(mask_rgb.shape[:2], IGNORE_INDEX, dtype=np.uint8)
    for class_id, (_, color) in COLOR_PALETTE.items():
        class_mask[np.all(mask_rgb == np.asarray(color, dtype=np.uint8), axis=-1)] = (
            class_id
        )
    return class_mask

class FloodNetDatasetLoader:
    def __init__(self, root_dir="FloodNet", split="val", target_size=(512, 512)):
        self.root_dir = root_dir
        self.split = split
        self.target_size = target_size
        
        self.images_dir = os.path.join(root_dir, "FloodNet-Supervised_v1.0", split, f"{split}-org-img")
        
        if split == "train":
            self.masks_dir = os.path.join(root_dir, "ColorMasks-FloodNetv1", "ColorMasks-TrainSet")
        elif split == "val":
            self.masks_dir = os.path.join(root_dir, "ColorMasks-FloodNetv1", "ColorMasks-ValSet")
        elif split == "test":
            self.masks_dir = os.path.join(root_dir, "ColorMasks-FloodNetv1", "ColorMasks-TestSet")
        else:
            raise ValueError(f"Unknown split: {split}")
            
        self.image_files = sorted([f for f in os.listdir(self.images_dir) if f.endswith(('.jpg', '.png'))])
        
    def __len__(self):
        return len(self.image_files)
        
    def get_image_path(self, idx):
        return os.path.join(self.images_dir, self.image_files[idx])
        
    def get_mask_path(self, idx):
        filename = self.image_files[idx]
        basename = os.path.splitext(filename)[0]
        mask_filename = f"{basename}_lab.png"
        return os.path.join(self.masks_dir, mask_filename)
        
    def load_item(self, idx, return_binary_flood=True):
        img_path = self.get_image_path(idx)
        mask_path = self.get_mask_path(idx)
        
        # Load image
        img = Image.open(img_path).convert("RGB")
        if self.target_size is not None:
            img = img.resize(self.target_size, Image.BILINEAR)
            
        # Load mask
        mask_img = Image.open(mask_path).convert("RGB")
        if self.target_size is not None:
            mask_img = mask_img.resize(self.target_size, Image.NEAREST)
            
        mask_rgb = np.array(mask_img)
        
        class_mask = rgb_mask_to_class_ids(mask_rgb).astype(np.int64)

        if return_binary_flood:
            # Create binary mask where 1 = Flooded/Water, 0 = Background/Non-flooded
            binary_mask = np.zeros_like(class_mask, dtype=np.uint8)
            binary_mask[class_mask == IGNORE_INDEX] = IGNORE_INDEX
            for flood_id in FLOODED_CLASS_IDS:
                binary_mask[class_mask == flood_id] = 1
            return np.array(img), binary_mask, class_mask
            
        return np.array(img), class_mask
