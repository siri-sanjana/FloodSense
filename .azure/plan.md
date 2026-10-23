# FloodSense Research and Deployment Upgrade Plan

> **Status:** Approved — local-first implementation; no Azure provisioning

Generated: 2026-10-22

---

## 1. Project Overview

**Goal:** Audit the actual FloodSense inference path, establish reproducible segmentation baselines, research suitable flood datasets/models, improve image-derived impact inspection, and prepare a bounded asynchronous inference design without disrupting the live Vercel + Azure Container Apps POC.

**Path:** Modernize Existing

**Scope:** Local implementation, tests, research notes, and deployment templates. No Azure resource creation, production deployment, GPU spend, or model/dataset downloads with material cost until separately confirmed.

---

## 2. Requirements

| Attribute | Value |
|-----------|-------|
| Classification | POC |
| Scale | Small (<1K users) |
| Budget | Cost-optimized; Azure for Students credits; avoid new recurring charges by default |
| Compliance | Research/demo; do not represent image-derived results as verified emergency assessments |
| Subscription | Azure for Students (`e9c86aba-e4b0-46e2-b8b0-8de6273b2444`), previously confirmed; reconfirm before deployment |
| Location | East Asia (`eastasia`), previously permitted by subscription policy; reconfirm before deployment |

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

**Selected:** Bicep for repeatable Azure resource definitions; existing Azure CLI and ACR flow retained for local image build/push.

**Rationale:**

- The current deployment uses existing Azure Container Apps and ACR resources and has no `azure.yaml` or IaC.
- A future durable worker requires explicit, reviewable queue/storage and identity configuration.
- No infrastructure will be provisioned as part of local implementation without a separate cost/deployment approval.

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
- New Storage/queue/monitoring resources can incur recurring charges. No provisioning or deployment without a separate user approval after a cost estimate.

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
- [x] Keep external Azure provisioning disabled until cost and subscription approval

### Phase 5 — Validation and deployment readiness
- [x] Run focused backend tests, frontend build, and inference smoke tests; reproducible benchmark is blocked by missing labels
- [x] Update README with measured results, model/dataset licenses, model retrieval, environment variables, and deployment procedure
- [x] Produce a final status table separating local implementation, local validation, cloud deployment, and production verification
- [ ] Invoke `azure-validate` before any deployment
- [ ] Invoke `azure-deploy` only after validation and separate user approval for cloud changes

---

## 7. Validation Proof

Local validation completed:

- `PYTHONPATH=. USE_TF=0 .venv/bin/python -m unittest discover -s tests -p 'test_*.py'` — passed (20 tests).
- `cd frontend && npm run build` — passed, including Next.js type checking.
- `git diff --check` — passed.
- `/api/segment` and `/api/models` fallback behavior is covered by focused tests; the inference response identifies classical CV rather than claiming SegFormer.
- A reproducible model benchmark was not run because the checkout lacks paired labels and a validation/test split. No model was trained or downloaded.
- Azure validation and deployment were intentionally not run; no Azure resources were provisioned.

---

## 8. Planned Files / Areas

| File or area | Purpose | Status |
|--------------|---------|--------|
| `.azure/plan.md` | Source-of-truth scope, decisions, and validation record | Updated; Azure validation pending by design |
| `README.md` | Baseline, dataset/model caveats, usage and deployment docs | Updated |
| `models_benchmark/` and `tests/` | Reproducible audit, benchmark and inference tests | Metric fixes and tests complete; full benchmark blocked by missing labels |
| `dashboard/` | Explicit model identity, API validation and job endpoints | Model fallback reporting corrected; durable jobs not implemented |
| `frontend/src/` | Dataset labels, impact explorer, status/progress and result UI | Unsupported location/impact claims removed; proxy and pixel limits surfaced |
| `infra/` | Reviewed Bicep only if required for durable-worker deployment | Pending; no provisioning |

---

## 9. Next Steps

> Current: Local audit and reporting corrections complete. Additional training and a fair benchmark are blocked on restoring authorized paired labels. Azure work remains explicitly out of scope.

1. Restore the matching FloodNet train/validation masks and split manifest before training or benchmarking.
2. Evaluate the existing checkpoint and alternatives on a fixed held-out split; report per-class metrics and latency.
3. Design and validate a durable asynchronous job system only if the product requires it.
4. Reconfirm Azure subscription, permitted region, and cost before any deployment workflow.
