# FloodSense

Multimodal flood damage extraction, computer vision benchmarking, and RAG-LLM disaster reporting dashboard.

## FloodNet sample images

FloodSense uses selected image/mask pairs from FloodNet, a high-resolution aerial
imagery dataset for post-flood scene understanding. The included Studio samples
retain their dataset image IDs and use captions based only on visible scene
content:

| Dataset image ID | Caption |
|------------------|---------|
| `10169` | Homes beside open ground |
| `10815` | Homes, roads, and dense trees |
| `6423` | Road junction and residential blocks |

These IDs are dataset identifiers, not locations. The sample metadata available
to this app does not verify city, region, coordinates, flood cause, or incident
severity, so the UI does not assign those details to the images. The benchmark
uses pixel-level semantic labels for background, flooded/non-flooded buildings,
flooded/non-flooded roads, water, trees, vehicles, pools, and grass. Captions
describe visible content and should not be read as geolocation or incident
claims.

## Fine-tune the segmentation model

The SegFormer trainer uses FloodNet's official train split for training and
official validation split for model selection. The official test split is not
used for training or model selection. For custom `--img_dir`/`--mask_dir`
datasets, it uses a seeded 80/20 split. Make sure the labeled FloodNet train
images and the official validation image/mask pairs are available before
starting:

```bash
git lfs pull --include='FloodNet/FloodNet-Supervised_v1.0/train/**,FloodNet/FloodNet-Supervised_v1.0/val/**,FloodNet/ColorMasks-FloodNetv1/ColorMasks-TrainSet/**,FloodNet/ColorMasks-FloodNetv1/ColorMasks-ValSet/**'
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements_finetune.txt
.venv/bin/python models_benchmark/06_segformer_finetune.py --epochs 30
```

Git LFS only downloads files tracked by this repository; it does not supply
missing dataset files. This repository may not contain the complete train image set in Git LFS. To
download only images that have matching local segmentation masks, run:

```bash
.venv/bin/python models_benchmark/download_floodnet_train_images.py
```

