# FloodSense Baseline Audit

Audit date: 2026-10-22

## Executive summary

The repository contains a 10-class FloodNet SegFormer-B3 checkpoint and
historical evaluation JSON. The official labeled training and validation pairs
are now locally accessible; validation images and masks are symlinked to
verified local Git LFS cache objects to avoid another multi-gigabyte copy.
Seven missing labeled training images were fetched from the ungated
Hugging Face mirror after checking its `cc-by-sa-4.0` metadata.

The palette workbook could not be recovered, and two mask colors are not in
the documented 10-class palette. Those pixels are explicitly ignored by
training and evaluation rather than silently converted to background. The
existing checkpoint was re-evaluated on all 450 official validation pairs,
then fine-tuned from that checkpoint using all 398 official labeled training
pairs. Training stopped early after 16 epochs (best validation mIoU at epoch
8). The new checkpoint's validation mIoU is 0.5440 versus 0.5429 for the old
checkpoint under the same label policy. This is a small validation-only
increase, not evidence of a meaningful or independent test improvement.

A separate class-balanced B3 run sampled the 398 labeled training images by
class presence and stopped after 13 epochs (best epoch 5). It scored validation
mIoU 0.5510 and macro-F1 0.6847, above the old checkpoint's 0.5429 and 0.6587,
but pixel accuracy fell from 0.8726 to 0.8619 and flooded-road IoU fell from
0.3308 to 0.2374. These mixed validation tradeoffs do not justify replacing
the production checkpoint; no independent test result is available.

## Verified local baseline

| Area | Evidence | Finding |
|---|---|---|
| Data present | `FloodNet/` | 1,423 training images are present; all 398 official labeled IDs have readable matching masks. The local validation split has 450 readable image/mask pairs. Validation images and train/validation masks use symlinks to verified LFS objects. The other 1,025 train images are outside the official labeled-ID manifest and are excluded from training. |
| Model checkpoint | `checkpoints/segformer_full/segformer_best.pt` | Local 180 MB state dict; 644 tensors; decoder classifier has 10 output channels. It is ignored by Git and excluded by `.dockerignore`. |
| Fine-tuned checkpoint | `checkpoints/segformer_retrained_398/segformer_best.pt` | Local 180 MB checkpoint warm-started from the historical model; 398 official train pairs, 450 validation pairs, 16 epochs, best epoch 8. Independently re-evaluated; kept separate, not connected to the backend or deployed. |
| Class-balanced checkpoint | `checkpoints/segformer_b3_class_balanced/segformer_best.pt` | Local experimental checkpoint trained on the same 398 labeled images with inverse-square-root image-presence sampling; 13 epochs, best epoch 5. Validation mIoU 0.5510, macro-F1 0.6847, accuracy 0.8619; class tradeoffs are mixed. Not connected to the backend or deployed. |
| SegFormer-B4 smoke | `checkpoints/segformer_b4_smoke/segformer_best.pt` | Local 245 MB checkpoint initialized from its own `nvidia/mit-b4` encoder weights. Four training batches only; not a quality candidate and not deployed. |
| DeepLabV3+ smoke | `checkpoints/deeplabv3plus_smoke/deeplabv3plus_best.pt` | Local 102 MB checkpoint with ImageNet-pretrained ResNet-50 encoder. Four training batches only; optional implementation dependency is isolated from production requirements. |
| Trainer and evaluator | `models_benchmark/06_segformer_finetune.py`, `models_benchmark/evaluate_segmentation_experiments.py` | Configurable SegFormer-B3/B4 and optional DeepLabV3+, 512-pixel inputs, paired augmentations, explicit official train-ID manifest, official validation used for model selection, and test split excluded. |
| Historical result | `results/segformer_full_finetune_results.json` | Reports best mIoU 0.5751 at epoch 7, 383 train and 95 validation pairs, but does not record `split_strategy` or `train_label_policy`. Treat as an unverified historical result, not a verified held-out score. |
| Warm-start result | `results/segformer_miou_tune.json` | Reports mIoU 0.5761 at epoch 1 after four epochs, using the previous checkpoint; it is not an independent run and does not establish a robust improvement. |
| Other checkpoints | `checkpoints/segformer/`, `checkpoints/floodseg/` and related results | Some filenames report mIoU 1.0000. Their split provenance is not established; do not use those suffixes as performance evidence. |
| Runtime | `Dockerfile`, `.dockerignore`, `dashboard/server.py` | Docker sets `DISABLE_HEAVY_CV=1`; both the SegFormer and SAM slots return the classical segmentation implementation. All checkpoints and the FloodNet dataset are excluded from the image. |
| Inference contract | `POST /api/segment`, `POST /api/analyze` | Accepts an upload or sample ID, resizes to 512×512 for inference, emits FloodNet class IDs 0–9, and treats IDs 1, 3, 5, and 8 as flood/water for the binary mask. `/api/analyze` also invokes relative depth and RAG/report generation synchronously. |
| Persistence | Frontend API client | Chat messages, image paths, generated masks, and damage statistics are persisted through Supabase; the Flask inference service itself has no durable inference-job store or worker queue. |
| Depth | `models_benchmark/09_relative_depth.py`, `/api/depth` | Monocular relative-scene depth, not metric distance or floodwater depth. |
| Physical-area metrics | `damage_extraction/damage_extractor.py` | The current square-metre helper assumes a 30 m nadir UAV altitude and 73° field of view. Arbitrary uploaded images do not provide those calibration facts, so such areas are estimates, not measured quantities. |

