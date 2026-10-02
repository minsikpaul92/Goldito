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

## Model policy (D39) and NVIDIA catalog check (2026-10-02)

**Policy:** prefer US-made models, and NVIDIA models wherever a feature allows it. Chinese-origin models are allowed only when there is no US/NVIDIA alternative or the cost/quality gap is large — record the reason here. Current exceptions: `Qwen/Qwen3-Embedding-8B` (**final, decided 2026-10-02 — no NVIDIA embedding in the catalog, already verified at 1024 dims, no other embedding model will be evaluated**) and `openbmb/MiniCPM-V-4_5` (**final for the hackathon, decided 2026-10-02** — the NVIDIA vision models are Dedicated-Endpoint-only, see below).

**Console "Model catalog" (provider = NVIDIA) vs. our API key (`GET /v1/models`, both base URLs, 2026-10-02):**

| Console catalog entry | Origin | Modality (catalog) | Visible to our API key? |
| :--- | :--- | :--- | :--- |
| Nemotron-3-Nano-30B-A3B / NVIDIA-Nemotron-3-Nano-30B-A3B, Nemotron-3-Super-120b-a12b, Nemotron-3-Ultra-550b-a55b, Nemotron-3.5-Lightning | NVIDIA | text | **yes** (in use) |
| **Nemotron-Nano-V2-12b** | NVIDIA | **vision** | **no** — console model page (2026-10-02): **Dedicated endpoint only**, public endpoint not available, no fine-tuning |
| **Cosmos3-Super-Reasoner** (33B FP16) | NVIDIA (check the model card for its base model) | **vision** (video reasoning) | **no** — **Dedicated endpoint only**, public endpoint not available, no fine-tuning (the per-token price-list entry does not make it callable on the shared API) |
| **Nemotron-3-Nano-Omni** | NVIDIA | catalog says text-to-text (name says Omni) | **no** — **Dedicated endpoint only**, no fine-tuning |
| Llama-3_1-Nemotron-Ultra-253B-v1 | Llama-based, NVIDIA-tuned | text | not listed on our key |
| GLM-4.7-NVFP4, MiniMax-M2.5/M2.7-NVFP4, Qwen3.5-397B-A17B-NVFP4 | **Chinese originals**, only quantized by NVIDIA | text | not counted as NVIDIA models |

**Decision (2026-10-02): keep `openbmb/MiniCPM-V-4_5` for vision.** The three NVIDIA vision/omni models can only be deployed as Dedicated Endpoints. An always-on endpoint costs L40S $2/GPU-hour (about $48/day; enough for the 12B model) or H100 $4.7/GPU-hour (about $113/day; needed for the 33B FP16 Cosmos model) — more than the $125 balance over the weeks the demo must stay up. A short-lived endpoint just to record the demo video is possible later (not planned).

**Fine-tuning (11.7):** confirmed in the console — `google/gemma-4-E4B-it` appears in the fine-tuning wizard (LoRA or Full fine-tuning, $0.40 / 1M tokens, 8K context); **Nemotron models do not appear, and their model pages show Full / LoRA fine-tuning "Not available"** (the catalog's generic "Fine-tuning" badge is misleading). So the SFT candidate is **Gemma-4-E4B-it (LoRA)** — **showcase only, not wired into the app (D43)**. A tuned Gemma 4 most likely needs a Dedicated Endpoint (L40S $2/GPU-hour, H100 $4.7). Account balance on 2026-10-02: $125. RFT is not being pursued (no application).

**Fun mood meter (11.9 / D42):** `agentmish/dog-emotion-classifier-v2` — Apache-2.0, ViT-base, 85.6% accuracy on its small eval set, no training-dataset license stated. `Dewa/dog_emotion_v2` has no license tag, do not use.

## Open questions (Phase 07.1 / 08 spike)

- [x] NVIDIA vision models (Nemotron-Nano-V2-12b, Cosmos3-Super-Reasoner, Nemotron-3-Nano-Omni): Dedicated Endpoint only, not callable on the shared API → MiniCPM-V stays (2026-10-02)
- [x] Fine-tuning: wizard offers Gemma-4-E4B-it, no Nemotron (2026-10-02)
- [x] Gemma-4-E4B-it offers **LoRA fine-tuning** in the wizard's Training type step (2026-10-02) — use LoRA for the tone tuning (style only, cheaper, less forgetting)
- [x] LoRA serving for Gemma 4: the price list has only Gemma-4 *Fine-tuning* SKUs (no Input/Output or `-LoRa` serving SKUs), so a tuned Gemma 4 most likely needs a Dedicated Endpoint. Per the fine-tuning docs, serverless LoRA deploy is listed only for Llama-3.1-8B-Instruct and Llama-3.3-70B-Instruct; Qwen3-14B/32B are trainable but not on that list, so a Chinese model does not fix serving (2026-10-02)
- **Decision (D43):** SFT is a showcase only — the app runtime uses Nemotron + style card + few-shot; no serving of a tuned model (phase-11 11.7)
- [ ] Tone: compare Nemotron-3 Nano / Super / gpt-oss-120b / gemma-3-27b-it on the same few-shot tone prompt (07B.8), blind-rated by the sitter

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
