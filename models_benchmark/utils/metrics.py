import numpy as np

CLASS_NAMES_FLOODNET = {
    0: "Background",
    1: "Building-Flooded",
    2: "Building-Non-Flooded",
    3: "Road-Flooded",
    4: "Road-Non-Flooded",
    5: "Water",
    6: "Tree",
    7: "Vehicle",
    8: "Pool",
    9: "Grass"
}

def compute_segmentation_metrics(pred_mask, gt_mask, ignore_index=255):
    """
    Computes binary segmentation metrics between predicted mask and ground truth mask.
    Both masks should be binary (0 or 1) numpy arrays of the same shape. Ground
    truth pixels equal to ignore_index are excluded.
    """
    pred_mask = np.asarray(pred_mask)
    gt_mask = np.asarray(gt_mask)
    if pred_mask.shape != gt_mask.shape:
        raise ValueError("pred_mask and gt_mask must have the same shape.")
    valid = gt_mask != ignore_index
    pred = (pred_mask[valid] > 0).astype(np.uint8)
    gt = (gt_mask[valid] > 0).astype(np.uint8)
    
    tp = np.sum((pred == 1) & (gt == 1))
    fp = np.sum((pred == 1) & (gt == 0))
    fn = np.sum((pred == 0) & (gt == 1))
    tn = np.sum((pred == 0) & (gt == 0))
    
    total_pixels = pred.size
    
    # Intersection over Union (IoU)
    intersection = tp
    union = tp + fp + fn
    iou = float(intersection / union) if union > 0 else 0.0
    
    # Dice Coefficient / F1 Score
    f1 = float(2 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) > 0 else 0.0
    
    # Precision & Recall
    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    
    # Pixel Accuracy
    accuracy = float((tp + tn) / total_pixels) if total_pixels else 0.0
    
    return {
        "iou": iou,
        "f1_score": f1,
        "precision": precision,
        "recall": recall,
        "pixel_accuracy": accuracy,
        "tp": int(tp),
        "fp": int(fp),
        "fn": int(fn),
        "tn": int(tn)
    }

def compute_multiclass_metrics(
    pred_mask,
    gt_mask,
    num_classes=10,
    class_names=CLASS_NAMES_FLOODNET,
    ignore_index=255,
):
    """
    Compute multi-class metrics; ground-truth ignore_index pixels are excluded.

    Both masks are 2D integer arrays of the same shape; predictions and valid
    ground-truth pixels must be in the range [0, num_classes - 1].
    """
    pred = np.asarray(pred_mask)
    gt = np.asarray(gt_mask)
    if pred.shape != gt.shape or pred.ndim != 2:
        raise ValueError("pred_mask and gt_mask must be 2D arrays with the same shape.")
    if num_classes < 1:
        raise ValueError("num_classes must be a positive integer.")
    if not np.issubdtype(pred.dtype, np.integer) or not np.issubdtype(
        gt.dtype, np.integer
    ):
        raise ValueError("pred_mask and gt_mask must contain integer class IDs.")
    valid_gt = gt != ignore_index
    if (
        np.any(pred < 0)
        or np.any(pred >= num_classes)
        or np.any(gt[valid_gt] < 0)
        or np.any(gt[valid_gt] >= num_classes)
    ):
        raise ValueError(f"Class IDs must be in the range [0, {num_classes - 1}].")

    pred = pred[valid_gt]
    gt = gt[valid_gt]
    confusion = np.bincount(
        gt.astype(np.int64, copy=False).ravel() * num_classes
        + pred.astype(np.int64, copy=False).ravel(),
        minlength=num_classes**2,
    ).reshape(num_classes, num_classes)
    return metrics_from_confusion(confusion, class_names)