The trainer's `_validate` already accumulates a single confusion matrix across
the validation loader. A separate issue existed in
`models_benchmark/utils/metrics.py`: its benchmark helpers assigned perfect
scores to classes absent from both prediction and ground truth and averaged
per-image scores. Those helpers now exclude empty classes from macro averages
and aggregate dataset-level confusion counts. This correction does not
retroactively validate old benchmark JSON files.

## Dataset integrity and checkpoint re-evaluation

`models_benchmark/audit_floodnet_dataset.py` audits local split pairing,
readability, duplicate IDs, dimensions, exact palette frequencies, unknown
colors, and split-ID overlap. The structured snapshot is
`results/floodnet_dataset_audit.json`.

- Official labeled train IDs: 398; readable image/mask pairs: 398.
- Official validation IDs: 450; readable image/mask pairs: 450.
- Train and validation image-ID overlap: zero. Split-level event/group metadata
  is unavailable, so the official split is preserved without claiming
  event-level independence.
- Class-present image counts in the train split are sparse for background
  (5/398), flooded buildings (36/398), and flooded roads (44/398); other class
  counts are recorded by the audit JSON. The validation split has 6/450,
  49/450, and 57/450 images containing those classes, respectively. The
  398-image labeled split is therefore small and class-diverse coverage is
  uneven.
- The train image directory contains 1,423 files, including 1,025 images not in
  the official labeled manifest. They are not included in the training set.
- Missing official training image IDs `6919`, `7214`, `7646`, `7650`, `8482`,
  `8924`, and `9036` were retrieved and SHA-256-verified by the existing
  downloader (32,766,106 bytes total).
- The masks use 1024×1024 RGB images; source images are 4000×3000 or
  4592×3072. The training pipeline resizes both with the same spatial
  transform to 512×512 (bilinear images, nearest-neighbor masks). Eight
  image/mask overlays were visually spot-checked across train and validation;
  no machine-readable registration metadata is available for exhaustive
  alignment proof.
- Two undocumented exact mask colors remain unmapped: `(0, 163, 255)` and
  `(120, 120, 70)`. They account for 2,230,948 train pixels (0.535%) and
  6,996,251 validation pixels (1.483%). The source palette workbook's LFS
  object was unavailable, so no class mapping was guessed.
- The segmentation decoder now accepts only exact documented palette colors;
  all others use ignore index 255. Losses and binary/multiclass metrics exclude
  those pixels. The exact per-class and unknown-color counts are in the JSON
  audit.
- The existing checkpoint scores mIoU 0.5429, macro-F1 0.6587, and pixel
  accuracy 0.8726 over all 450 validation images with unknown pixels ignored;
  see `results/segformer_baseline_validation.json`. Its original split
  provenance is unknown, so this is diagnostic rather than an independent
  baseline.
- The warm-started fine-tune ran for 16 epochs on MPS (2.05 hours of epoch
  time) and early-stopped after
  eight epochs without a validation improvement greater than 0.001. Best
  validation mIoU was 0.543997 at epoch 8; independently re-evaluated macro-F1
  was 0.662845 and pixel accuracy was 0.863260. Compared with the diagnostic
  old-checkpoint score, mIoU increased by 0.001067 and macro-F1 by 0.004175,
  while pixel accuracy decreased by 0.009329. The per-class tradeoffs are
  mixed; in particular, flooded-building and flooded-road IoU increased while
  water and grass IoU decreased. See
  `results/segformer_retrained_398.json` and
  `results/segformer_retrained_398_validation.json`.
