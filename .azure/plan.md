# FloodSense Research and Deployment Upgrade Plan

> **Status:** Deployed and verified — the backend image built from b835938 is running on the existing Azure Container App

Generated: 2026-10-22; existing-service rollout revalidated 2026-10-27

---

## 1. Project Overview

**Goal:** Audit the actual FloodSense inference path, establish reproducible segmentation baselines, research suitable flood datasets/models, improve image-derived impact inspection, and roll out the selected fine-tuned SegFormer checkpoint loader to the existing Azure Container App.

**Path:** Modernize Existing

**Scope:** Build and deploy the updated backend image to the existing `floodsense-backend` Container App in `floodsense-rg` (East Asia), using the existing `floodsenseacr` registry. No new Azure resources, CPU/memory changes, GPU spend, or changes to depth/SAM behavior. The private checkpoint is already uploaded to `Sanjanasiri/floodsense-segformer-b3-class-balanced`; credentials remain in Azure secrets and are not handled in chat.

---

## 2. Requirements

| Attribute | Value |
|-----------|-------|
| Classification | POC |
| Scale | Small (<1K users) |
| Budget | Cost-optimized; Azure for Students credits; avoid new recurring charges by default |
| Compliance | Research/demo; do not represent image-derived results as verified emergency assessments |
| Subscription | Azure for Students (`e9c86aba-e4b0-46e2-b8b0-8de6273b2444`), confirmed for this rollout |
| Location | East Asia (`eastasia`), confirmed as the existing Container App location |

---

## 3. Components Detected

| Component | Type | Technology | Path |
|-----------|------|------------|------|
| FloodSense UI | Frontend | Next.js, React, TypeScript | `frontend/` |
| FloodSense REST API | API | Flask, Python 3.11, Gunicorn | `dashboard/server.py` |
| Segmentation training/evaluation | ML pipeline | PyTorch, Transformers, FloodNet label pipeline | `models_benchmark/` |
| Image, chat, and report persistence | Data | Supabase Auth, Postgres, Storage | `frontend/src/lib/api/`, Supabase project |
| Existing API container | Runtime | Azure Container Apps, CPU configuration | Root `Dockerfile` |
| Container image registry | Image registry | Azure Container Registry | Existing `floodsenseacr` |
| Knowledge retrieval/reporting | RAG/report services | ChromaDB or TF-IDF, report-generation modules | `rag_pipeline/`, `report_generation/` |

### Initial repository evidence

- Dockerfile sets `DISABLE_HEAVY_CV=1` and `USE_TFIDF_RAG=1`; deployed segmentation therefore must not be assumed to use the fine-tuned checkpoint.
- Training scripts and local checkpoint directories exist. Their contents, split integrity, class schema, metrics provenance, and checkpoint compatibility must be verified during the baseline audit.
- FloodNet is a 10-class aerial scene dataset. Its sample IDs do not establish geographic location.
- No Azure IaC, queue, or worker deployment configuration was found in the initial scan.
- The worktree already contains uncommitted sample-caption and frontend changes. Preserve and integrate them; do not revert them.

---

## 4. Recipe Selection

**Selected:** Existing Azure CLI and ACR image build/push flow for this release; no infrastructure changes or resource provisioning.

**Rationale:**

- The current deployment uses existing Azure Container Apps and ACR resources and has no `azure.yaml` or IaC.
- A future durable worker requires explicit, reviewable queue/storage and identity configuration.
- This release reuses the existing Container App and ACR; it does not create infrastructure or change the app's resource allocation.

---

## 5. Architecture

**Stack:** Containers for API and worker; Next.js remains on Vercel; Supabase remains the existing authentication/chat/persistence system.

### Proposed component mapping

| Component | Azure/service choice | Status / rationale |
|-----------|----------------------|---------------------|
| Flask API | Existing Azure Container App | Keep REST compatibility; identify active model explicitly |
| Inference worker | Separate Azure Container App | Bounded CPU concurrency; independently scalable |
| Durable queue | Azure Storage Queue | Proposed low-complexity durable work queue; provision only after approval |
| Job and artifact metadata | Existing Supabase/Postgres; Supabase Storage or approved object store for image artifacts | Verify schema, ownership, RLS, retention, and access before design is finalized |
| Container images | Existing Azure Container Registry | Continue current registry; avoid admin credential dependence for steady state |
| Frontend | Existing Vercel deployment | Keep `NEXT_PUBLIC_BACKEND_URL` configuration; no secrets in client variables |
| Logging | Existing Container Apps / Log Analytics setup if available | Inspect actual resources before adding paid monitoring |

