# FloodSense

Multimodal flood damage extraction, computer vision benchmarking, and RAG-LLM disaster reporting dashboard.

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

Promote an experimental checkpoint only if it improves validation mIoU
meaningfully on the same fixed split; inspect per-class IoU as well, since
class balancing can help rare classes while hurting others.

The dashboard uses `checkpoints/segformer_full/segformer_best.pt` for its
FloodNet SegFormer-B3 predictions when that file is available. Set
`FLOODSENSE_SEGFORMER_CHECKPOINT` to override its location. Without the
checkpoint, it falls back to the pretrained SegFormer baseline.

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
  pixels are values `0`-`9`; binary flood pixels are `0` or `255`.
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