- This is not a clean independent comparison: the historical checkpoint's
  training split provenance is unknown, and the official validation split
  selected the fine-tuned checkpoint. Do not claim improved generalization or
  test performance from this result.
- Test images and masks were not restored; no test metric is available.

FloodNet's official repository states CDLA Permissive 1.0. The missing images
were retrieved from the public [Hugging Face FloodNet mirror](https://huggingface.co/datasets/takara-ai/FloodNet_2021-Track_2_Dataset_HF),
whose dataset API advertises `cc-by-sa-4.0`; only the seven matching official
IDs were downloaded. The existing local mask/validation LFS objects were
linked rather than copied.

The `nvidia/mit-b3` model card points to the NVIDIA Source Code License, which
limits use of the model and its derivatives to non-commercial research or
evaluation. Do not use a fine-tuned checkpoint for commercial deployment
without replacing the base weights or obtaining appropriate licensing review.

## Research and candidate fit

| Candidate | Primary-source finding | Fit and limitation |
|---|---|---|
| Fine-tuned SAM | Shokati et al., “Rapid flood mapping from aerial imagery using fine-tuned SAM and ResNet-backboned U-Net,” *HESS* 30 (2026), [doi:10.5194/hess-30-743-2026](https://doi.org/10.5194/hess-30-743-2026). The abstract reports IoU 0.90 with point prompts, 0.67 with box prompts, and 0.74 for U-Net/ResNet-101. | Binary flood mapping and prompted SAM results on the paper's data are not comparable to FloodNet's ten-class task; point prompts also require an input mechanism not present in current automatic inference. |
| AIFloodSense | Simantiris et al., “AIFloodSense: A Global Aerial Imagery Dataset for Semantic Segmentation and Understanding of Flooded Environments,” *Remote Sensing* 18(6), 938 (2026), [doi:10.3390/rs18060938](https://doi.org/10.3390/rs18060938). The paper describes 470 aerial images, 230 flood events, 64 countries, and segmentation labels for flood, sky, buildings, and background. | Four labels and a compact global dataset make it a separate, useful binary/multiclass research task, not a drop-in replacement for FloodNet labels. The paper is CC BY 4.0 and the linked code repository declares MIT, but the dataset's reuse license and downloadable labeled data were not established from the inspected card/repository. |
| SWUFlood | Ranjbar et al., “SWUFlood: Segmentation of flood-affected regions in UAV imagery using an enhanced hybrid approach integrating shifted window transformers with U-net,” *Remote Sensing Applications: Society and Environment* 42 (2026), article 102018, [doi:10.1016/j.rsase.2026.102018](https://doi.org/10.1016/j.rsase.2026.102018). The authors' repository states that code will be added later. | The UAV flood-region task is relevant, but the implementation and a reusable license are not currently available in the inspected repository. It cannot yet be benchmarked or safely integrated. |
| India event data | The official [Sen1Floods11 repository](https://github.com/cloudtostreet/Sen1Floods11) metadata lists an India event dated 2016-08-12. The dataset uses georeferenced 512×512 Sentinel imagery at 10 m and water/not-water QC labels with a no-data value. | This is satellite flood-extent segmentation, not aerial 10-class FloodNet; keep it as a separate binary model/evaluation task. The repository advertises a roughly 14 GB full dataset and does not declare a license in its repository metadata; do not download or redistribute it until data terms are confirmed. |

Paper-reported scores above are cited as literature findings only. They are not
claims about FloodSense and are not directly comparable with this repository's
historical metrics.

## Implemented audit corrections

- The generic benchmark metric helpers now aggregate confusion counts across
  the dataset and do not award perfect scores to absent classes.
- `/api/models` no longer publishes hard-coded mIoU/F1/latency values as if
  verified. It describes the actual runtime fallback and marks metrics as
  unavailable.
- `/api/segment` now identifies when a SAM request actually used classical CV.
- `/api/segment` and `/api/models` fallback identity have regression tests;
  reports and UI use pixel-based quantities and explicitly label uncalibrated
  class-weighted scores as proxies.
- The local FloodNet sample titles describe visible content and do not invent
  city or incident metadata; see `frontend/src/lib/floodnet-samples.ts`.

## Validation and blockers

- `PYTHONPATH=. USE_TF=0 .venv/bin/python -m unittest discover -s tests -p 'test_*.py'` — passed (41 tests).
- `cd frontend && npm run build` — passed, including Next.js type checking.
- `git diff --check` — passed.
- Full candidate comparison, per-class metrics, and confusion matrices are in
  `results/segmentation_model_comparison.json`; the readable comparison is
  `SEGMENTATION_MODEL_COMPARISON.md`. Every candidate used the same ordered 450
  validation IDs and shared dataset-level confusion-matrix metric code.
- The full B3 warm-started run remains the only candidate trained across all
  398 official training pairs besides the class-balanced B3 experiment. The
  original warm-started run improved validation mIoU by only 0.001067, while
  pixel accuracy decreased by 0.009329.
- The class-balanced B3 run used all 398 official labeled training pairs for
  13 epochs on MPS (2.98 hours, best epoch 5). It achieved mIoU 0.551030 and
  macro-F1 0.684675, deltas of +0.008100 and +0.026006 from the original
  checkpoint. Pixel accuracy decreased by 0.010681. Background IoU increased
  from 0.0000 to 0.3303, while flooded-road IoU decreased from 0.3308 to
  0.2374; flooded-building IoU also decreased slightly. This is a mixed,
  validation-selected result, not an independent test score. Keep production
  unchanged.
- SegFormer-B4 was initialized from its own `nvidia/mit-b4` pretrained
  checkpoint, not from B3, and ran only four training batches. It scored
  mIoU 0.025833 after the bounded smoke run. DeepLabV3+ with ImageNet-pretrained
  ResNet-50 ran four batches at batch size 2 and scored mIoU 0.002618. Neither
  smoke result indicates candidate quality or convergence. The initial
  DeepLabV3+ batch-size-1 attempt failed at pooled BatchNorm; the bounded
  retry worked at batch size 2.
- Measured MPS inference latency on the 450-image validation set was 176.1 ms
  per image for the original B3, 175.5 ms for the retrained B3, 175.7 ms for
  the class-balanced B3, 210.5 ms for B4, and 80.5 ms for the smoke-trained
  DeepLabV3+. These measurements include
  forward pass, output resize, and device-to-host prediction, but exclude image
  decode and preprocessing. Models had 47.2M, 47.2M, 64.0M, and 26.7M
  parameters respectively. Process max RSS peaked at 1,373 MiB during the
  comparison; MPS allocator samples are included in the JSON.
- Mask2Former was not run: no compatible Mask2Former weights are cached, and
  probing its Transformers implementation attempted to load the local
  TensorFlow Metal plugin, which fails because `_pywrap_tensorflow_internal.so`
  is missing. Given the 16 GB machine and poor smoke-only candidate results,
  adding a large optional architecture before resolving that stack is not
  justified.
- Reusable training/evaluation supports SegFormer and optional DeepLabV3+,
  configurable seeds, learning rates, batches, epochs, accumulation, loss,
  class weighting, early stopping, deterministic-algorithm request, and
  checkpoint paths. Recipes are under `configs/segmentation/`; optional
  DeepLab dependency is isolated in `requirements-segmentation-experiments.txt`.
- Full per-epoch loss, shared validation metrics, learning rate, runtime,
  checkpoint path, and configuration are recorded by the updated trainer.
  The previous B3 run predates the per-epoch learning-rate field; its learning
  rate is available only from the saved configuration.
- Training loss options are cross-entropy, class-weighted cross-entropy, and
  Dice/focal; transforms synchronize geometry and use image-only photometric
  augmentation. The previous B3 run used Dice/focal with capped class weights.
- DeepLabV3+ uses a minimum training batch size of two because the pooled
  decoder branch's BatchNorm fails for batch size one. Gradient accumulation
  cannot fix that normalization constraint.
- The backend's existing `FLOODSENSE_SEGFORMER_CHECKPOINT` environment setting
  remains the opt-in checkpoint path. A regression test verifies it is passed
  into the loader. The original production default is unchanged; none of the
  experiment checkpoints is deployed.
- The new checkpoint is not wired into or deployed to the backend. The current
  container still has heavy CV disabled, and no Azure resources were changed.
- No test assets were downloaded, and no Azure resources were created.
- The current backend remains synchronous. A production job API requires a
  durable store/queue, worker lifecycle, ownership/authentication, storage
  retention, and an approved deployment design; none is deployed.
