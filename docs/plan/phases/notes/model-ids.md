# Nebius Token Factory — models for PawNote

**Last catalog check:** 2026-10-01 (`GET /v1/models?verbose=true` on both base URLs, API key in local `backend/.env` only). First check 2026-09-29.

**UI:** Token Factory → **Model endpoints** → Public endpoints (shared API, no dedicated deploy). Matches API list for NVIDIA Nemotron + OpenBMB vision below.

---

## Which model for which feature?

| PawNote feature | Phase | API route | Env role | Model ID (public endpoint) | Why this model |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Inquiry auto-reply** (Stage 1) | 07B | `POST /api/ai/inquiry-reply` | `MODEL_FAST` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | **Speed:** answer in seconds from server-collected facts (schedule, quote, policy, RAG). Never computes prices. |
| **RAG embeddings** (Stage 1 · 5) | 07B · 07C | `services/rag.py` | `MODEL_EMBED` | `Qwen/Qwen3-Embedding-8B` | Only embedding model in the catalog. `dimensions: 1024` works on both base URLs (2026-10-01) → pgvector `vector(1024)` + HNSW. |
| **Care plan → checklist** (Stage 2) | 06 | `POST /api/ai/care-plan` | `MODEL_REPORT` | `nvidia/nemotron-3-super-120b-a12b` | Structured JSON for times, doses, cautions from the owner's free text. |
| **Handoff photo check** (Stage 4) | 06B | `POST /api/ai/handoff-check` | `MODEL_VISION` | `openbmb/MiniCPM-V-4_5` | **Vision:** pet visible, species match, crate / seatbelt in the car. Server decides ok / warning. |
| **Feed auto-caption + album category** | 09 | `POST /api/ai/caption` | `MODEL_VISION` | `openbmb/MiniCPM-V-4_5` | **Vision:** reads the photo (pet, activity) and writes a short English caption + `meal`/`walk`/`nap`/`play`/`other`. Sitter does not type. |
| **Treat safety — read label** | 08 | `POST /api/ai/safety-check` (step 1) | `MODEL_VISION` | `openbmb/MiniCPM-V-4_5` | **Vision/OCR:** ingredient label photo → structured ingredient list + product name. |
| **Treat safety — reason** | 08 | same (step 2) | `MODEL_SAFETY` | `nvidia/Nemotron-3-Ultra-550b-a55b` | **Text reasoning:** allergens, hidden sources (e.g. poultry in “animal fat”), DANGER/WARNING/SAFE JSON. |
| **Daily report draft** | 07 | `POST /api/ai/daily-report` | `MODEL_REPORT` | `nvidia/nemotron-3-super-120b-a12b` | **Long-form text:** warm end-of-day report from today’s logs + feed + the 5-second check (report photos described by `MODEL_VISION` first). |
| **Pet Life Record** (Stage 5) | 07C | `POST /api/ai/life-record` | `MODEL_REPORT` | `nvidia/nemotron-3-super-120b-a12b` | Long-context summary of a whole stay; only recorded facts, null when no evidence. |
| **Dev smoke / cheap tests** | 07.1 | `scripts/test_nebius.py` | `MODEL_FAST` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Fast, low-cost Nemotron for “hello world” and JSON/format checks before wiring Super/Ultra. |
| **Optional: fast text** | — | (stretch) | — | `nvidia/Nemotron-3_5-Lightning` | Cheaper/faster text if we split caption **wording polish** from vision (P1 only if needed). |

