"""
FloodSense Master API Server
============================
Flask backend serving live Computer Vision segmentation (SegFormer, Classical, SAM),
Multi-Class Damage Extraction, ChromaDB RAG Protocol Retrieval, and Grounded LLM
Disaster Situation Report (SITREP) generation.

Endpoints:
  GET  /                     → Serves dashboard UI (index.html)
  GET  /api/status           → System health and model availability
  GET  /api/models           → Available benchmarked CV models
  GET  /api/samples          → Pre-indexed demo flood images & masks
  GET  /api/knowledge_base   → Knowledge base documents & protocols
  POST /api/segment          → Standalone semantic segmentation inference
  POST /api/depth            → Standalone relative monocular depth inference
  POST /api/analyze          → Runs end-to-end CV + RAG + LLM report pipeline
  GET  /api/overlay/<file>   → Serves generated overlay image

Usage:
  py -3.11 dashboard/server.py
  → Open http://localhost:5050
"""

import os
import sys
import json
import uuid
import time
import base64
import tempfile
import io
import re

# The inference stack is PyTorch-based; avoid importing optional TensorFlow plugins.
os.environ.setdefault("USE_TF", "0")

import numpy as np
import cv2
from PIL import Image
from flask import Flask, request, jsonify, send_from_directory, send_file
from scipy import ndimage

# ── Paths ──────────────────────────────────────────────────────────────────
DASHBOARD_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT  = os.path.dirname(DASHBOARD_DIR)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

MODELS_BENCHMARK_DIR = os.path.join(PROJECT_ROOT, "models_benchmark")
if MODELS_BENCHMARK_DIR not in sys.path:
    sys.path.insert(0, MODELS_BENCHMARK_DIR)

from damage_extraction.damage_extractor import (
    COLOR_PALETTE,
    CLASS_DISPLAY_COLORS,
    rgb_mask_to_class_mask,
    count_components,
)
import importlib

# Import model inference functions dynamically
m1 = importlib.import_module("models_benchmark.01_classical_thresholding")
segment_classical_multiclass = m1.segment_classical_multiclass

# ── Flask App Setup ────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=DASHBOARD_DIR, static_url_path="")
OVERLAY_CACHE_DIR = os.path.join(tempfile.gettempdir(), "floodsense_overlays")
os.makedirs(OVERLAY_CACHE_DIR, exist_ok=True)

# ── Lazy RAG & LLM initialization ─────────────────────────────────────────
# Keep health checks responsive while the embedding model loads on first analysis.
vector_store = None
retriever = None
llm_engine = None

def get_rag_components():
    global vector_store, retriever, llm_engine
    if vector_store is None:
        print("[Server Startup] Initializing Vector Store, Retriever & LLM Engine...")
        from rag_pipeline.vector_store import DisasterProtocolVectorStore
        from rag_pipeline.retriever import FloodProtocolRetriever
        from report_generation.llm_engine import FloodLLMEngine

        vector_store = DisasterProtocolVectorStore()
        indexed_chunks = vector_store.build_or_update_index()
        print(f"[RAG Init] Indexed {indexed_chunks} chunks from the current knowledge base.")
        retriever = FloodProtocolRetriever(vector_store=vector_store)
        llm_engine = FloodLLMEngine()
    return vector_store, retriever, llm_engine

# Lazy model instances
segformer_instance = None
sam_instance = None
depth_estimator_instance = None

SEGFORMER_CHECKPOINT = os.environ.get(
    "FLOODSENSE_SEGFORMER_CHECKPOINT",
    os.path.join(
        PROJECT_ROOT,
        "checkpoints",
        "segformer_full",
        "segformer_best.pt",
    ),
)


def has_finetuned_segformer():
    return os.path.isfile(SEGFORMER_CHECKPOINT)


def can_use_finetuned_segformer():
    return (
        has_finetuned_segformer()
        and os.environ.get("RENDER") is None
        and os.environ.get("DISABLE_HEAVY_CV", "0") != "1"
    )


def heavy_cv_disabled():
    return (
        os.environ.get("RENDER") is not None
        or os.environ.get("DISABLE_HEAVY_CV", "0") == "1"
    )


def get_segformer():
    global segformer_instance
    if segformer_instance is None:
        # On Render / CPU cloud instances, use fast Classical CV pipeline to prevent 90s Hugging Face download timeouts
        if heavy_cv_disabled():
            print("[Model Loader] Cloud env detected — using Classical CV for SegFormer slot.")
            class FastCloudSegFormer:
                model_id = "classical"

                def segment_image(self, img_rgb):
                    return segment_classical_multiclass(img_rgb)
            segformer_instance = FastCloudSegFormer()
            return segformer_instance

        print("[Model Loader] Initializing SegFormer Transformer...")
        m5 = importlib.import_module("models_benchmark.05_segformer")
        SegFormerSegmenter = m5.SegFormerSegmenter
        if can_use_finetuned_segformer():
            print(
                "[Model Loader] Loading FloodNet fine-tuned SegFormer-B3 "
                f"from {SEGFORMER_CHECKPOINT}."
            )
            segformer_instance = SegFormerSegmenter(
                model_name="nvidia/mit-b3",
                checkpoint_path=SEGFORMER_CHECKPOINT,
            )
        else:
            print(
                "[Model Loader] Fine-tuned checkpoint not found; loading the "
                "pretrained SegFormer baseline."
            )
            segformer_instance = SegFormerSegmenter()
    return segformer_instance