### Model and data safeguards

- Benchmark only against verified paired image/mask data and a fixed independent split; do not claim improvements without measured results.
- Evaluate the current checkpoint and SegFormer first. Add U-Net or SAM baselines only when weights, dataset compatibility, and hardware are verified.
- Keep binary satellite flood extent data (for example, Sen1Floods11) separate from FloodNet's 10-class aerial task unless a valid label mapping and evaluation protocol are defined.
- Report image pixel counts/percentages only unless georeferencing/calibration supports physical units.
- Relative depth is not water depth. Simulator values and generated image captions must be marked illustrative unless backed by metadata.
- Model failure or absent checkpoint must be explicit; no unrelated segmentation fallback may be presented as the fine-tuned model.

### Azure security and cost

- Prefer managed identity and least-privilege queue/blob roles if Azure provisioning is later approved.
- Do not put registry passwords, Supabase service-role credentials, or other secrets in source, browser-visible variables, or generated deployment output.
- The existing app remains at its current CPU/memory allocation. The 189 MB private checkpoint is downloaded from Hugging Face at runtime and cached in the container's writable storage; no new Azure resources are provisioned.

---

## 6. Execution Checklist

### Phase 1 — Baseline audit and report
- [x] Trace upload through inference, postprocessing, metrics, RAG/report, Supabase persistence, and UI rendering
- [x] Verify actual model architecture, class IDs, preprocessing, input/output shapes, checkpoint format, and Docker runtime flags
- [x] Verify available labeled data, split definitions, checkpoint files, hardware, and existing test coverage
- [x] Record actual baseline results and known limitations without inventing metrics

### Phase 2 — Research and benchmark
- [x] Verify the requested SAM, AIFloodSense, and SWUFlood publications and primary sources, implementations, datasets, and licenses
- [x] Research compatible Indian flood data; distinguish aerial 10-class imagery from satellite binary flood labels
- [ ] Evaluate existing checkpoint and practical candidates on the same held-out split where data permits
- [ ] Report per-class and flood metrics, boundary behavior, latency, memory, and limitations; do not train or download large assets without confirmed resources

### Phase 3 — Flood Impact Explorer
- [x] Make the frontend dataset descriptions and sample titles evidence-based and location-neutral unless metadata verifies place
- [x] Show only classes actually supported by the active model
- [x] Add pixel-based flood extent and connected-region metrics with explicit uncertainty/limitations
- [ ] Add mask correction/export only with edited output separated from original predictions and no automatic training ingestion
- [x] Keep report output explicit about observation, prediction, retrieved context, model version, and decision-support limits

### Phase 4 — Production inference design
- [ ] Add validated asynchronous job API and durable queue/store integration without an in-memory production queue
- [ ] Add worker processing, bounded concurrency, status/error/retry semantics, and stale-job recovery
- [ ] Enforce image/request limits, safe artifact handling, authentication/ownership, structured logs, and observable health
- [ ] Add tests for job lifecycle, persistence, authorization, metrics, and frontend progress/error handling
- [x] Restrict this approved rollout to the existing Container App and registry; no new Azure resources or scaling changes

### Phase 5 — Validation and deployment readiness
- [x] Run focused backend tests, frontend build, and inference smoke tests; reproducible benchmark is blocked by missing labels
- [x] Update README with measured results, model/dataset licenses, model retrieval, environment variables, and deployment procedure
- [x] Produce a final status table separating local implementation, local validation, cloud deployment, and production verification
- [x] Validate the selected Azure subscription, existing app/registry, runtime settings, and model-secret reference
- [x] Invoke `azure-validate` before the image rollout
- [x] Deploy the updated image to the existing Container App and verify health, model identity, and segmentation inference

---

## 7. Validation Proof

Current main rollout validation — 2026-10-27:

- `az containerapp update --name floodsense-backend --resource-group floodsense-rg --image floodsenseacr.azurecr.io/floodsense-backend:b835938-20261027` — succeeded; the app reports `provisioningState=Succeeded` and `runningStatus=Running`.
- `az containerapp revision list` — confirmed active revision `floodsense-backend--latest` is provisioned with image `floodsenseacr.azurecr.io/floodsense-backend:b835938-20261027`; the Container App remains in Single revision mode and retains its existing 1 vCPU / 2 GiB allocation and 0–1 replica scale.
- Live `GET /api/status` — returned `status=online`, version `2.0`.
- Live `GET /api/models` — returned the configured Class-balanced SegFormer-B3 as recommended, plus the existing classical and SAM fallback choices.
- Live SegFormer smoke test on sample `10169` — returned `status=success`, `model_used=segformer`, and `fallback_applied=false`.
- Vercel frontend `https://flood-sense-amber.vercel.app/` returned HTTP 200. No GitHub Production deployment record was available to independently tie the served site to commit `b835938`; the GitHub Pages workflow failed because Pages is not enabled, which is separate from the Vercel site.
- ACR tag `b835938-20261027` was confirmed at digest `sha256:994bff1fac1dce513c69921936ac67aaa029a4f81018095f425822265b2a7274`.
- `git diff --check` — passed; deployed image source commit is `b835938f83effc41571fcb8f9700009ad459b9e4`, including the pushed image-specific analysis changes.
- `PYTHONPATH=. USE_TF=0 .venv/bin/python -m unittest discover -s tests -p 'test_*.py'` — passed (55 tests).
- `npm --prefix frontend run build` — passed, including type checking and static page generation.
- `docker build --platform linux/amd64 -t floodsenseacr.azurecr.io/floodsense-backend:b835938-20261027 .` — passed; image ID `sha256:994bff1fac1dce513c69921936ac67aaa029a4f81018095f425822265b2a7274`. The build context was 2.76 MB and excludes frontend environment files and thesis/media artifacts.
- A local container started from that image returned `status=online` from `/api/status` and a valid `/api/models` response; the smoke-test container was stopped.
- `az account show` — confirmed Azure for Students (`e9c86aba-e4b0-46e2-b8b0-8de6273b2444`). The existing `floodsense-backend` app is healthy in `floodsense-rg` (East Asia), at 1 vCPU / 2 GiB and 0–1 replicas. The existing `floodsenseacr` registry is in resource group `floodsense` (East Asia); `az acr login` succeeded.
- The `sys.regionrestriction` subscription policy was reviewed. This rollout updates only the existing app image and creates no Azure resources or location/scale changes.
- Azure ACR Tasks are unavailable for this subscription (`TasksOperationsNotAllowed`); the verified local Docker build and ACR login provide the approved direct-push path instead.

Local validation completed:

- Grass-to-Water release validation: 2026-10-25 01:42 IST.
- `PYTHONPATH=. USE_TF=0 .venv/bin/python -m unittest discover -s tests -p 'test_model_reporting.py'` — passed (13 tests), including `/api/segment` overlay, class-mask, flood-mask, metric, and `/api/analyze` reporting checks after reclassification.
- `PYTHONPATH=. USE_TF=0 .venv/bin/python -m py_compile dashboard/server.py tests/test_model_reporting.py` — passed.
- `npm --prefix /tmp/floodsense-grass-water-release/frontend run build` — passed for the isolated frontend release based on current `main`.
- `docker build --platform linux/amd64 -t floodsenseacr.azurecr.io/floodsense-backend:grass-as-water-20261025-0137 .` — passed; image digest `sha256:4e5a4b0fb0179e38e61e55b619bf5443b9ee152b481ced012e02ea17a4c6b94f`.
- `az acr repository show-tags --name floodsenseacr --repository floodsense-backend --detail --query "[?name=='grass-as-water-20261025-0137']"` — confirmed the image tag and digest in the existing registry.
- Azure for Students subscription confirmed; existing app `floodsense-backend` and registry `floodsenseacr` are in East Asia. App allocation is 1 vCPU / 2 GiB and current API status is online.
- Subscription region-restriction policy reviewed; the rollout reuses the existing app and registry and provisions no resources.
- `git diff --check` — passed.
- Deployed image `floodsenseacr.azurecr.io/floodsense-backend:grass-as-water-20261025-0137` to the existing Container App. The active revision is healthy with 100% traffic; CPU/memory remain at 1 vCPU / 2 GiB.
- Live `/api/segment` smoke test using a synthetic green image returned `model_used=segformer`, `grass_pixels=0`, and `water_pixels=262144`; the response explicitly describes the class reclassification and its vegetation-related overestimation risk.
- Post-deployment `/api/status` returned `status=online`; `/api/models` still recommends Class-balanced SegFormer-B3.
- Frontend PR #5 merged as `4dfeb44f3986febe40907840fa3dca03a67ed8de`; Vercel production deployment succeeded. Live 3D and chat bundles both show the Grass-to-Water class alias in blue (`#0284C7`).

