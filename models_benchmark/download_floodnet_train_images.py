"""Download FloodNet training images that have matching local segmentation masks."""

import argparse
import concurrent.futures
import hashlib
import io
import os
import re
import shutil
import tempfile
import threading
import zipfile
from pathlib import Path
from urllib.parse import quote

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASET_ID = "takara-ai/FloodNet_2021-Track_2_Dataset_HF"
API_URL = f"https://huggingface.co/api/datasets/{DATASET_ID}/tree/main/train_image/img"
RESOLVE_URL = f"https://huggingface.co/datasets/{DATASET_ID}/resolve/main"
OFFICIAL_ARCHIVE_URL = (
    "https://huggingface.co/datasets/torchgeo/floodnet/resolve/main/floodnet.zip"
)
TRAIN_IMAGE_DIR = (
    PROJECT_ROOT / "FloodNet" / "FloodNet-Supervised_v1.0" / "train" / "train-org-img"
)
TRAIN_MASK_DIR = (
    PROJECT_ROOT / "FloodNet" / "ColorMasks-FloodNetv1" / "ColorMasks-TrainSet"
)
TRAIN_MANIFEST_PATH = (
    PROJECT_ROOT / "FloodNet" / "FloodNet-Supervised_v1.0" / "train" / "train-labeled-ids.txt"
)
MINIMUM_FREE_SPACE_BYTES = 1024**3
REMOTE_RANGE_SIZE = 256 * 1024
_thread_local = threading.local()


def _session():
    if not hasattr(_thread_local, "session"):
        session = requests.Session()
        retries = Retry(
            total=5,
            backoff_factor=1,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=("GET",),
        )
        session.mount("https://", HTTPAdapter(max_retries=retries))
        _thread_local.session = session
    return _thread_local.session


def _list_training_images():
    url = f"{API_URL}?recursive=true&expand=false&limit=1000"
    entries = []
    while url:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        entries.extend(response.json())
        next_page = response.links.get("next")
        url = next_page["url"] if next_page else None
    return entries


class _RemoteRangeReader:
    def __init__(self, url):
        self.url = url
        self.session = requests.Session()
        response = self.session.head(url, allow_redirects=True, timeout=60)
        response.raise_for_status()
        self.size = int(response.headers["Content-Length"])
        self.position = 0
        self.cache_start = -1
        self.cache = b""

    def seek(self, offset, whence=io.SEEK_SET):
        if whence == io.SEEK_SET:
            position = offset
        elif whence == io.SEEK_CUR:
            position = self.position + offset
        elif whence == io.SEEK_END:
            position = self.size + offset
        else:
            raise ValueError("Invalid ZIP seek mode.")
        if not 0 <= position <= self.size:
            raise ValueError("ZIP seek outside the remote archive.")
        self.position = position
        return position

    def tell(self):
        return self.position

    def read(self, size=-1):
        if size is None or size < 0:
            size = self.size - self.position
        size = min(size, self.size - self.position)
        output = bytearray()
        while size:
            if not self.cache_start <= self.position < self.cache_start + len(self.cache):
                self.cache_start = self.position
                end = min(self.size - 1, self.cache_start + REMOTE_RANGE_SIZE - 1)
                response = self.session.get(
                    self.url,
                    headers={"Range": f"bytes={self.cache_start}-{end}"},
                    timeout=(30, 90),
                )
                if response.status_code != 206:
                    raise RuntimeError(
                        f"FloodNet archive range request returned HTTP {response.status_code}."
                    )
                self.cache = response.content
                if len(self.cache) != end - self.cache_start + 1:
                    raise RuntimeError("FloodNet archive returned an incomplete byte range.")
            cache_offset = self.position - self.cache_start
            chunk_size = min(size, len(self.cache) - cache_offset)
            output.extend(self.cache[cache_offset:cache_offset + chunk_size])
            self.position += chunk_size
            size -= chunk_size
        return bytes(output)

    def readable(self):
        return True

    def seekable(self):
        return True


def _official_labeled_train_ids():
    with zipfile.ZipFile(_RemoteRangeReader(OFFICIAL_ARCHIVE_URL)) as archive:
        image_ids = {
            match.group(1)
            for item in archive.infolist()
            if item.filename.startswith("floodnet/Train/Labeled/")
            and "/image/" in item.filename.lower()
            and (
                match := re.search(
                    r"/([^/]+)\.(?:jpg|jpeg)$",
                    item.filename,
                    re.IGNORECASE,
                )
            )
        }
    if len(image_ids) != 398:
        raise RuntimeError(
            f"Expected 398 official labeled FloodNet train images; found {len(image_ids)}."
        )
    return image_ids