def get_relative_depth_estimator():
    global depth_estimator_instance
    if depth_estimator_instance is None:
        print("[Model Loader] Initializing Depth Anything V2 Small...")
        depth_module = importlib.import_module("models_benchmark.09_relative_depth")
        depth_estimator_instance = depth_module.RelativeDepthEstimator()
    return depth_estimator_instance


def get_sam():
    global sam_instance
    if sam_instance is None:
        if heavy_cv_disabled():
            print("[Model Loader] Cloud env detected — using Classical CV for SAM slot.")
            class FastCloudSAM:
                model_id = "classical"

                def segment_image(self, img_rgb):
                    return segment_classical_multiclass(img_rgb)
            sam_instance = FastCloudSAM()
            return sam_instance

        print("[Model Loader] Initializing SAM (Segment Anything Model)...")
        try:
            m2 = importlib.import_module("models_benchmark.02_sam_segmentation")
            SAMSegmenter = m2.SAMSegmenter
            sam_instance = SAMSegmenter()
        except Exception as e:
            print(f"[Model Loader Warning] SAM initialization failed ({e}). Falling back to Classical CV.")
            class FallbackSAM:
                model_id = "classical"

                def segment_image(self, img_rgb):
                    return segment_classical_multiclass(img_rgb)
            sam_instance = FallbackSAM()
    return sam_instance


def select_best_model_for_image(img_rgb: np.ndarray):
    """
    Analyzes image content characteristics to recommend the optimal segmentation model:
    - High flood water extent (>20%) → SAM (Segment Anything Model) for fine water boundary contouring
    - Complex multi-class scene (vegetation, structural features, roads) → SegFormer (Transformer) for deep semantic reasoning
    - High road/concrete uniformity → Classical CV for rapid high-contrast edge thresholding
    - Default → SegFormer
    """
    if has_finetuned_segformer():
        return (
            "segformer",
            "FloodNet fine-tuned SegFormer-B3 is available and recommended for "
            "FloodNet's 10-class aerial segmentation.",
        )

    h, w = img_rgb.shape[:2]
    sample = img_rgb[::4, ::4]  # downsample for speed
    hsv_sample = cv2.cvtColor(sample, cv2.COLOR_RGB2HSV)

    r = sample[:, :, 0].astype(float)
    g = sample[:, :, 1].astype(float)
    b = sample[:, :, 2].astype(float)

    # Multi-spectral water detection (Cyan/blue, brown muddy, tan, dark silt)
    water_cyan = (hsv_sample[:, :, 0] >= 80) & (hsv_sample[:, :, 0] <= 140) & (hsv_sample[:, :, 1] >= 30)
    water_tan = (hsv_sample[:, :, 0] >= 7) & (hsv_sample[:, :, 0] <= 48) & (hsv_sample[:, :, 1] >= 12) & (r >= b - 10) & ~(g > r + 10)
    water_dark = (hsv_sample[:, :, 2] < 70) & (hsv_sample[:, :, 1] < 70)
    water_mask = water_cyan | water_tan | water_dark
    water_pct = float(np.mean(water_mask))

    # Vegetation pixels: green dominant
    veg_mask = (g > r + 8) & (g > b + 5) & (g > 40)
    veg_pct = float(np.mean(veg_mask))

    # Low-saturation (gray) pixels — roads / concrete / bare ground
    color_std = np.std(sample, axis=2)
    gray_pct = float(np.mean(color_std < 20))

    if water_pct > 0.20:
        return "sam", f"High flood water extent detected ({int(water_pct*100)}% surface area) — SAM is optimal for fine water-boundary contouring."

    if veg_pct > 0.15 or (water_pct > 0.08 and gray_pct > 0.08):
        return "segformer", f"Complex multi-class terrain ({int(veg_pct*100)}% vegetation, {int(gray_pct*100)}% structures/roads) — SegFormer Transformer delivers top multi-class semantic accuracy."

    if gray_pct > 0.45:
        return "classical", f"Predominantly uniform infrastructure/road layout ({int(gray_pct*100)}%) — Classical CV thresholding provides rapid edge extraction."

    return "segformer", "Balanced aerial flight scenario — SegFormer Transformer recommended for highest overall accuracy."

# ── FloodNet Sample Indexing ───────────────────────────────────────────────
FLOODNET_ROOT = os.path.join(PROJECT_ROOT, "FloodNet")

def get_sample_dirs():
    img_candidates = [
        os.path.join(FLOODNET_ROOT, "FloodNet-Supervised_v1.0", "val", "val-org-img"),
        os.path.join(FLOODNET_ROOT, "val", "val-org-img"),
        os.path.join(FLOODNET_ROOT, "FloodNet-Supervised_v1.0", "test", "test-org-img"),
        os.path.join(FLOODNET_ROOT, "test", "test-org-img"),
        os.path.join(FLOODNET_ROOT, "FloodNet-Supervised_v1.0", "train", "train-org-img"),
    ]
    mask_candidates = [
        os.path.join(FLOODNET_ROOT, "ColorMasks-FloodNetv1", "ColorMasks-ValSet"),
        os.path.join(FLOODNET_ROOT, "ColorMasks-FloodNetv1", "ColorMasks-TestSet"),
        os.path.join(FLOODNET_ROOT, "ColorMasks-FloodNetv1", "ColorMasks-TrainSet"),
        os.path.join(FLOODNET_ROOT, "val", "val-label-img"),
    ]
    img_dir = next((p for p in img_candidates if os.path.isdir(p)), img_candidates[0])
    mask_dir = next((p for p in mask_candidates if os.path.isdir(p)), mask_candidates[0])
    return img_dir, mask_dir