**Not in catalog (do not rely on for demo):** `nvidia/nemotron-3-nano-omni` — was in early docs; **replace with MiniCPM-V-4_5** until/unless omni appears in your project’s model list. **Qwen-2.5-VL** (named in the team's Full Process scenario) is not in the catalog either (2026-10-01).

**Image-input models in the catalog (2026-10-01, `architecture.modality = text+image->text`):** `openbmb/MiniCPM-V-4_5` (both base URLs) and `moonshotai/Kimi-K2.6` (both) — plus `moonshotai/Kimi-K3`, `zai-org/GLM-5.3-Flash`, `deepseek-ai/DeepSeek-V4.1-Flash` on the eu-north1 gateway only. Default stays MiniCPM-V-4.5 (smoke-tested); compare Kimi-K2.6 in the 6B.5 spike only if handoff checks are unreliable. No NVIDIA vision or embedding model is listed.

**Tavily:** not a Nebius model — web search for unknown ingredients/recalls (Phase 08.7 stretch, 11.3 fallback). See [tavily.ko.md](../../tavily.ko.md).

---

## What is `openbmb/MiniCPM-V-4_5`?

OpenBMB **MiniCPM-V-4.5** is a **multimodal (vision) model** on the same Token Factory public API:

- **Input:** image(s) (+ prompt), including OCR-style label/PDF-style text in photos.
- **PawNote use:** anything that must **see** Cloudinary media (base64 data URL from backend, architecture D12):
  1. **Caption** — “what is in this picture?”
  2. **Safety step 1** — “list ingredients from this packaging photo.”

Step 2 safety **judgment** is **Ultra** (text-only Nemotron), not MiniCPM — two-step pipeline in [phase-08.md](../phase-08.md).

**Hackathon note:** Still **NVIDIA Nemotron on Token Factory** for core AI story; MiniCPM (OpenBMB, **not an NVIDIA model**) is an **additional** vision endpoint on the same Token Factory API; the hackathon rule (at least one NVIDIA model) is met by Ultra and Super. Mention both in README feedback and demo script.

---

## Base URLs (confirmed 2026-09-29)

| Env suffix | Base URL | Typical roles |
| :--- | :--- | :--- |
| `*_BASE_URL` us-central1 | `https://api.tokenfactory.us-central1.nebius.com/v1/` | `MODEL_VISION`, `MODEL_SAFETY`, `MODEL_REPORT` |
| `MODEL_FAST_BASE_URL` | `https://api.tokenfactory.nebius.com/v1/` | `MODEL_FAST` (eu-north1 gateway; same Nemotron IDs listed) |

Use the **exact** `id` string from `GET /v1/models` when calling `chat/completions`.

---

## Catalog ↔ UI name cheat sheet

| Model endpoints UI | API `id` |
| :--- | :--- |
| Nemotron-3.5-Lightning | `nvidia/Nemotron-3_5-Lightning` |
| Nemotron-3-Ultra-550b-a55b | `nvidia/Nemotron-3-Ultra-550b-a55b` |
| Nemotron-3-Super-120b-a12b | `nvidia/nemotron-3-super-120b-a12b` |
| Nemotron-3-Nano-30B-A3B | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` |
| MiniCPM-V-4.5 (Vision) | `openbmb/MiniCPM-V-4_5` |

---

## Phase 0.3 inference smoke (2026-09-29)

| Test | Model | Base URL | Result |
| :--- | :--- | :--- | :--- |
| Text chat | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | `https://api.tokenfactory.nebius.com/v1/` | **200** — assistant `content`: `OK` (use `max_tokens` ≥ 64; model may fill `reasoning` first) |
| Vision + image | `openbmb/MiniCPM-V-4_5` | `https://api.tokenfactory.us-central1.nebius.com/v1/` | **200** — `data:image/png;base64,...` in `image_url` works (architecture D12). External image URLs may fail if Nebius cannot fetch them. |

Phase 00 DoD for Nebius: **met** (catalog + role mapping + one Fast + one Vision call).

## Embeddings check (2026-10-01)

| Base URL | Model | `dimensions` | Result |
| :--- | :--- | :--- | :--- |
| us-central1 | `Qwen/Qwen3-Embedding-8B` | default | **200** — 4096 dims |
| us-central1 | `Qwen/Qwen3-Embedding-8B` | 1024 | **200** — 1024 dims |
| eu-north1 gateway | `Qwen/Qwen3-Embedding-8B` | default / 1024 | **200** — 4096 / 1024 dims |

Input: one fictional sentence ("Bori is a Maltese who is allergic to chicken."). Use 1024 — pgvector HNSW indexes support up to 2000 dims.

## Open questions (Phase 07.1 / 08 spike)

- [ ] MiniCPM: English caption quality on **real pet** photos (not app icon)
- [ ] MiniCPM: ingredient list JSON reliability on label photos
- [ ] Ultra/Super: `response_format` / JSON schema adherence
- [x] Image input: base64 data URL (D12) accepted by MiniCPM on Token Factory — smoke 2026-09-29
- [ ] MiniCPM: crate / seatbelt detection on car photos (6B.5) — compare Kimi-K2.6 if < 3/4 samples pass
- [ ] Nano: inquiry reply p50 latency with ~2k-token grounding JSON (07B.7 target < 10 s)
- [ ] Nemotron tool calling on Token Factory (record only — P0 does one grounded call, full-process §8)

---

## Verify

```bash
cd backend
export $(grep -v '^#' .env | grep NEBIUS_API_KEY | xargs)
curl -s "https://api.tokenfactory.us-central1.nebius.com/v1/models" \
  -H "Authorization: Bearer $NEBIUS_API_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print([m['id'] for m in d['data'] if 'nemotron' in m['id'].lower() or 'MiniCPM' in m['id']])"
```