def _matching_training_images(
    entries,
    image_dir=TRAIN_IMAGE_DIR,
    mask_dir=TRAIN_MASK_DIR,
    official_ids=None,
):
    images = {}
    for entry in entries:
        path = Path(entry["path"])
        if path.suffix.lower() not in {".jpg", ".jpeg"}:
            continue
        if official_ids is not None and path.stem not in official_ids:
            continue
        mask_path = mask_dir / f"{path.stem}_lab.png"
        if not mask_path.is_file():
            continue
        if path.stem in images:
            raise ValueError(f"Duplicate FloodNet training image ID: {path.stem}")
        images[path.stem] = entry

    return [
        entry for _, entry in sorted(images.items())
    ]


def _download_image(entry):
    source_path = entry["path"]
    filename = Path(source_path).name
    stem = Path(filename).stem
    destination = TRAIN_IMAGE_DIR / f"{stem}.jpg"
    if destination.is_file():
        return False

    lfs_metadata = entry.get("lfs") or {}
    expected_size = entry.get("size")
    expected_sha256 = lfs_metadata.get("oid")
    if not isinstance(expected_size, int) or not expected_sha256:
        raise ValueError(f"Missing file integrity metadata for {source_path}")

    url = f"{RESOLVE_URL}/{quote(source_path, safe='/')}"
    response = _session().get(url, stream=True, timeout=(30, 180))
    response.raise_for_status()
    downloaded_size = 0
    digest = hashlib.sha256()
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=TRAIN_IMAGE_DIR,
            prefix=".floodnet-",
            suffix=".part",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                temporary_file.write(chunk)
                digest.update(chunk)
                downloaded_size += len(chunk)

        if downloaded_size != expected_size:
            raise ValueError(
                f"Incomplete download for {filename}: "
                f"received {downloaded_size} of {expected_size} bytes."
            )
        if digest.hexdigest() != expected_sha256:
            raise ValueError(f"SHA-256 verification failed for {filename}.")
        os.replace(temporary_path, destination)
        temporary_path = None
    finally:
        response.close()
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return True


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Fetch only FloodNet train images with matching local class masks. "
            "Validation and test images are not downloaded."
        )
    )
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    if args.workers < 1:
        parser.error("--workers must be at least 1")
    if not TRAIN_MASK_DIR.is_dir():
        raise FileNotFoundError(f"FloodNet training masks not found: {TRAIN_MASK_DIR}")
    TRAIN_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    entries = _list_training_images()
    official_ids = _official_labeled_train_ids()
    selected_images = _matching_training_images(
        entries,
        official_ids=official_ids,
    )
    selected_ids = {Path(entry["path"]).stem for entry in selected_images}
    if len(selected_ids) != 398:
        raise RuntimeError(
            "Expected all 398 official labeled train images to have matching masks; "
            f"found {len(selected_ids)}."
        )
    TRAIN_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    TRAIN_MANIFEST_PATH.write_text(
        "\n".join(sorted(official_ids)) + "\n",
        encoding="utf-8",
    )
    missing = [
        entry for entry in selected_images
        if not (TRAIN_IMAGE_DIR / f"{Path(entry['path']).stem}.jpg").is_file()
    ]
    expected_bytes = sum(entry["size"] for entry in missing)
    free_bytes = shutil.disk_usage(TRAIN_IMAGE_DIR).free
    if free_bytes < expected_bytes + MINIMUM_FREE_SPACE_BYTES:
        raise OSError(
            f"Not enough free disk space: need at least "
            f"{(expected_bytes + MINIMUM_FREE_SPACE_BYTES) / 1024**3:.2f} GiB, "
            f"have {free_bytes / 1024**3:.2f} GiB."
        )

    print(
        f"Downloading {len(missing)} missing official labeled train images "
        f"({expected_bytes / 1024**3:.2f} GiB) with {args.workers} workers. "
        "Unlabeled train, validation, and test images are excluded.",
        flush=True,
    )
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(_download_image, entry) for entry in missing]
        completed = 0
        for future in concurrent.futures.as_completed(futures):
            future.result()
            completed += 1
            if completed % 25 == 0 or completed == len(futures):
                print(f"Verified {completed}/{len(futures)} train images.", flush=True)

    print(f"Training image download complete: {TRAIN_IMAGE_DIR}", flush=True)


if __name__ == "__main__":
    main()