VAL_IMG_DIR, VAL_MASK_DIR = get_sample_dirs()

# ── CORS Helper & Error Handlers ───────────────────────────────────────────
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

@app.errorhandler(500)
def handle_500_error(e):
    return jsonify({
        "status": "error",
        "error": "Internal server error occurred",
        "detail": str(e)
    }), 500

@app.errorhandler(400)
def handle_400_error(e):
    return jsonify({
        "status": "error",
        "error": "Bad request",
        "detail": str(e)
    }), 400

# ── Color Overlay Generator ────────────────────────────────────────────────
def generate_color_overlay(img_rgb: np.ndarray, class_mask: np.ndarray, target_size=None) -> np.ndarray:
    h, w = class_mask.shape
    color_layer = np.zeros((h, w, 3), dtype=np.uint8)
    for cid, color in CLASS_DISPLAY_COLORS.items():
        color_layer[class_mask == cid] = color
        
    if target_size and target_size != (w, h):
        color_layer = np.array(Image.fromarray(color_layer).resize(target_size, Image.NEAREST))
    return color_layer

def extract_metrics_from_class_mask(class_mask: np.ndarray) -> dict:
    total = class_mask.size
    class_counts = {}
    class_pct = {}
    for cid, (label, _) in COLOR_PALETTE.items():
        cnt = int(np.sum(class_mask == cid))
        class_counts[label] = cnt
        class_pct[label] = round(cnt / total * 100, 3)

    fb_mask = (class_mask == 1).astype(np.uint8)
    nfb_mask = (class_mask == 2).astype(np.uint8)
    fb_cnt, _ = count_components(fb_mask, 300)
    nfb_cnt, _ = count_components(nfb_mask, 300)
    fb_px = int(np.sum(fb_mask))
    nfb_px = int(np.sum(nfb_mask))
    
    fr_px = int(np.sum(class_mask == 3))
    nfr_px = int(np.sum(class_mask == 4))
    
    water_px = int(np.sum(class_mask == 5))
    pool_px = int(np.sum(class_mask == 8))
    veh_px = int(np.sum(class_mask == 7))
    veh_mask = (class_mask == 7).astype(np.uint8)
    veh_cnt, _ = count_components(veh_mask, 60)
    
    flood_px = fb_px + fr_px + water_px + pool_px
    flood_pct = round(flood_px / total * 100, 3)

    severity_weights = {
        "building-flooded": 10.0,
        "road-flooded": 8.0,
        "water": 5.0,
        "pool": 3.0,
        "building-non-flooded": 1.0,
        "road-non-flooded": 0.5,
        "vehicle": 2.0,
    }
    severity_raw = sum(
        severity_weights.get(label, 0.0) * class_pct[label]
        for label, _ in COLOR_PALETTE.values()
    )
    max_possible = sum(v * 100.0 for v in severity_weights.values())
    raw_score = round((severity_raw / max_possible) * 100, 2) if max_possible > 0 else 0.0
    
    if raw_score >= 15.0:
        sev_label = "CRITICAL"
    elif raw_score >= 8.0:
        sev_label = "SEVERE"
    elif raw_score >= 3.0:
        sev_label = "MODERATE"
    elif raw_score >= 0.5:
        sev_label = "MINOR"
    else:
        sev_label = "NONE"
    
    return {
        "analysis_method": "Multi-Class Semantic Segmentation",
        "metric_basis": (
            "Predicted FloodNet class-mask pixels and connected components. "
            "No georeferencing, camera calibration, or field verification is used."
        ),
        "damage_summary": {
            "damage_severity_score": raw_score,
            "severity_label": sev_label,
            "severity_basis": "Unvalidated class-weighted image proxy; not incident severity.",
            "flood_coverage_pct": flood_pct,
            "total_flood_area_px": flood_px,
            "total_flood_area_m2": None,
        },
        "buildings": {
            "flooded_building_count": fb_cnt,
            "flooded_building_component_count_estimate": fb_cnt,
            "flooded_building_area_px": fb_px,
            "flooded_building_area_pct": round(fb_px / total * 100, 3),
            "flooded_building_area_m2": None,
            "non_flooded_building_count": nfb_cnt,
            "non_flooded_building_component_count_estimate": nfb_cnt,
            "non_flooded_building_area_px": nfb_px,
            "non_flooded_building_area_pct": round(nfb_px / total * 100, 3),
            "non_flooded_building_area_m2": None,
            "total_building_count": fb_cnt + nfb_cnt,
            "building_flood_ratio": round(fb_cnt / max(1, fb_cnt + nfb_cnt), 3),
        },
        "roads": {
            "flooded_road_coverage_pct": round(fr_px / total * 100, 3),
            "flooded_road_area_px": fr_px,
            "flooded_road_area_m2": None,
            "non_flooded_road_coverage_pct": round(nfr_px / total * 100, 3),
            "non_flooded_road_area_px": nfr_px,
            "total_road_coverage_pct": round((fr_px + nfr_px) / total * 100, 3),
        },
        "water": {
            "water_body_coverage_pct": round(water_px / total * 100, 3),
            "water_body_area_px": water_px,
            "water_body_area_m2": None,
            "pool_coverage_pct": round(pool_px / total * 100, 3),
            "pool_area_px": pool_px,
        },
        "vehicles": {
            "vehicle_count": veh_cnt,
            "vehicle_component_count_estimate": veh_cnt,
            "vehicle_area_pct": round(veh_px / total * 100, 3),
            "vehicle_area_px": veh_px,
        },
        "class_pixel_counts": class_counts,
        "class_pixel_distribution_pct": class_pct,
    }

