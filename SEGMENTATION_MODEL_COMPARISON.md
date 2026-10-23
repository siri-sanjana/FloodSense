# FloodSense Segmentation Experiments

## Protocol and limitations

- Split: official FloodNet validation (450 images).
- Every candidate was evaluated on the same ordered image IDs with the same
  512×512 preprocessing, exact documented palette, ignore index 255, and
  dataset-level confusion-matrix metrics.
- The official validation split is used for model selection. **These are not
  independent test results.**
- Unknown annotation colors remain ignored; their authoritative class mapping
  is unavailable. Event/group metadata is unavailable, so event-independent
  split status cannot be verified.
- Latency measures model forward + output resize + device-to-host prediction,
  excluding image decode and preprocessing. Warm-up images are excluded.
- Process max RSS is a process high-water mark, not model-exclusive memory.
  MPS allocator readings are in the JSON and are not guaranteed peak values.

## Model comparison

All metric deltas are absolute differences from `segformer_b3_original`.

| Candidate | Architecture | Pretrained initialization | Epochs | Best epoch | Training time | mIoU (Δ) | Macro-F1 (Δ) | Pixel accuracy (Δ) | Inference latency | Parameters | Memory |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| segformer_b3_original | mit-b3 | nvidia/mit-b3 encoder; historical FloodNet fine-tune, training split provenance unknown | 15 | 7 | 1.04 h | 0.5429 (+0.0000) | 0.6587 (+0.0000) | 0.8726 (+0.0000) | 176.1 ms | 47,230,154 | 1449 MiB process max RSS |
| segformer_b3_retrained_398 | mit-b3 | nvidia/mit-b3 encoder and historical FloodNet checkpoint | 16 | 8 | 2.05 h | 0.5440 (+0.0011) | 0.6628 (+0.0042) | 0.8633 (-0.0093) | 175.5 ms | 47,230,154 | 1588 MiB process max RSS |
| segformer_b4_smoke | mit-b4 | nvidia/mit-b4 encoder-only checkpoint; FloodNet head initialized for 10 classes | 1 | 1 | 0.12 h | 0.0258 (-0.5171) | 0.0485 (-0.6102) | 0.0721 (-0.8004) | 210.5 ms | 64,000,714 | 1731 MiB process max RSS |
| deeplabv3plus_resnet50_smoke | DeepLabV3Plus/resnet50 | segmentation-models-pytorch ResNet-50 encoder initialized from ImageNet | 1 | 1 | 0.04 h | 0.0026 (-0.5403) | 0.0051 (-0.6536) | 0.0262 (-0.8464) | 80.5 ms | 26,679,898 | 1731 MiB process max RSS |
| segformer_b3_class_balanced | mit-b3 | nvidia/mit-b3 and historical FloodNet checkpoint; class-aware image sampling | 13 | 5 | 2.98 h | 0.5510 (+0.0081) | 0.6847 (+0.0260) | 0.8619 (-0.0107) | 175.7 ms | 47,230,154 | 1731 MiB process max RSS |

## Per-class metrics