- Water blue-only release validation: 2026-10-25 01:10 IST.
- `PYTHONPATH=. USE_TF=0 .venv/bin/python -m unittest discover -s tests -p 'test_model_reporting.py'` — passed (12 tests), including checks that Water's overlay is blue, Grass retains its own color, and class IDs are unchanged.
- `npm --prefix /tmp/floodsense-water-blue-release/frontend run build` — passed for the isolated frontend release based on current `main`.
- `docker build --platform linux/amd64 -t floodsenseacr.azurecr.io/floodsense-backend:water-blue-only-20261025-0110 .` — passed; the image only changes the Water display palette in the existing API code.
- `az account show` — confirmed Azure for Students (`e9c86aba-e4b0-46e2-b8b0-8de6273b2444`).
- `az containerapp show --name floodsense-backend --resource-group floodsense-rg ...` — confirmed the existing East Asia app is provisioned, online, and unchanged at 1 vCPU / 2 GiB.
- `GET https://floodsense-backend.redplant-8f5bef3d.eastasia.azurecontainerapps.io/api/status` — returned `status=online`.
- `az policy assignment list --scope /subscriptions/e9c86aba-e4b0-46e2-b8b0-8de6273b2444` — reviewed the assigned `sys.regionrestriction` policy; the image update uses the existing resource in its current region and provisions no resources.
- `git diff --check` — passed.
- This blue-only validation supersedes the light-mint display color release recorded below.
- Deployed `floodsenseacr.azurecr.io/floodsense-backend:water-blue-only-20261025-0110` to the existing Azure Container App. The active revision is healthy with 100% traffic; the app remains at 1 vCPU / 2 GiB.
- Post-deployment `/api/status` returned `status=online`; `/api/models` continues to recommend Class-balanced SegFormer-B3.
- Frontend PR #4 merged as `1e46a4a9315684a1f63c32c57d306fe261bf24cc`; Vercel production deployment succeeded. Live 3D and chat bundles both report Water as `#0284C7`.