# ── Routes ─────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(DASHBOARD_DIR, "index.html")

@app.route("/api/status", methods=["GET"])
def api_status():
    chunks = None
    vector_store_error = None
    if vector_store is not None:
        if getattr(vector_store, "collection", None) is not None:
            try:
                chunks = vector_store.collection.count()
            except Exception as error:
                vector_store_error = str(error)
        else:
            chunks = len(getattr(vector_store, "fallback_chunks", []))

    if vector_store is None:
        retrieval_mode = "not_initialized"
    elif getattr(vector_store, "collection", None) is None:
        retrieval_mode = "tfidf_fallback"
    else:
        retrieval_mode = "vector_db"

    return jsonify({
        "status": "online",
        "system": "FloodSense Multimodal Emergency Reporting System",
        "version": "2.0",
        "vector_store_chunks": chunks,
        "vector_store_error": vector_store_error,
        "gpu_available": False,
        "deployment_mode": retrieval_mode,
    })

@app.route("/api/models", methods=["GET"])
def api_models():
    finetuned_segformer = can_use_finetuned_segformer()
    cv_disabled = heavy_cv_disabled()
    if cv_disabled:
        segformer_name = "Classical CV (SegFormer request fallback)"
        segformer_description = (
            "This runtime disables heavy computer vision; SegFormer requests are "
            "served by the classical color/threshold segmenter."
        )
        sam_name = "Classical CV (SAM request fallback)"
        sam_description = (
            "This runtime disables heavy computer vision; SAM requests are served "
            "by the classical color/threshold segmenter."
        )
    elif finetuned_segformer:
        segformer_name = "FloodNet SegFormer-B3 (Fine-Tuned Checkpoint)"
        segformer_description = (
            "A local FloodNet 10-class checkpoint is available. Its historical "
            "validation result is not independently verified on the current split."
        )
        sam_name = "SAM (Segment Anything Model)"
        sam_description = (
            "Promptable segmentation backend; initialization may fall back to "
            "classical CV, which is identified by the inference response."
        )
    else:
        segformer_name = "ADE20K-pretrained SegFormer (heuristic FloodNet mapping)"
        segformer_description = (
            "ADE20K semantic labels are heuristically remapped to FloodNet classes; "
            "this is not a FloodNet-trained 10-class model."
        )
        sam_name = "SAM (Segment Anything Model)"
        sam_description = (
            "Promptable segmentation backend; initialization may fall back to "
            "classical CV, which is identified by the inference response."
        )

    metrics_status = "No current, independently reproduced held-out benchmark is available."
    models = [
        {
            "id": "segformer",
            "name": segformer_name,
            "description": segformer_description,
            "mIoU": None,
            "macro_f1": None,
            "latency_ms": None,
            "metrics_status": metrics_status,
            "recommended": finetuned_segformer and not cv_disabled,
        },
        {
            "id": "classical",
            "name": "Classical CV Multi-Space Thresholding",
            "description": "Color/threshold-based segmentation; not a learned flood model.",
            "mIoU": None,
            "macro_f1": None,
            "latency_ms": None,
            "metrics_status": metrics_status,
            "recommended": cv_disabled,
        },
        {
            "id": "sam",
            "name": sam_name,
            "description": sam_description,
            "mIoU": None,
            "macro_f1": None,
            "latency_ms": None,
            "metrics_status": metrics_status,
            "recommended": False,
        },
    ]
    return jsonify({"models": models})

@app.route("/api/samples", methods=["GET"])
def api_samples():
    samples = []
    if os.path.exists(VAL_IMG_DIR) and os.path.exists(VAL_MASK_DIR):
        img_files = sorted([f for f in os.listdir(VAL_IMG_DIR) if f.endswith(('.jpg', '.png'))])[:8]
        for img_file in img_files:
            stem = os.path.splitext(img_file)[0]
            mask_file = f"{stem}_lab.png"
            mask_path = os.path.join(VAL_MASK_DIR, mask_file)
            if os.path.exists(mask_path):
                samples.append({
                    "id": stem,
                    "image_file": img_file,
                    "mask_file": mask_file,
                    "image_url": f"/api/sample_image/{img_file}",
                    "mask_url": f"/api/sample_mask/{mask_file}"
                })
    return jsonify({"samples": samples})

@app.route("/api/sample_image/<filename>", methods=["GET"])
def api_sample_image(filename):
    return send_from_directory(VAL_IMG_DIR, filename)

@app.route("/api/sample_mask/<filename>", methods=["GET"])
def api_sample_mask(filename):
    return send_from_directory(VAL_MASK_DIR, filename)