The downloader uses the [FloodNet VQA mirror](https://huggingface.co/datasets/takara-ai/FloodNet_2021-Track_2_Dataset_HF);
its dataset card declares CC BY-SA 4.0. It filters the mirror's train folder
against the official 398 labeled training IDs from the
[FloodNet archive](https://huggingface.co/datasets/torchgeo/floodnet) and
`ColorMasks-TrainSet`, verifies each downloaded file's size and SHA-256, and
does not download or train on unlabeled, validation, or test images. It writes
the official training ID manifest under the ignored `FloodNet/` dataset folder.
The official test split remains excluded from training and model selection.
Cite Rahnemoonfar et al.,
*FloodNet: A High Resolution Aerial Imagery Dataset for Post Flood Scene
Understanding* (2020).

Training applies paired geometric augmentations and mild image-only color
augmentations. It selects the best checkpoint by validation mIoU and stops early
when validation performance plateaus. Checkpoints are written to
`checkpoints/segformer_full/`, with metrics in
`results/segformer_full_finetune_results.json`.

To experiment with fine-tuning the existing best checkpoint using capped
class-balanced focal loss, use separate output paths so the dashboard's current
checkpoint remains untouched:

```bash
.venv/bin/python models_benchmark/06_segformer_finetune.py \
  --init_checkpoint checkpoints/segformer_full/segformer_best.pt \
  --class_weight_cap 3 \
  --lr 0.000005 \
  --epochs 4 \
  --checkpoint_dir checkpoints/segformer_miou_tune \
  --results_file results/segformer_miou_tune.json
```

For a reproducible image-level class-balanced experiment, use the dedicated
config below. It samples only the 398 officially labeled training pairs with
replacement, giving more sampling probability to images containing classes
that appear in fewer training images. It does not create new labels or use the
unlabeled images. The official validation split is still reserved for model
selection:

```bash
PYTHONPATH=. USE_TF=0 .venv/bin/python \
  models_benchmark/06_segformer_finetune.py \
  --config configs/segmentation/segformer_b3_class_balanced.json
```

To train a DeepLabV3+ / ResNet-50 comparison model based on Chen et al.'s
DeepLabV3+ architecture paper, use the separate full-training recipe below.
This is an architecture reproduction on FloodNet, not a claim to reproduce
the paper's original datasets or full training protocol. It uses the same
official FloodNet train/validation split, 512-pixel inputs, class mapping,
Dice/Focal objective, and validation metrics as the SegFormer experiments.
The batch size is two because DeepLabV3+'s pooled decoder branch requires more
than one item per batch. The checkpoint is isolated from the production model.

```bash
PYTHONPATH=. USE_TF=0 .venv/bin/python \
  models_benchmark/06_segformer_finetune.py \
  --config configs/segmentation/deeplabv3plus_floodnet.json
PYTHONPATH=. USE_TF=0 .venv/bin/python \
  models_benchmark/evaluate_segmentation_experiments.py \
  --config configs/segmentation/compare_deeplabv3plus.json \
  --output results/segmentation_comparison_deeplabv3plus.json
```

Promote an experimental checkpoint only if it improves validation mIoU
meaningfully on the same fixed split; inspect per-class IoU as well, since
class balancing can help rare classes while hurting others.

The dashboard uses `checkpoints/segformer_full/segformer_best.pt` for
FloodNet SegFormer-B3 predictions only when the checkpoint is available and
heavy computer vision is enabled. Set `FLOODSENSE_SEGFORMER_CHECKPOINT` to
override its location. Without that checkpoint, it can use an ADE20K-pretrained
SegFormer with heuristic FloodNet label mapping.

To explicitly run a fine-tuned SegFormer on a cloud backend that otherwise
disables heavy computer vision, set
`FLOODSENSE_ENABLE_FINETUNED_SEGFORMER=1`. For a mounted local file, set
`FLOODSENSE_SEGFORMER_CHECKPOINT` to its path. To download a private Hugging
Face Hub model artifact on demand, set `FLOODSENSE_SEGFORMER_REPO_ID`,
`FLOODSENSE_SEGFORMER_REPO_FILENAME` (default `segformer_best.pt`), and
`HF_TOKEN` as a hosting-platform secret. `FLOODSENSE_MODEL_CACHE_DIR` can
select a persistent cache location. Set
`FLOODSENSE_SEGFORMER_DISPLAY_NAME=Class-balanced SegFormer-B3` so
`/api/models` and inference responses identify the intended checkpoint.
This opt-in applies to the SegFormer segmentation path only; the cloud fallback
for SAM and other computer-vision paths remains unchanged. If explicitly
enabled but the checkpoint is missing or inference fails, the API returns an
error rather than silently using classical segmentation. Keep the checkpoint
in private model storage or a private mounted volume; `checkpoints/` is
intentionally excluded from Git and the Docker build context.

When the opt-in is off and `DISABLE_HEAVY_CV=1` (as in the included CPU
container configuration), SegFormer and SAM requests use classical
color/threshold segmentation; the API response reports the model actually
used. No current held-out benchmark is available, so the backend does not
publish verified mIoU or F1 scores.

The dashboard also produces a relative monocular depth map using
`depth-anything/Depth-Anything-V2-Small-hf`. The model is downloaded on first
use. Depth colors only show relative ordering within the image; they are not
calibrated distances or flood depth measurements. The estimator has not been
fine-tuned on FloodNet depth labels.

### Backend inference API

The Flask backend exposes independent model endpoints for an existing client UI:

- `GET /api/status` — service status.
- `GET /api/models` — available segmentation backends and validation metadata.
- `POST /api/segment` — multipart form with `image=<file>` or `sample_id=<id>`;
  optional `model=segformer|classical|sam`. Returns model/timing/metrics and
  URLs for the class-ID PNG, binary flood PNG, and colored overlay. Class-ID
  pixels are values `0`-`9`; binary flood pixels are `0` or `255`. In inference,
  every class-9 Grass pixel is reclassified to class-5 Water before masks and
  flood metrics are generated. This intentionally treats vegetation as water
  and can overstate inundation; the API response identifies this remapping.
- `POST /api/depth` — multipart form with `image=<file>` or `sample_id=<id>`.
  Returns a relative-depth visualization URL and inference timing. This is not
  metric distance or flood-water depth.
- `POST /api/analyze` — legacy combined segmentation, RAG, and SITREP endpoint.
- `GET /api/rag/status` — lazily initializes the RAG index and reports its backend,
  indexed chunk count, and source-document metadata.
- `POST /api/rag/query` — JSON body `{"query":"...","top_k":5}`; returns
  source/section citations and retrieved passages without invoking the report LLM.
- `GET /api/overlay/<filename>` — fetch a generated PNG artifact.

Generated inference artifact links are temporary and are held in the server's
temporary overlay cache.

### RAG knowledge base

The current index ingests the four curated `.txt` files in `knowledge_base/`:

- `ndma_flood_guidelines.txt` — India-focused flood response and infrastructure
  guidance, with an NDMA/DM Act authority claim in the text.
- `ndrf_sdrf_sop.txt` — India-focused rescue and evacuation procedures, with an
  NDRF/SDRF authority claim in the text.
- `fema_flood_protocols.txt` — despite its filename, its content describes
  Ministry of Jal Shakti/CWC/State-level guidance; the source identity needs
  verification and should not be presented as FEMA material.
- `historical_flood_cases.txt` — curated examples for Chennai, Kerala, Assam,
  Uttarakhand, and Mumbai floods.

These are repository-provided reference texts, not a verified collection of
official source publications. Their issuing body, dates, and operational
thresholds have not been independently checked. No external documents are
downloaded or silently added. Verify provenance and replace or supplement these
texts with current, authorized publications before using generated content for
real incident decisions. Do not treat model similarity scores as confidence.

Synchronize the local index after changing knowledge-base files:

```bash
python3 -m rag_pipeline.ingest
```

The default backend attempts Chroma plus Sentence Transformers, falling back to
local TF-IDF lexical search if those dependencies or model initialization are
unavailable. Set `USE_TFIDF_RAG=1` to force lexical-only retrieval (also the
default on Render). Chroma retrieval fuses semantic and lexical rankings; the
index is reconciled against the current source files on initialization. The
current evaluator uses hand-authored document/keyword labels and is a smoke
benchmark, not an expert-validated measure of operational accuracy.

### Reversible Hugging Face segmentation trial

An isolated Gradio prototype for Hugging Face Spaces is under [`hf_space/`](./hf_space/).
It is on the `hf-spaces-poc` branch; the pre-trial project state is preserved
locally on `floodsense-pre-hf-spaces` at commit `47a2861`. The prototype does not
change the Flask API, Vercel frontend, or production `main` branch. It currently
tests image segmentation only, using a public ADE20K SegFormer baseline and
approximate FloodNet-style class mapping; it is not the fine-tuned FloodNet
model and does not include depth, RAG, or conversational image Q&A. See
[`hf_space/README.md`](./hf_space/README.md) for trial and publishing instructions.

### Local MCP server

FloodSense can also be used as a local stdio MCP server by compatible MCP
clients. The MCP tools wrap the REST endpoints above; the web UI continues to
use the REST API directly.

Install the MCP dependencies into the project environment:

```bash
.venv/bin/python -m pip install -r requirements-mcp.txt
```

Start the backend, then run the MCP server from the repository root:

```bash
USE_TF=0 .venv/bin/python dashboard/server.py
.venv/bin/python -m mcp_server
```

The server provides tools for backend status, model and sample discovery,
segmentation, relative-scene-depth estimation, and combined SITREP analysis.
Image tools accept a backend `sample_id` or an `image_path`. Local image paths
are restricted to the repository by default; set
`FLOODSENSE_ALLOWED_IMAGE_DIRS` to a path-separated list of additional allowed
directories. Images must be JPG, PNG, or WebP and no larger than 20 MB.

The repository includes `.vscode/mcp.json` for VS Code MCP discovery on
macOS/Linux with the project's `.venv`. On Windows, update `command` to the
virtual environment's Python executable path. MCP and backend processes are
separate; both must be running for inference tools to work. When deploying
remotely, the MCP transport and authentication can be added without changing
these tool semantics or the existing UI API.