- Water light-mint release validation: 2026-10-25 00:58 IST.
- `PYTHONPATH=. USE_TF=0 .venv/bin/python -m unittest discover -s tests -p 'test_model_reporting.py'` — passed (12 tests), including assertions that Water uses the new display color and class IDs remain unchanged.
- `npm --prefix /tmp/floodsense-water-release/frontend run build` — passed for the isolated frontend release based on current `main`.
- `docker build --platform linux/amd64 -t floodsenseacr.azurecr.io/floodsense-backend:water-light-mint-20261025-0048 .` — passed; the pushed image digest is `sha256:d3f4992984418f0eee97a18f09384126fc1809eabf80b2f61725659f44c1e45f`.
- `az acr repository show-tags --name floodsenseacr --repository floodsense-backend --detail --query "[?name=='water-light-mint-20261025-0048']"` — confirmed the image tag and digest in the existing registry.
- Azure preflight confirmed the existing Container App is in East Asia, healthy on its current revision with 100% traffic, and the existing API status endpoint is online. The subscription's region-restriction policy was reviewed; this release changes only the existing app image and provisions no resources.
- Deployed the backend image to the existing Container App on 2026-10-25 at 01:03 IST. The app reports provisioning success, the active revision is healthy with 100% traffic, and the existing 1 vCPU / 2 GiB allocation is unchanged.
- Post-deployment `GET /api/status` returned `status=online`; `GET /api/models` continued to recommend Class-balanced SegFormer-B3.
- Historical color release: frontend PR #3 merged as `da22a34fe1f3430050d6db04a92b97d8ae2584ce` and briefly deployed light-mint Water; that display was superseded by the blue-only release above.
- Validation and deployment completed: 2026-10-24, approximately 23:54 IST.
- `PYTHONPATH=. USE_TF=0 .venv/bin/python -m unittest discover -s tests -p 'test_model_reporting.py'` — passed (11 tests).
- `PYTHONPATH=. USE_TF=0 .venv/bin/python -m py_compile dashboard/server.py tests/test_model_reporting.py` — passed.
- `git diff --check` — passed.
- `/api/segment` and `/api/models` fallback behavior is covered by focused tests; the inference response identifies classical CV rather than claiming SegFormer.
- A reproducible model benchmark was not run because the checkout lacks paired labels and a validation/test split. No model was trained; the existing checkpoint was downloaded from the configured private Hub repo at runtime.
- Azure preflight: active subscription is Azure for Students (`e9c86aba-e4b0-46e2-b8b0-8de6273b2444`); target app is `floodsense-backend` in `floodsense-rg` (East Asia), registry is `floodsenseacr` (East Asia), and app allocation is unchanged at 1 vCPU / 2 GiB.
- Azure preflight: model environment settings point to `Sanjanasiri/floodsense-segformer-b3-class-balanced`; `HF_TOKEN` references the existing `hf-token` secret (secret value not read).
- `az account set --subscription e9c86aba-e4b0-46e2-b8b0-8de6273b2444` and `az account show` — passed; subscription matches user confirmation.
- The pre-rollout `GET /api/models` identified that the old image lacked the fine-tuned checkpoint.
- Subscription policy listing returned `sys.regionrestriction`; this rollout retains the existing East Asia app and creates no resources or location changes.
- `az acr build` was denied with `TasksOperationsNotAllowed`; built and pushed the image locally instead: `floodsenseacr.azurecr.io/floodsense-backend:segformer-b3-20261024-235404` (`sha256:62e5c342d6f4597e4f1f73a2cd1c38387c42ad260739a567558638c6b150866b`).
- Updated only the existing `floodsense-backend` app to the new image. Azure reports provisioning succeeded; the active revision is healthy and serves 100% traffic. App allocation remains 1 vCPU / 2 GiB.
- `GET /api/status` — online after deployment. `GET /api/models` — recommends `Class-balanced SegFormer-B3`; metrics are null because no independently reproduced held-out benchmark is published.
- Posted a demo image to `POST /api/segment` with `model=segformer`; response succeeded with `model_used=segformer`, `model_display_name=Class-balanced SegFormer-B3`, `fallback_applied=false`, and 3,473.4 ms inference.
- No Azure resources were provisioned or resized.

---

## 8. Planned Files / Areas

| File or area | Purpose | Status |
|--------------|---------|--------|
| `.azure/plan.md` | Source-of-truth scope, decisions, and validation record | Updated; existing-app rollout deployed and verified |
| `README.md` | Baseline, dataset/model caveats, usage and deployment docs | Updated |
| `models_benchmark/` and `tests/` | Reproducible audit, benchmark and inference tests | Metric fixes and tests complete; full benchmark blocked by missing labels |
| `dashboard/` | Explicit model identity, API validation and job endpoints | Model fallback reporting corrected; durable jobs not implemented |
| `frontend/src/` | Dataset labels, impact explorer, status/progress and result UI | Unsupported location/impact claims removed; proxy and pixel limits surfaced |
| `infra/` | Reviewed Bicep only if required for durable-worker deployment | Pending; no provisioning |

---

## 9. Next Steps

> Current: Class-balanced SegFormer-B3 is deployed and confirmed active for segmentation only on the existing Azure Container App. All predicted Grass pixels are merged into Water; this intentionally may overstate flood coverage over vegetation. No independently reproduced held-out benchmark is available.

1. Restore the matching FloodNet train/validation masks and split manifest before training or benchmarking.
2. Evaluate the existing checkpoint and alternatives on a fixed held-out split; report per-class metrics and latency.
3. Design and validate a durable asynchronous job system only if the product requires it.
4. Restore the matching FloodNet validation data before reporting new model performance metrics.