@app.route("/api/knowledge_base", methods=["GET"])
def api_knowledge_base():
    docs = []
    kb_dir = os.path.join(PROJECT_ROOT, "knowledge_base")
    for f in os.listdir(kb_dir):
        if f.endswith(('.txt', '.md')) and not f.startswith('.'):
            path = os.path.join(kb_dir, f)
            with open(path, "r", encoding="utf-8") as file:
                content = file.read()
            first_line = next((line.strip().lstrip("# ").strip() for line in content.splitlines() if line.strip()), f)
            document_id_match = re.search(r"^Document ID:\s*(.+)$", content, re.IGNORECASE | re.MULTILINE)
            authority_match = re.search(r"^Authority:\s*(.+)$", content, re.IGNORECASE | re.MULTILINE)
            docs.append({
                "filename": f,
                "title": first_line,
                "document_id": document_id_match.group(1).strip() if document_id_match else os.path.splitext(f)[0],
                "authority": authority_match.group(1).strip() if authority_match else "Unspecified",
                "provenance_verified": False,
                "preview": content[:300] + "...",
                "full_text": content
            })
    return jsonify({"documents": docs})

@app.route("/api/rag/status", methods=["GET"])
def api_rag_status():
    try:
        store, _, _ = get_rag_components()
        return jsonify({
            "status": "ready",
            "retrieval": "hybrid lexical/vector with reciprocal-rank fusion"
            if store.collection is not None else "TF-IDF lexical fallback",
            "index": store.status(),
        })
    except Exception as error:
        print(f"[RAG Status Error] {error}")
        return jsonify({"status": "error", "error": str(error)}), 503

@app.route("/api/rag/query", methods=["POST"])
def api_rag_query():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"status": "error", "error": "Provide a JSON object with a query string."}), 400
    query_text = payload.get("query")
    top_k = payload.get("top_k", 5)
    if not isinstance(query_text, str) or not query_text.strip() or len(query_text) > 2000:
        return jsonify({"status": "error", "error": "query must contain 1 to 2000 characters."}), 400
    if not isinstance(top_k, int) or isinstance(top_k, bool) or not 1 <= top_k <= 8:
        return jsonify({"status": "error", "error": "top_k must be an integer from 1 to 8."}), 400
    try:
        _, retriever_comp, _ = get_rag_components()
        results = retriever_comp.retrieve_query(query_text.strip(), top_k=top_k)
        return jsonify({
            "status": "success",
            "query": query_text.strip(),
            "results": results,
            "note": "Similarity and retrieval scores are ranking signals, not calibrated confidence.",
        })
    except Exception as error:
        print(f"[RAG Query Error] {error}")
        return jsonify({"status": "error", "error": str(error)}), 503

@app.route("/api/overlay/<filename>", methods=["GET"])
def api_get_overlay(filename):
    if os.path.basename(filename) != filename or not filename.endswith(".png"):
        return jsonify({"error": "Invalid image artifact name."}), 400
    path = os.path.join(OVERLAY_CACHE_DIR, filename)
    if os.path.exists(path):
        return send_file(path, mimetype="image/png")
    return jsonify({"error": "Overlay not found"}), 404


def _load_inference_image():
    sample_id = request.form.get("sample_id")
    if sample_id:
        sample_name = os.path.basename(sample_id)
        if sample_name != sample_id or sample_name in {".", ".."}:
            raise ValueError("sample_id must be a sample filename or ID.")
        sample_stem = os.path.splitext(sample_name)[0]
        img_dir, _ = get_sample_dirs()
        for extension in (".jpg", ".jpeg", ".png"):
            sample_path = os.path.join(img_dir, sample_stem + extension)
            if os.path.isfile(sample_path):
                try:
                    with Image.open(sample_path) as image_file:
                        return image_file.convert("RGB")
                except (OSError, ValueError) as image_error:
                    raise ValueError(f"Sample image is unreadable: {image_error}") from image_error
        raise FileNotFoundError(f"FloodNet sample '{sample_stem}' was not found.")

    image_file = request.files.get("image")
    if image_file is None:
        raise ValueError("Provide an image file or sample_id.")
    file_bytes = image_file.read()
    if not file_bytes:
        raise ValueError("Uploaded image file is empty.")
    try:
        with Image.open(io.BytesIO(file_bytes)) as image:
            image.load()
            return image.convert("RGB")
    except (OSError, ValueError) as image_error:
        raise ValueError(f"Invalid image file: {image_error}") from image_error


def _save_inference_png(prefix, image):
    filename = f"{prefix}_{uuid.uuid4().hex}.png"
    path = os.path.join(OVERLAY_CACHE_DIR, filename)
    Image.fromarray(image).save(path, format="PNG")
    return f"/api/overlay/{filename}"


