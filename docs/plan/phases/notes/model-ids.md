# Nebius Token Factory — models for PawNote

**Last catalog check:** 2026-09-29 (`GET /v1/models`, API key in local `backend/.env` only).

**UI:** Token Factory → **Model endpoints** → Public endpoints (shared API, no dedicated deploy). Matches API list for NVIDIA Nemotron + OpenBMB vision below.

---

## Which model for which feature?

| PawNote feature | Phase | API route | Env role | Model ID (public endpoint) | Why this model |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Feed auto-caption** | 09 | `POST /api/ai/caption` | `MODEL_VISION` | `openbmb/MiniCPM-V-4_5` | **Vision:** reads the photo (dog, activity) and writes a short English caption. Sitter does not type. |
| **Treat safety — read label** | 08 | `POST /api/ai/safety-check` (step 1) | `MODEL_VISION` | `openbmb/MiniCPM-V-4_5` | **Vision/OCR:** ingredient label photo → structured ingredient list + product name. |
| **Treat safety — reason** | 08 | same (step 2) | `MODEL_SAFETY` | `nvidia/Nemotron-3-Ultra-550b-a55b` | **Text reasoning:** allergens, hidden sources (e.g. poultry in “animal fat”), DANGER/WARNING/SAFE JSON. |
| **Daily report draft** | 07 | `POST /api/ai/daily-report` | `MODEL_REPORT` | `nvidia/nemotron-3-super-120b-a12b` | **Long-form text:** warm end-of-day report from today’s logs + feed (+ optional sitter quick-tap). |
| **Dev smoke / cheap tests** | 07.1 | `scripts/test_nebius.py` | `MODEL_FAST` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Fast, low-cost Nemotron for “hello world” and JSON/format checks before wiring Super/Ultra. |
| **Optional: fast text** | — | (stretch) | — | `nvidia/Nemotron-3_5-Lightning` | Cheaper/faster text if we split caption **wording polish** from vision (P1 only if needed). |

**Not in catalog (do not rely on for demo):** `nvidia/nemotron-3-nano-omni` — was in early docs; **replace with MiniCPM-V-4_5** until/unless omni appears in your project’s model list.

**Tavily:** not a Nebius model — web search for unknown ingredients/recalls (Phase 11). See [tavily.ko.md](../../tavily.ko.md).

---

## What is `openbmb/MiniCPM-V-4_5`?

OpenBMB **MiniCPM-V-4.5** is a **multimodal (vision) model** on the same Token Factory public API:

- **Input:** image(s) (+ prompt), including OCR-style label/PDF-style text in photos.
- **PawNote use:** anything that must **see** Cloudinary media (base64 data URL from backend, architecture D12):
  1. **Caption** — “what is in this picture?”
  2. **Safety step 1** — “list ingredients from this packaging photo.”

Step 2 safety **judgment** is **Ultra** (text-only Nemotron), not MiniCPM — two-step pipeline in [phase-08.md](../phase-08.md).

**Hackathon note:** Still **NVIDIA Nemotron on Token Factory** for core AI story; MiniCPM is an **additional** NVIDIA-catalog-compatible vision endpoint on Nebius (OpenBMB). Mention both in README feedback and demo script.

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

## Open questions (Phase 07.1 / 08 spike)

- [ ] MiniCPM: English caption quality on **real pet** photos (not app icon)
- [ ] MiniCPM: ingredient list JSON reliability on label photos
- [ ] Ultra/Super: `response_format` / JSON schema adherence
- [x] Image input: base64 data URL (D12) accepted by MiniCPM on Token Factory — smoke 2026-09-29

---

## Verify

```bash
cd backend
export $(grep -v '^#' .env | grep NEBIUS_API_KEY | xargs)
curl -s "https://api.tokenfactory.us-central1.nebius.com/v1/models" \
  -H "Authorization: Bearer $NEBIUS_API_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print([m['id'] for m in d['data'] if 'nemotron' in m['id'].lower() or 'MiniCPM' in m['id']])"
```