def metrics_from_confusion(confusion, class_names=CLASS_NAMES_FLOODNET):
    """Calculate shared segmentation metrics from a dataset-level confusion matrix."""
    confusion = np.asarray(confusion, dtype=np.int64)
    if (
        confusion.ndim != 2
        or confusion.shape[0] != confusion.shape[1]
        or np.any(confusion < 0)
    ):
        raise ValueError("confusion must be a non-negative square matrix.")
    num_classes = confusion.shape[0]
    true_positive = np.diag(confusion)
    gt_counts = confusion.sum(axis=1)
    pred_counts = confusion.sum(axis=0)
    unions = gt_counts + pred_counts - true_positive
    valid_classes = unions > 0
    total_pixels = int(gt_counts.sum())
    pixel_accuracy = (
        float(true_positive.sum() / total_pixels) if total_pixels > 0 else 0.0
    )

    per_class = {}
    ious = np.divide(
        true_positive,
        unions,
        out=np.zeros(num_classes, dtype=np.float64),
        where=valid_classes,
    )
    f1_denominators = gt_counts + pred_counts
    f1_scores = np.divide(
        2 * true_positive,
        f1_denominators,
        out=np.zeros(num_classes, dtype=np.float64),
        where=f1_denominators > 0,
    )
    precisions = np.divide(
        true_positive,
        pred_counts,
        out=np.zeros(num_classes, dtype=np.float64),
        where=pred_counts > 0,
    )
    recalls = np.divide(
        true_positive,
        gt_counts,
        out=np.zeros(num_classes, dtype=np.float64),
        where=gt_counts > 0,
    )

    for c in range(num_classes):
        c_name = class_names.get(c, f"Class_{c}")
        per_class[c_name] = {
            "class_id": c,
            "iou": float(ious[c]),
            "f1_score": float(f1_scores[c]),
            "precision": float(precisions[c]),
            "recall": float(recalls[c]),
            "gt_pixel_count": int(gt_counts[c]),
            "pred_pixel_count": int(pred_counts[c]),
            "true_positive_pixel_count": int(true_positive[c]),
        }

    mean_iou = float(ious[valid_classes].mean()) if valid_classes.any() else 0.0
    macro_f1 = float(f1_scores[valid_classes].mean()) if valid_classes.any() else 0.0
    macro_precision = (
        float(precisions[valid_classes].mean()) if valid_classes.any() else 0.0
    )
    macro_recall = (
        float(recalls[valid_classes].mean()) if valid_classes.any() else 0.0
    )
    fw_iou = (
        float(np.sum(ious * gt_counts) / total_pixels) if total_pixels > 0 else 0.0
    )

    return {
        "mIoU": mean_iou,
        "macro_f1": macro_f1,
        "macro_precision": macro_precision,
        "macro_recall": macro_recall,
        "frequency_weighted_iou": fw_iou,
        "overall_pixel_accuracy": pixel_accuracy,
        "per_class": per_class,
        "confusion_matrix": confusion.astype(np.int64).tolist(),
    }

def aggregate_metrics(metrics_list):
    """
    Aggregates list of metric dictionaries into mean values.
    """
    if not metrics_list:
        return {}
        
    counts = {
        key: sum(metric[key] for metric in metrics_list)
        for key in ("tp", "fp", "fn", "tn")
    }
    tp, fp, fn, tn = (
        counts["tp"],
        counts["fp"],
        counts["fn"],
        counts["tn"],
    )
    union = tp + fp + fn
    f1_denominator = 2 * tp + fp + fn
    predicted_positive = tp + fp
    actual_positive = tp + fn
    total_pixels = tp + fp + fn + tn
    return {
        **counts,
        "iou": float(tp / union) if union else 0.0,
        "f1_score": float(2 * tp / f1_denominator) if f1_denominator else 0.0,
        "precision": float(tp / predicted_positive) if predicted_positive else 0.0,
        "recall": float(tp / actual_positive) if actual_positive else 0.0,
        "pixel_accuracy": float((tp + tn) / total_pixels) if total_pixels else 0.0,
    }

def aggregate_multiclass_metrics(multiclass_list):
    """
    Aggregates list of multi-class metric dictionaries across samples.
    """
    if not multiclass_list:
        return {}
        
    if any("confusion_matrix" not in metrics for metrics in multiclass_list):
        raise ValueError(
            "Each metric result must include its confusion_matrix for aggregation."
        )
    matrices = [np.asarray(metrics["confusion_matrix"]) for metrics in multiclass_list]
    shape = matrices[0].shape
    if (
        len(shape) != 2
        or shape[0] != shape[1]
        or any(matrix.shape != shape for matrix in matrices)
    ):
        raise ValueError("All confusion matrices must have the same square shape.")
    confusion = np.sum(matrices, axis=0, dtype=np.int64)
    class_ids = {
        value["class_id"]: name
        for name, value in multiclass_list[0]["per_class"].items()
    }
    class_names = {
        class_id: class_ids.get(class_id, f"Class_{class_id}")
        for class_id in range(shape[0])
    }
    return metrics_from_confusion(confusion, class_names)