@app.route("/api/segment", methods=["POST"])
def api_segment():
    """Run semantic segmentation without the RAG/LLM reporting pipeline."""
    started_at = time.perf_counter()
    try:
        image = _load_inference_image()
    except FileNotFoundError as image_error:
        return jsonify({"status": "error", "error": str(image_error)}), 404
    except ValueError as image_error:
        return jsonify({"status": "error", "error": str(image_error)}), 400

    requested_model = request.form.get("model", "segformer").strip().lower()
    if requested_model not in {"segformer", "classical", "sam"}:
        return jsonify({
            "status": "error",
            "error": "model must be one of: segformer, classical, sam.",
        }), 400

    original_size = image.size
    image_rgb = np.asarray(
        image.resize((512, 512), Image.Resampling.BILINEAR),
        dtype=np.uint8,
    )
    try:
        if requested_model == "classical":
            _, class_mask = segment_classical_multiclass(image_rgb)
            model_used = "classical"
        elif requested_model == "sam":
            segmenter = get_sam()
            _, class_mask = segmenter.segment_image(image_rgb)
            model_used = getattr(segmenter, "model_id", "sam")
        else:
            segmenter = get_segformer()
            _, class_mask = segmenter.segment_image(image_rgb)
            model_used = getattr(segmenter, "model_id", "segformer")
    except Exception as model_error:
        print(f"[Segmentation API Error] {model_error}")
        return jsonify({
            "status": "error",
            "error": "Segmentation model inference failed.",
            "detail": str(model_error),
        }), 503

    class_mask = np.asarray(class_mask)
    if class_mask.shape != (512, 512) or not np.isin(class_mask, range(10)).all():
        return jsonify({
            "status": "error",
            "error": "Segmentation model returned an invalid 10-class mask.",
        }), 500

    binary_mask = np.isin(class_mask, [1, 3, 5, 8]).astype(np.uint8)
    overlay_rgb = generate_color_overlay(
        image_rgb,
        class_mask,
        target_size=original_size,
    )
    class_mask_url = _save_inference_png(
        "classes",
        np.array(
            Image.fromarray(class_mask.astype(np.uint8)).resize(
                original_size,
                Image.Resampling.NEAREST,
            )
        ),
    )
    binary_mask_url = _save_inference_png(
        "flood",
        np.array(
            Image.fromarray(binary_mask * 255).resize(
                original_size,
                Image.Resampling.NEAREST,
            )
        ),
    )
    overlay_url = _save_inference_png("overlay", overlay_rgb)
    inference_ms = round((time.perf_counter() - started_at) * 1000, 1)

    return jsonify({
        "status": "success",
        "requested_model": requested_model,
        "model_used": model_used,
        "fallback_applied": requested_model != model_used,
        "model_display_name": (
            "FloodNet SegFormer-B3 (Fine-Tuned Checkpoint)"
            if model_used == "segformer" and can_use_finetuned_segformer()
            else "ADE20K-pretrained SegFormer (heuristic FloodNet mapping)"
            if model_used == "segformer"
            else "Classical CV Multi-Space Thresholding"
            if model_used == "classical"
            else model_used.replace("_", " ").title()
        ),
        "image_size": {"width": original_size[0], "height": original_size[1]},
        "mask_encoding": {
            "class_mask": "8-bit PNG; pixel values 0-9 map to FloodNet class IDs.",
            "binary_mask": "8-bit PNG; 255 marks flooded/water classes.",
        },
        "class_mapping": {
            str(class_id): label
            for class_id, (label, _) in COLOR_PALETTE.items()
        },
        "timings": {"inference_ms": inference_ms},
        "damage_metrics": extract_metrics_from_class_mask(class_mask),
        "class_mask_url": class_mask_url,
        "binary_mask_url": binary_mask_url,
        "overlay_url": overlay_url,
    })