| Class | Baseline IoU | Baseline F1 | segformer_b3_retrained_398 IoU | Δ IoU | segformer_b3_retrained_398 F1 | Δ F1 | segformer_b4_smoke IoU | Δ IoU | segformer_b4_smoke F1 | Δ F1 | deeplabv3plus_resnet50_smoke IoU | Δ IoU | deeplabv3plus_resnet50_smoke F1 | Δ F1 | segformer_b3_class_balanced IoU | Δ IoU | segformer_b3_class_balanced F1 | Δ F1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Background | 0.0000 | 0.0000 | 0.0049 | +0.0049 | 0.0099 | +0.0098 | 0.0062 | +0.0062 | 0.0124 | +0.0124 | 0.0000 | -0.0000 | 0.0000 | -0.0000 | 0.3303 | +0.3303 | 0.4966 | +0.4966 |
| Building-Flooded | 0.3319 | 0.4984 | 0.3507 | +0.0188 | 0.5193 | +0.0209 | 0.0028 | -0.3291 | 0.0056 | -0.4928 | 0.0000 | -0.3319 | 0.0000 | -0.4984 | 0.3212 | -0.0107 | 0.4862 | -0.0122 |
| Building-Non-Flooded | 0.7686 | 0.8691 | 0.7671 | -0.0015 | 0.8682 | -0.0010 | 0.0154 | -0.7532 | 0.0303 | -0.8389 | 0.0000 | -0.7686 | 0.0000 | -0.8691 | 0.7250 | -0.0436 | 0.8406 | -0.0286 |
| Road-Flooded | 0.3308 | 0.4971 | 0.3697 | +0.0389 | 0.5398 | +0.0427 | 0.0022 | -0.3285 | 0.0044 | -0.4927 | 0.0262 | -0.3046 | 0.0510 | -0.4461 | 0.2374 | -0.0934 | 0.3837 | -0.1134 |
| Road-Non-Flooded | 0.7879 | 0.8814 | 0.7858 | -0.0021 | 0.8800 | -0.0013 | 0.0625 | -0.7254 | 0.1176 | -0.7638 | 0.0000 | -0.7879 | 0.0000 | -0.8814 | 0.7817 | -0.0062 | 0.8775 | -0.0039 |
| Water | 0.7133 | 0.8326 | 0.6681 | -0.0452 | 0.8010 | -0.0316 | 0.0395 | -0.6738 | 0.0760 | -0.7566 | 0.0000 | -0.7133 | 0.0000 | -0.8326 | 0.6882 | -0.0251 | 0.8153 | -0.0173 |
| Tree | 0.7405 | 0.8509 | 0.7472 | +0.0067 | 0.8553 | +0.0044 | 0.1073 | -0.6332 | 0.1938 | -0.6571 | 0.0000 | -0.7405 | 0.0000 | -0.8509 | 0.7384 | -0.0021 | 0.8495 | -0.0014 |
| Vehicle | 0.3830 | 0.5539 | 0.3890 | +0.0060 | 0.5601 | +0.0063 | 0.0054 | -0.3775 | 0.0108 | -0.5430 | 0.0000 | -0.3830 | 0.0000 | -0.5539 | 0.3724 | -0.0106 | 0.5427 | -0.0111 |
| Pool | 0.5137 | 0.6787 | 0.5167 | +0.0030 | 0.6813 | +0.0026 | 0.0053 | -0.5083 | 0.0106 | -0.6681 | 0.0000 | -0.5137 | 0.0000 | -0.6787 | 0.4664 | -0.0473 | 0.6361 | -0.0426 |
| Grass | 0.8597 | 0.9246 | 0.8409 | -0.0188 | 0.9136 | -0.0110 | 0.0116 | -0.8481 | 0.0230 | -0.9016 | 0.0000 | -0.8597 | 0.0000 | -0.9246 | 0.8492 | -0.0105 | 0.9185 | -0.0061 |

The complete dataset-level confusion matrices, training configurations,
evaluation image IDs, memory samples, and per-class precision/recall are stored
in `results/segmentation_model_comparison.json`.

## Recommendation

The class-balanced B3 run improved validation mIoU by +0.0081 and macro-F1 by +0.0260, but pixel accuracy changed by -0.0107 and Road-Flooded IoU changed by -0.0934. These validation-selected results have meaningful class tradeoffs; keep the current production configuration until gains are repeatable and confirmed on independent test data.

The B4 result is a bounded smoke test only and must not be treated as a trained
quality candidate. The DeepLabV3+ result is also a four-batch smoke test. The
B3 class-balanced run is fully trained, but its class-level validation changes
are mixed; it is not an independent test result. Preserve the existing
production checkpoint until a repeatable comparison and independent test
evaluation are available. The B3/B4 weights are subject to the NVIDIA Source
Code License (non-commercial research or evaluation).

## Reproduction

The experiments here use only four labeled training batches for B4 and
DeepLabV3+ smoke checks; they do not establish quality or convergence.

1. Reproduce the SegFormer-B4 smoke run:

   ```sh
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/06_segformer_finetune.py --config configs/segmentation/segformer_b4_smoke.json
   ```

2. Reproduce the DeepLabV3+ smoke run (install the optional dependency first):

   ```sh
   .venv/bin/pip install -r requirements-segmentation-experiments.txt
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/06_segformer_finetune.py --config configs/segmentation/deeplabv3plus_smoke.json
   ```

3. Run full training with the B3 recipe after ensuring enough memory and disk:

   ```sh
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/06_segformer_finetune.py --config configs/segmentation/segformer_b3_retrain.json
   ```

4. Run the class-balanced B3 experiment using only the 398 verified labeled
   training pairs:

   ```sh
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/06_segformer_finetune.py --config configs/segmentation/segformer_b3_class_balanced.json
   ```

5. Evaluate the configured candidates on the same full validation split:

   ```sh
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/evaluate_segmentation_experiments.py --config configs/segmentation/compare_candidates.json
   ```

6. Render this report:

   ```sh
   PYTHONPATH=. USE_TF=0 .venv/bin/python models_benchmark/report_segmentation_comparison.py
   ```
