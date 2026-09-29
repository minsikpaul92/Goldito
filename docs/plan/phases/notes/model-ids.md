# Nebius Token Factory — model IDs (task 0.3)

Checked with `GET /v1/models` on **2026-09-29**. API key stored in local `backend/.env` only (never commit).

## Catalog summary

| Region base URL | HTTP | Nemotron models in catalog |
| :--- | :--- | :--- |
| `https://api.tokenfactory.us-central1.nebius.com/v1/` | 200 | Ultra, Super, Nano-30B-A3B, Nemotron-3_5-Lightning |
| `https://api.tokenfactory.nebius.com/v1/` (eu-north1) | 200 | Same four Nemotron IDs |

**Not listed:** `nvidia/nemotron-3-nano-omni` (planned in `.env.example` for vision). Re-check catalog before Phase 08.

**Vision fallback candidate (multimodal in catalog):** `openbmb/MiniCPM-V-4_5` (us-central1 and eu-north1). Confirm image + JSON behavior in Phase 07.1 / 08 spike.

## PawNote role mapping

| Role (env) | Model ID | Base URL | Checked |
| :--- | :--- | :--- | :--- |
| `MODEL_VISION` | `openbmb/MiniCPM-V-4_5` (fallback until nano-omni) | `https://api.tokenfactory.us-central1.nebius.com/v1/` | 2026-09-29 |
| `MODEL_SAFETY` | `nvidia/Nemotron-3-Ultra-550b-a55b` | `https://api.tokenfactory.us-central1.nebius.com/v1/` | 2026-09-29 |
| `MODEL_REPORT` | `nvidia/nemotron-3-super-120b-a12b` | `https://api.tokenfactory.us-central1.nebius.com/v1/` | 2026-09-29 |
| `MODEL_FAST` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | `https://api.tokenfactory.nebius.com/v1/` | 2026-09-29 |

## Notes (fill as we test)

- English output quality: TBD (Phase 07.1 `scripts/test_nebius.py`)
- Vision: base64 data URL input: TBD
- `response_format` JSON: TBD

## Verify commands

```bash
cd backend
export $(grep -v '^#' .env | grep NEBIUS_API_KEY | xargs)
curl -s "https://api.tokenfactory.us-central1.nebius.com/v1/models" \
  -H "Authorization: Bearer $NEBIUS_API_KEY" | head -c 2000
```