@app.route("/api/depth", methods=["POST"])
def api_depth():
    """Estimate relative visible-scene depth, not flood-water column depth."""
    started_at = time.perf_counter()
    try:
        image = _load_inference_image()
    except FileNotFoundError as image_error:
        return jsonify({"status": "error", "error": str(image_error)}), 404
    except ValueError as image_error:
        return jsonify({"status": "error", "error": str(image_error)}), 400

    try:
        depth_rgb = get_relative_depth_estimator().estimate(
            image,
            output_size=image.size,
        )
    except Exception as model_error:
        error_detail = str(model_error)
        print(f"[Depth API Error] {error_detail}")
        user_error = "Relative depth estimation failed."
        if "tensorflow-plugins" in error_detail or "torchvision::nms" in error_detail:
            user_error = (
                "Depth model dependencies are incompatible. Restart the backend with "
                "USE_TF=0 .venv/bin/python dashboard/server.py."
            )
        return jsonify({
            "status": "error",
            "error": user_error,
        }), 503

    inference_ms = round((time.perf_counter() - started_at) * 1000, 1)
    return jsonify({
        "status": "success",
        "model": "Depth Anything V2 Small",
        "depth_type": "relative",
        "units": None,
        "calibrated": False,
        "image_size": {"width": image.width, "height": image.height},
        "timings": {"inference_ms": inference_ms},
        "depth_map_url": _save_inference_png("depth", depth_rgb),
        "note": (
            "Relative camera-to-visible-scene depth only. It is not calibrated "
            "terrain elevation or flood-water column depth."
        ),
    })


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    t0 = time.time()
    try:
        requested_model = request.form.get("model", "").lower()
        use_recommended = request.form.get("use_recommended", "false").lower() in ("true", "1", "yes")
        user_question = request.form.get("question", "").strip()
        if len(user_question) > 2000:
            return jsonify({
                "status": "error",
                "error": "question must contain at most 2000 characters.",
            }), 400
        
        # Check if sample ID provided or file uploaded
        sample_id = request.form.get("sample_id")
        file = request.files.get("image")
        
        img_pil = None
        mask_pil = None
        is_mask_upload = False
        img_dir, mask_dir = get_sample_dirs()
        
        if sample_id:
            clean_id = os.path.splitext(sample_id)[0]
            for ext in (".jpg", ".png", ".jpeg"):
                cand_img = os.path.join(img_dir, clean_id + ext)
                if os.path.exists(cand_img):
                    img_pil = Image.open(cand_img).convert("RGB")
                    break
            cand_mask = os.path.join(mask_dir, f"{clean_id}_lab.png")
            if os.path.exists(cand_mask):
                mask_pil = Image.open(cand_mask).convert("RGB")
                
        elif file:
            filename = (file.filename or "").lower()
            file_bytes = file.read()
            if not file_bytes:
                return jsonify({"status": "error", "error": "Uploaded image file is empty."}), 400
            try:
                pil_opened = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            except Exception as img_err:
                return jsonify({"status": "error", "error": f"Invalid image file: {img_err}"}), 400
                
            if "_lab" in filename or "mask" in filename:
                is_mask_upload = True
                mask_pil = pil_opened
                img_pil = pil_opened
            else:
                img_pil = pil_opened
        else:
            return jsonify({"status": "error", "error": "No image file or sample scenario provided."}), 400

        if img_pil is None:
            return jsonify({"status": "error", "error": "Failed to load image or scenario."}), 400

        target_size = (512, 512)
        orig_size = img_pil.size
        img_rgb = np.array(img_pil.resize(target_size, Image.BILINEAR))
        
        # ── Step 1: Compute Recommended Model & Honour Chosen Model ──
        rec_model, rec_reason = select_best_model_for_image(img_rgb)
        
        if use_recommended or not requested_model or requested_model == "auto":
            model_name = rec_model
            is_recommended = True
            print(f"[Model Recommendation] Auto-selected recommended model '{model_name}' ({rec_reason})")
        else:
            model_name = requested_model
            is_recommended = (model_name == rec_model)
            print(f"[Model Selection] User specified model '{model_name}' (Recommended was '{rec_model}')")
        selected_model_name = model_name

        # ── Step 2: Run Computer Vision Segmentation (with Auto-Fallback) ──
        inference_t0 = time.time()
        class_mask = None
        try:
            if is_mask_upload or model_name == "ground_truth":
                if mask_pil is None:
                    mask_pil = img_pil
                mask_arr = np.array(mask_pil.resize(target_size, Image.NEAREST))
                class_mask = rgb_mask_to_class_mask(mask_arr)
            elif model_name == "classical":
                _, class_mask = segment_classical_multiclass(img_rgb)
            elif model_name == "sam":
                sam = get_sam()
                _, class_mask = sam.segment_image(img_rgb)
                model_name = getattr(sam, "model_id", "sam")
            elif model_name == "segformer":
                segformer = get_segformer()
                _, class_mask = segformer.segment_image(img_rgb)
                model_name = getattr(segformer, "model_id", model_name)
            else:
                segformer = get_segformer()
                _, class_mask = segformer.segment_image(img_rgb)
        except Exception as cv_err:
            print(f"[CV Segmentation Notice] Model '{model_name}' fallback triggered ({cv_err}). Using Classical CV.")
            _, class_mask = segment_classical_multiclass(img_rgb)
            model_name = "classical"
            
        inference_ms = round((time.time() - inference_t0) * 1000, 1)

        depth_t0 = time.time()
        depth_status = "not_applicable" if is_mask_upload else "error"
        depth_error = None
        depth_url = None
        depth_ms = 0.0
        if is_mask_upload:
            depth_error = "Depth estimation is not available for uploaded segmentation masks."
        else:
            try:
                depth_rgb = get_relative_depth_estimator().estimate(
                    img_pil,
                    output_size=orig_size,
                )
                depth_id = f"depth_{uuid.uuid4().hex[:10]}.png"
                Image.fromarray(depth_rgb).save(
                    os.path.join(OVERLAY_CACHE_DIR, depth_id)
                )
                depth_url = f"/api/overlay/{depth_id}"
                depth_status = "success"
            except Exception as depth_err:
                depth_error = str(depth_err)
                print(f"[Depth Estimation Error] {depth_error}")
        depth_ms = round((time.time() - depth_t0) * 1000, 1)

        # ── Step 3: Extract Damage Metrics ──
        damage_metrics = extract_metrics_from_class_mask(class_mask)
        damage_metrics["model_used"] = model_name
        damage_metrics["recommended_model"] = rec_model
        damage_metrics["is_recommended"] = is_recommended
        damage_metrics["inference_time_ms"] = inference_ms

        # ── Step 4: RAG Retrieval from ChromaDB / TF-IDF ──
        rag_t0 = time.time()
        retrieved_protocols = []
        rag_error = None
        try:
            _, retriever_comp, llm_engine_comp = get_rag_components()
            retrieved_protocols = retriever_comp.retrieve_grounded_protocols(damage_metrics)
            if user_question:
                question_protocols = retriever_comp.retrieve_query(user_question, top_k=4)
                seen_citations = {
                    protocol.get("citation_tag")
                    for protocol in question_protocols
                    if protocol.get("citation_tag")
                }
                retrieved_protocols = question_protocols + [
                    protocol
                    for protocol in retrieved_protocols
                    if protocol.get("citation_tag") not in seen_citations
                ]
        except Exception as rag_err:
            rag_error = str(rag_err)
            print(f"[RAG Retrieval Error] No source material was substituted: {rag_error}")
        rag_ms = round((time.time() - rag_t0) * 1000, 1)

        # ── Step 5: LLM Grounded Report Synthesis ──
        llm_t0 = time.time()
        report_data = None
        try:
            if llm_engine_comp is None:
                _, _, llm_engine_comp = get_rag_components()
            report_data = llm_engine_comp.generate_grounded_report(
                damage_metrics,
                retrieved_protocols,
                user_question=user_question or None,
            )
        except Exception as llm_err:
            print(f"[LLM Engine Notice] Using direct fallback synthesis ({llm_err})")
            from report_generation.llm_engine import FloodLLMEngine
            fallback_engine = FloodLLMEngine(provider="offline")
            report_data = fallback_engine.generate_grounded_report(
                damage_metrics,
                retrieved_protocols,
                user_question=user_question or None,
            )
        llm_ms = round((time.time() - llm_t0) * 1000, 1)

        # ── Step 6: Generate Pure Color Mask Overlay ──
        overlay_rgb = generate_color_overlay(img_rgb, class_mask, target_size=orig_size)
        overlay_id = f"overlay_{uuid.uuid4().hex[:10]}.png"
        overlay_save_path = os.path.join(OVERLAY_CACHE_DIR, overlay_id)
        Image.fromarray(overlay_rgb).save(overlay_save_path)
        
        buffered = io.BytesIO()
        Image.fromarray(overlay_rgb).save(buffered, format="PNG")
        overlay_base64 = "data:image/png;base64," + base64.b64encode(buffered.getvalue()).decode("utf-8")

        total_ms = round((time.time() - t0) * 1000, 1)

        MODEL_DISPLAY_NAMES = {
            "segformer": (
                "FloodNet SegFormer-B3 (Fine-Tuned)"
                if can_use_finetuned_segformer()
                else "ADE20K-pretrained SegFormer (heuristic FloodNet mapping)"
            ),
            "classical": "Classical CV (HSV + LAB Thresholding)",
            "sam": "SAM (Segment Anything Model)",
            "ground_truth": "Ground Truth Annotation",
        }

        response_payload = {
            "status": "success",
            "requested_model": requested_model or "auto",
            "timings": {
                "cv_inference_ms": inference_ms,
                "depth_inference_ms": depth_ms,
                "rag_retrieval_ms": rag_ms,
                "llm_synthesis_ms": llm_ms,
                "total_latency_ms": total_ms
            },
            "model_used": model_name,
            "fallback_applied": model_name != selected_model_name,
            "model_display_name": MODEL_DISPLAY_NAMES.get(model_name, model_name),
            "recommended_model": rec_model,
            "recommended_model_display_name": MODEL_DISPLAY_NAMES.get(rec_model, rec_model),
            "recommendation_reason": rec_reason,
            "is_recommended": is_recommended,
            "overlay_url": f"/api/overlay/{overlay_id}",
            "overlay_base64": overlay_base64,
            "depth_status": depth_status,
            "depth_error": depth_error,
            "depth_url": depth_url,
            "depth_model": (
                "Depth Anything V2 Small (relative monocular depth)"
                if depth_status == "success"
                else None
            ),
            "damage_metrics": damage_metrics,
            "retrieved_protocols": [
                {
                    "citation_tag": p.get("citation_tag"),
                    "source_doc": p.get("source_doc"),
                    "section": p.get("section"),
                    "similarity_score": p.get("similarity_score"),
                    "retrieval_score": p.get("retrieval_score"),
                    "authority": p.get("authority"),
                    "snippet": (p.get("content") or p.get("snippet") or "")[:200] + "..."
                }
                for p in retrieved_protocols[:4]
            ],
            "rag_status": "error" if rag_error else ("retrieved" if retrieved_protocols else "no_matches"),
            "rag_error": rag_error,
            "sitrep_report": report_data.get("incident_report", {}),
            "follow_up_answer": report_data.get("follow_up_answer"),
            "markdown_report": report_data.get("markdown_rendered", "")
        }

        return jsonify(response_payload)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "error": "Analysis processing encountered an issue.",
            "detail": str(e)
        }), 500

