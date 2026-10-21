"""MCP tools backed by the FloodSense REST API."""

import os
from pathlib import Path
from typing import Literal

import httpx
from mcp.server.fastmcp import FastMCP


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_URL = os.environ.get("FLOODSENSE_BACKEND_URL", "http://localhost:5050").rstrip("/")
MAX_IMAGE_BYTES = 20 * 1024 * 1024
REQUEST_TIMEOUT_SECONDS = 300.0
mcp = FastMCP("FloodSense")


def _allowed_image_dirs() -> list[Path]:
    configured_dirs = os.environ.get("FLOODSENSE_ALLOWED_IMAGE_DIRS")
    if not configured_dirs:
        return [PROJECT_ROOT.resolve()]
    return [Path(directory).expanduser().resolve() for directory in configured_dirs.split(os.pathsep) if directory]


def _resolve_image_path(image_path: str) -> Path:
    path = Path(image_path).expanduser().resolve()
    if not any(path.is_relative_to(directory) for directory in _allowed_image_dirs()):
        raise ValueError(
            "Image path is outside the allowed directories. Set "
            "FLOODSENSE_ALLOWED_IMAGE_DIRS to grant access."
        )
    if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise ValueError("Image must be a JPG, PNG, or WebP file.")
    if not path.is_file():
        raise ValueError(f"Image file does not exist: {path}")
    if path.stat().st_size > MAX_IMAGE_BYTES:
        raise ValueError("Image exceeds the 20 MB size limit.")
    if path.stat().st_size == 0:
        raise ValueError("Image file is empty.")
    return path


def _image_request(
    sample_id: str | None,
    image_path: str | None,
) -> tuple[dict[str, str] | None, dict[str, tuple[str, bytes, str]] | None]:
    if bool(sample_id) == bool(image_path):
        raise ValueError("Provide exactly one of sample_id or image_path.")
    if sample_id:
        return {"sample_id": sample_id}, None

    path = _resolve_image_path(image_path or "")
    media_type = "image/png" if path.suffix.lower() == ".png" else (
        "image/webp" if path.suffix.lower() == ".webp" else "image/jpeg"
    )
    return None, {"image": (path.name, path.read_bytes(), media_type)}


def _make_artifact_urls_absolute(value, key: str | None = None):
    if isinstance(value, dict):
        return {
            child_key: _make_artifact_urls_absolute(item, child_key)
            for child_key, item in value.items()
        }
    if isinstance(value, list):
        return [_make_artifact_urls_absolute(item, key) for item in value]
    if isinstance(value, str) and key and key.endswith("_url") and value.startswith("/"):
        return f"{BACKEND_URL}{value}"
    return value


def _request_json(
    method: str,
    endpoint: str,
    *,
    data: dict[str, str] | None = None,
    files: dict[str, tuple[str, bytes, str]] | None = None,
    params: dict[str, str] | None = None,
) -> dict:
    try:
        response = httpx.request(
            method,
            f"{BACKEND_URL}{endpoint}",
            data=data,
            files=files,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as error:
        raise RuntimeError(f"FloodSense backend request failed: {error}") from error

    try:
        payload = response.json()
    except ValueError as error:
        if not response.is_success:
            raise RuntimeError(
                f"FloodSense backend returned HTTP {response.status_code}: "
                f"{response.text[:500]}"
            ) from error
        raise RuntimeError("FloodSense backend returned a non-JSON response.") from error

    if not response.is_success:
        detail = (
            payload.get("error") or payload.get("detail") or response.reason_phrase
            if isinstance(payload, dict)
            else str(payload)
        )
        raise RuntimeError(f"FloodSense backend returned HTTP {response.status_code}: {detail}")
    if not isinstance(payload, dict):
        raise RuntimeError("FloodSense backend returned an unexpected JSON response.")
    return _make_artifact_urls_absolute(payload)


@mcp.tool()
def get_backend_status() -> dict:
    """Check whether the FloodSense REST backend is online."""
    return _request_json("GET", "/api/status")


@mcp.tool()
def list_segmentation_models() -> dict:
    """List available segmentation models and their reported benchmark metrics."""
    return _request_json("GET", "/api/models")


@mcp.tool()
def list_sample_images() -> dict:
    """List the sample FloodNet images available to the backend."""
    return _request_json("GET", "/api/samples")


@mcp.tool()
def segment_image(
    sample_id: str | None = None,
    image_path: str | None = None,
    model: Literal["segformer", "classical", "sam"] = "segformer",
) -> dict:
    """Segment a sample image or an allowed local image and return metrics and mask URLs."""
    data, files = _image_request(sample_id, image_path)
    if data is None:
        data = {}
    data["model"] = model
    return _request_json("POST", "/api/segment", data=data, files=files)


@mcp.tool()
def estimate_relative_depth(
    sample_id: str | None = None,
    image_path: str | None = None,
) -> dict:
    """Estimate relative visible-scene depth; this does not estimate floodwater depth."""
    data, files = _image_request(sample_id, image_path)
    return _request_json("POST", "/api/depth", data=data, files=files)


@mcp.tool()
def analyze_flood_image(
    sample_id: str | None = None,
    image_path: str | None = None,
    model: Literal["auto", "segformer", "classical", "sam"] = "auto",
) -> dict:
    """Run combined segmentation, relative-depth, and SITREP analysis for an image."""
    data, files = _image_request(sample_id, image_path)
    request_data = data or {}
    request_data["model"] = model
    request_data["use_recommended"] = "true" if model == "auto" else "false"
    return _request_json("POST", "/api/analyze", data=request_data, files=files)