# ── Export PDF & DOCX Endpoints ───────────────────────────────────────────
from report_generation.export_utils import generate_pdf_report, generate_docx_report

@app.route("/api/export_pdf", methods=["GET", "POST", "OPTIONS"])
def api_export_pdf():
    try:
        report_data = request.get_json(force=True, silent=True) or {}
        pdf_path = os.path.join(tempfile.gettempdir(), f"FloodSense_SITREP_{uuid.uuid4().hex[:8]}.pdf")
        
        # If empty report data, load sample report if available
        if not report_data or "incident_report" not in report_data:
            sample_json = os.path.join(PROJECT_ROOT, "results", "sample_disaster_report.json")
            if os.path.exists(sample_json):
                with open(sample_json, "r", encoding="utf-8") as f:
                    report_data = json.load(f)
                    
        generate_pdf_report(report_data, pdf_path)
        return send_file(
            pdf_path,
            as_attachment=True,
            download_name="FloodSense_Image_Assessment_Report.pdf",
            mimetype="application/pdf"
        )
    except Exception as e:
        print(f"PDF generation error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/export_docx", methods=["GET", "POST", "OPTIONS"])
def api_export_docx():
    try:
        report_data = request.get_json(force=True, silent=True) or {}
        docx_path = os.path.join(tempfile.gettempdir(), f"FloodSense_SITREP_{uuid.uuid4().hex[:8]}.docx")
        
        # If empty report data, load sample report if available
        if not report_data or "incident_report" not in report_data:
            sample_json = os.path.join(PROJECT_ROOT, "results", "sample_disaster_report.json")
            if os.path.exists(sample_json):
                with open(sample_json, "r", encoding="utf-8") as f:
                    report_data = json.load(f)
                    
        generate_docx_report(report_data, docx_path)
        return send_file(
            docx_path,
            as_attachment=True,
            download_name="FloodSense_Image_Assessment_Report.docx",
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
    except Exception as e:
        print(f"DOCX generation error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"\n=======================================================")
    print(f"  FLOODSENSE SERVER RUNNING ON http://localhost:{port}   ")
    print(f"=======================================================\n")
    app.run(host="0.0.0.0", port=port, debug=False)
