# Nebius Token Factory — models for Goldito

**Last catalog check:** 2026-10-01 (`GET /v1/models?verbose=true` on both base URLs, API key in local `backend/.env` only). First check 2026-09-29.

**UI:** Token Factory → **Model endpoints** → Public endpoints (shared API, no dedicated deploy). Matches the API list for the NVIDIA Nemotron models below.

---

## Which model for which feature?

| Goldito feature | Phase | API route | Env role | Model ID (public endpoint) | Why this model |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Inquiry auto-reply** (Stage 1) | 07B | `POST /api/ai/inquiry-reply` | `MODEL_FAST` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | **Speed:** answer in seconds from server-collected facts (schedule, quote, policy, RAG). Never computes prices. |
| **RAG embeddings** (Stage 1 · 5) | 07B · 07C | `services/rag.py` | `MODEL_EMBED` | `Qwen/Qwen3-Embedding-8B` | Only embedding model in the catalog. `dimensions: 1024` works on both base URLs (2026-10-01) → pgvector `vector(1024)` + HNSW. |
| **Care plan → checklist** (Stage 2) | 06 | `POST /api/ai/care-plan` | `MODEL_REPORT` | `nvidia/nemotron-3-super-120b-a12b` | Structured JSON for times, doses, cautions from the owner's free text. |
| **Handoff photo check** (Stage 4) | 06B | `POST /api/ai/handoff-check` | `MODEL_VISION` | `nvidia/Nemotron-3.5-Super-VL` | **Vision:** pet visible, species match, crate / seatbelt in the car. Server decides ok / warning. |
| **Feed auto-caption + album category** | 09 | `POST /api/ai/caption` | `MODEL_VISION` | `nvidia/Nemotron-3.5-Super-VL` | **Vision:** reads the photo (pet, activity) and writes a short English caption + `meal`/`walk`/`nap`/`play`/`other`. Sitter does not type. |
| **Treat safety — read label** | 08 | `POST /api/ai/safety-check` (step 1) | `MODEL_VISION` | `nvidia/Nemotron-3.5-Super-VL` | **Vision/OCR:** ingredient label photo → structured ingredient list + product name. |
| **Treat safety — reason** | 08 | same (step 2) | `MODEL_SAFETY` | `nvidia/Nemotron-3-Ultra-550b-a55b` | **Text reasoning:** allergens, hidden sources (e.g. poultry in “animal fat”), DANGER/WARNING/SAFE JSON. |
| **Daily report draft** | 07 | `POST /api/ai/daily-report` | `MODEL_REPORT` | `nvidia/nemotron-3-super-120b-a12b` | **Long-form text:** warm end-of-day report from today’s logs + feed + the 5-second check (report photos described by `MODEL_VISION` first). |
| **Report chips** (Stage 4) | 07 | `POST /api/ai/report-chips` | `MODEL_VISION` | `nvidia/Nemotron-3.5-Super-VL` | **Vision:** 1–2 short episode chips per report photo. The day-record chips (meal, potty, walk, meds) come from the database with no model call; the sitter keeps or turns off each chip (D38). |
| **Pet Life Record** (Stage 5) | 07C | `POST /api/ai/life-record` | `MODEL_REPORT` | `nvidia/nemotron-3-super-120b-a12b` | Long-context summary of a whole stay; only recorded facts, null when no evidence. |
| **Booking chat chips** | 03D | `POST /api/ai/chat-chips` | `MODEL_CHAT_CHIPS` | `nvidia/nemotron-3-super-120b-a12b` | 2 to 3 short labels. Nano and Lightning chips were fine but the drafts and the chat they fed were not; Super chips needed the prompt line "under 30 characters, no digits" (4 of 20 turns fell back to the generic chips before it, 0 after). |
| **Booking chat draft** | 03D | `POST /api/ai/chat-draft` | `MODEL_CHAT_OWNER` / `MODEL_CHAT_SITTER` | `nvidia/nemotron-3-super-120b-a12b` | One short message in the person's voice. Nano and Lightning looped on repeats and fell back to bare chip words in a 20 message run, Super did not. The chat AI does not use Nano. |
| **Dev smoke / cheap tests** | 07.1 | `scripts/test_nebius.py` | `MODEL_FAST` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Fast, low-cost Nemotron for “hello world” and JSON/format checks before wiring Super/Ultra. |
| **Optional: fast text** | — | (stretch) | — | `nvidia/Nemotron-3_5-Lightning` | Cheaper/faster text if we split caption **wording polish** from vision (P1 only if needed). |

**Not on the shared API (do not rely on for demo):** `nvidia/nemotron-3-nano-omni` — dedicated endpoint only (2026-10-02, see the NVIDIA catalog check below); **vision is `nvidia/Nemotron-3.5-Super-VL`** since 2026-10-27 (see the switch note below). **Qwen-2.5-VL** (named in the team's Full Process scenario) is not in the catalog either (2026-10-01).

**Image-input models in the catalog (2026-10-01, `architecture.modality = text+image->text`):** `moonshotai/Kimi-K2.6` (both base URLs) — plus `moonshotai/Kimi-K3`, `zai-org/GLM-5.3-Flash`, `deepseek-ai/DeepSeek-V4.1-Flash` on the eu-north1 gateway only. On 2026-10-01 no NVIDIA vision or embedding model was listed; `Nemotron-3.5-Super-VL` appeared on the global base URL later (seen 2026-10-27). Still no NVIDIA embedding model.

**Tavily:** not a Nebius model — web search for unknown ingredients/recalls (Phase 08.7 stretch, 11.3 fallback). See tavily.md.

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
| Nemotron-3.5-Super-VL (Vision, global URL only) | `nvidia/Nemotron-3.5-Super-VL` |

---

## Phase 0.3 inference smoke (2026-09-29)

| Test | Model | Base URL | Result |
| :--- | :--- | :--- | :--- |
| Text chat | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | `https://api.tokenfactory.nebius.com/v1/` | **200** — assistant `content`: `OK` (use `max_tokens` ≥ 64; model may fill `reasoning` first) |
| Vision + image | an earlier vision model | `https://api.tokenfactory.us-central1.nebius.com/v1/` | **200** — `data:image/png;base64,...` in `image_url` works (architecture D12). External image URLs may fail if Nebius cannot fetch them. |

Phase 00 DoD for Nebius: **met** (catalog + role mapping + one Fast + one Vision call).

## Embeddings check (2026-10-01)

| Base URL | Model | `dimensions` | Result |
| :--- | :--- | :--- | :--- |
| us-central1 | `Qwen/Qwen3-Embedding-8B` | default | **200** — 4096 dims |
| us-central1 | `Qwen/Qwen3-Embedding-8B` | 1024 | **200** — 1024 dims |
| eu-north1 gateway | `Qwen/Qwen3-Embedding-8B` | default / 1024 | **200** — 4096 / 1024 dims |

Input: one fictional sentence ("Max is a Maltese who is allergic to chicken."). Use 1024 — pgvector HNSW indexes support up to 2000 dims.

## Model policy (D39) and NVIDIA catalog check (2026-10-02)

**Policy:** prefer US-made models, and NVIDIA models wherever a feature allows it. Chinese-origin models are allowed only when there is no US/NVIDIA alternative or the cost/quality gap is large — record the reason here. Current exceptions: `Qwen/Qwen3-Embedding-8B` (**final, decided 2026-10-02 — no NVIDIA embedding in the catalog, already verified at 1024 dims, no other embedding model will be evaluated**).

**Console "Model catalog" (provider = NVIDIA) vs. our API key (`GET /v1/models`, both base URLs, 2026-10-02):**

| Console catalog entry | Origin | Modality (catalog) | Visible to our API key? |
| :--- | :--- | :--- | :--- |
| Nemotron-3-Nano-30B-A3B / NVIDIA-Nemotron-3-Nano-30B-A3B, Nemotron-3-Super-120b-a12b, Nemotron-3-Ultra-550b-a55b, Nemotron-3.5-Lightning | NVIDIA | text | **yes** (in use) |
| **Nemotron-Nano-V2-12b** | NVIDIA | **vision** | **no** — console model page (2026-10-02): **Dedicated endpoint only**, public endpoint not available, no fine-tuning |
| **Cosmos3-Super-Reasoner** (33B FP16) | NVIDIA (check the model card for its base model) | **vision** (video reasoning) | **no** — **Dedicated endpoint only**, public endpoint not available, no fine-tuning (the per-token price-list entry does not make it callable on the shared API) |
| **Nemotron-3-Nano-Omni** | NVIDIA | catalog says text-to-text (name says Omni) | **no** — **Dedicated endpoint only**, no fine-tuning |
| Llama-3_1-Nemotron-Ultra-253B-v1 | Llama-based, NVIDIA-tuned | text | not listed on our key |
| GLM-4.7-NVFP4, MiniMax-M2.5/M2.7-NVFP4, Qwen3.5-397B-A17B-NVFP4 | **Chinese originals**, only quantized by NVIDIA | text | not counted as NVIDIA models |

**Decision (2026-10-02): no NVIDIA vision model yet.** The three NVIDIA vision/omni models can only be deployed as Dedicated Endpoints. An always-on endpoint costs L40S $2/GPU-hour (about $48/day; enough for the 12B model) or H100 $4.7/GPU-hour (about $113/day; needed for the 33B FP16 Cosmos model) — more than the $125 balance over the weeks the demo must stay up. A short-lived endpoint just to record the demo video is possible later (not planned).

**Switch (2026-10-27): vision is `nvidia/Nemotron-3.5-Super-VL`.** We compared it with one other vision model (not NVIDIA) first; only Nemotron is used. It appeared in `GET /v1/models` on `https://api.tokenfactory.nebius.com/v1/` only (not on the us-central1 URL), so `MODEL_VISION_BASE_URL` moves to the global URL. Thinking is on by default and fills `max_tokens` before any answer (caption 0/6 right, 300 tokens, about 3.7 s), so `nebius.chat` sends `enable_thinking: false` for vision calls. Same prompts and photos, thinking off, one run per call: caption category 4/6 for both models; breed guess 10/12 (Super VL) against 9/12 (the other model we compared); handoff photos not comparable (both read the demo images as placeholders); median 1.0 to 1.4 s for both. Treat labels: six sample labels in five versions (original, blur, 35% size at JPEG quality 35, rotated 7 degrees, right 40% cut off), two runs each, 60 calls per model: neither model missed an ingredient in the four readable versions, and neither disagreed with itself; on the cut-off labels the other model said `complete: true` 10 of 10 times, Super VL 0 of 10. Clean sample labels and small samples, not real packaging.

**Fine-tuning (11.7):** confirmed in the console — `google/gemma-4-E4B-it` appears in the fine-tuning wizard (LoRA or Full fine-tuning, $0.40 / 1M tokens, 8K context); **Nemotron models do not appear, and their model pages show Full / LoRA fine-tuning "Not available"** (the catalog's generic "Fine-tuning" badge is misleading). So the SFT candidate is **Gemma-4-E4B-it (LoRA)** — **showcase only, not wired into the app (D43)**. A tuned Gemma 4 most likely needs a Dedicated Endpoint (L40S $2/GPU-hour, H100 $4.7). Account balance on 2026-10-02: $125. RFT is not being pursued (no application).

**Fun mood meter (11.9 / D42):** `agentmish/dog-emotion-classifier-v2` — Apache-2.0, ViT-base, 85.6% accuracy on its small eval set, no training-dataset license stated. `Dewa/dog_emotion_v2` has no license tag, do not use.

## Speech-to-text check (2026-10-10)

`GET /v1/models` with our key (read-only): **25 models** on `api.tokenfactory.nebius.com`, **18** on the us-central1 URL. **No speech-to-text / audio model** (no whisper · asr · speech · audio · parakeet · canary · voxtral). Image-input models in the list: `moonshotai/Kimi-K2.6` (and K3 on the first URL), `google/gemma-3-27b-it`. So voice input in the pet profile onboarding (pet-profile-onboarding.md §6.2) records audio in the browser, turns it into text with an **external speech-to-text service — Groq `whisper-large-v3-turbo`, free plan (decided 2026-10-10)** — and uses Nemotron only to extract facts from the text. Check Safari / Chrome recordings and Groq's terms when building. Re-check the list if a speech model is announced.

## Treat check calls (12.1, 2026-10-14)

Direct HTTP calls with the keys in local `backend/.env` (the same prompts and parameters as `routers/ai_safety_check.py`; not through the FastAPI route, Cloudinary or the DB — no local Python on that machine; `scripts/measure_safety.py` is still to write). `GET /v1/models`: `MODEL_VISION` (an earlier vision model), `MODEL_SAFETY` `nvidia/Nemotron-3-Ultra-550b-a55b`, `MODEL_REPORT`, `MODEL_FAST` all listed.

| Step | Result |
| :--- | :--- |
| **Vision** (an earlier vision model, `vision_system.md`, JSON mode, temperature 0) on the four made-up sample labels | All four `readable: true`, product name and every ingredient right, in order — **0.9–1.4 s** each. Bracketed text stays on the ingredient (`"animal fat (preserved with mixed tocopherols)"`, `"mixed tocopherols (preservative)"`) instead of being split as the prompt asks; the rule table still matches `animal fat` (whole word). |
| **Tavily** (`search_depth: basic`, 3 results, FDA pages) — `xylitol toxic dogs` | 3 results from fda.gov in about **2 to 3 s** |
| **Ultra** (thinking on, `reasoning_system.md`, JSON mode, `max_tokens` 2000) — Max (chicken allergy) + the animal-fat biscuit with the rule findings and one excerpt | **WARNING** (matches the rules), both hidden sources kept, message names Max and the chicken risk — **2.7 s**, 614 completion tokens, `finish_reason: stop` (2000 is enough) |

Estimated route total ≈ vision 1.4 s + Tavily ≤ 3 s (parallel, 8 s cap) + Ultra ≈ 3 s → **about 7–8 s**, so the app's "Checking for {name}…" (switches at 8 s) rarely shows. Still to do: the full route on the hosted DB once `013` is applied (Cloudinary fetch, all four labels, DANGER notice to the owner).

## Photo caption latency (09.1, 2026-10-07)

`backend/scripts/measure_caption.py` — the 3 demo photos × 3 runs, an earlier vision model, JSON `{caption, category}`, reasoning n/a, 120 max tokens, temperature 0.8, local images (no Cloudinary / DB). **Category right 8 / 9, latency median ≈ 1.2 s, max ≈ 1.3 s.** The first prompt got 4 / 9 because the sample "meal" photo is a dog beside a carrot and the sample "nap" photo is a dog lying on a bed with its mouth open; the category hints now say food next to or in the mouth of the pet is a meal, and lying calmly on a bed / blanket / rug is a nap. Captions are 1 short sentence, warm, name used once; no medical claims. Real-world accuracy still needs the team's 5-photo read (phase-09 DoD 1).

## Inquiry reply latency (07B.7, 2026-10-07)

`backend/scripts/measure_inquiry.py` — 10 runs, real Token Factory, ~2k-token facts (5 policy sources, 2 pets, the quote) plus the sitter's style card and 3 own examples, Nemotron-3 Nano, reasoning off, 350 max tokens. No DB writes.

| Step | median | max |
| :--- | :--- | :--- |
| RAG query embedding (Qwen3-Embedding-8B, 1024 dims) | 539 ms | 2639 ms |
| Tone search embedding + Nano draft (incl. the one rewrite when a check fails) | 2591 ms | 3591 ms |
| Hosted Supabase round trip (one query) | 37 ms | 584 ms |
| **Estimated draft total** (embedding + tone + draft + ~120 ms for the four parallel gathers) | **3.2 s** | **6.1 s** |

Target met (p50 < 10 s, max < 60 s). The model is most of it; the database is a few tens of ms per query, so a cache in front of it (e.g. Redis) would save about 1 % — not worth the stale-data risk for allergies and Heads-ups. The human-paced auto-send delay (15–40 s) is separate and deliberate (7B.10). The gathering that needs a signed-in session (schedule and quote RPCs) is not in this script: it is timed in the app run on the hosted DB once `010` is applied there.

## Booking chat simulation (2026-10-22)

A local simulation (not in the repo, the real check is the app with an owner and a sitter side by side) - a fake owner (Robert) and sitter (Chloe) chat about one stay for Max, both only tapping chips. It runs the real chips prompt, draft prompt, rule checks and one rewrite (past 40 messages the app's rolling summary too); Ultra then rates the whole chat 1 to 10 and tags each bad message. One or two runs per setting, so the numbers are a hint, not a proof. A setting is `chips,draft`; "fast" is Nano.

| Setting | Messages | Score | Draft fallback | Fragments | Repeat tags |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Nano chips, Nano drafts | 20 | 2, 2 | 4.5 | 4.5 | 8.5 |
| Nano chips, Super drafts | 20 | 4, 3 | 0 | 0 | 11 |
| Super chips, Super drafts | 20 | 3, 3 | 0 | 0.5 | 8.5 |
| Nano chips, Nano drafts | 50 | 2 | 15 | 15 | 26 |
| Nano chips, Super drafts | 50 | 3 | 5 | 3 | 11 |

- **Super for drafts and chips is the choice (2026-10-22).** Nano drafts looped on repeats, fell back to the chip's bare words ("Photo update.") and made up details; Lightning did the same and failed more calls.
- **A judge was tried and removed.** A second Super call that read each draft with the same facts caught a made-up "Maple Park", a second self-introduction and a bare "Sure." on hand-made drafts (0.38 s median), but in 20 and 50 message chats the score did not move (3 to 4 of 10 with or without it), repeats did not drop, and the first version cut drafts down to the chip's bare words more often (9 fallbacks in 50 messages vs 5 without it).
- **Every setting loops after about 20 messages** (the same pickup time, pill and photo confirmations): both sides only tap chips, nothing tells the model which topics are already settled, and the repeat check compares text, not meaning. It is not the context size (20 to 50 short messages are a few thousand tokens). The chat AI inputs below (profile, cards, progress, topics) were built to attack this.
- **Seconds per turn** (median / worst): Super chips 1.0 to 1.1 / 2.4 (Nano chips 1.5 / 3.5), Super draft with rewrites 1.0 / 2.5 (Nano 1.7 / 3.6); a person waits about 1 s after tapping a chip.

### What the chat AI reads: 50 message runs per step (2026-10-22)

Same local simulation, now with a booking that moves along (request at message 6, Meet & Greet, agreement, quote and payment, drop-off at 36, pick-up at 46), Max (allergic to chicken, daily pill) and Luna, and Ultra rating the whole chat with the booking events in front of it. Super for chips and drafts everywhere. Each row is the code at that step's commit; one run each, the last two rows two runs. "Flagged" is the number of messages Ultra marked.

| Step | Score | Flagged | Repeat | Invented | Contradiction | Off topic | Fragment |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| before (Super, no new inputs) | 4 | 44 | 19 | 4 | 4 | 7 | 10 |
| 1 profile block, allergies, checklist | 3 | 23 | 16 | 3 | 2 | 1 | 0 |
| 2 + every card | 4 | 18 | 4 | 0 | 12 | 0 | 0 |
| 3 + progress | 4 | 23 | 12 | 6 | 3 | 2 | 0 |
| 4 + topics (first version) | 3 | 24 | 2 | 1 | 3 | 18 | 0 |
| 4 + topics only while they matter | 4, 4 | 10, 10 | 1, 5 | 2, 1 | 7, 1 | 0, 2 | 0, 0 |
| + chips prompt fix (Meet & Greet) | 4, 4 | 19, 19 | 5, 7 | 7, 3 | 5, 3 | 2, 4 | 0, 2 |
| final (no vet topic) | 4, 4 | 20, 16 | 8, 4 | 8, 7 | 0, 4 | 3, 1 | 1, 0 |

- **Flagged messages went from 44 to between 10 and 24** and the one or two word fragments (10) are gone. The score barely moves (3 to 4 of 10): Ultra is strict and the chats still loop a little after the stay.
- **The profile block removed the fragments, the cards cut repeats** (19 to 4), progress made the booking state consistent, topics cut repeats further but the first version pushed topics after the stay began (18 off-topic) until each topic got a last step.
- **Not solved: made-up details.** Final runs still get 7 to 8 "invented" flags (a park name, a litter type, a quote amount, times). The vet topic made the model invent clinics, so it was removed (the app knows no vet).
- **Runs vary a lot** (the same code gave 10 and 19 flagged messages in two rounds). Do not read a one-message difference as an effect. The real check is the app with an owner and a sitter side by side (test-guide CHAT-41 to CHAT-44).
- **Speed:** median about 1.0 to 1.2 s for chips and 1.0 to 1.2 s for a draft in the five-way run, the same for every step (the extra input costs no measurable time). The last runs were slower (medians 1.3 to 2.5 s, worst 14 to 44 s) while the model API was slow; the inputs did not change between them.

## Open questions (Phase 07.1 / 08 spike)

- [x] NVIDIA vision models (Nemotron-Nano-V2-12b, Cosmos3-Super-Reasoner, Nemotron-3-Nano-Omni): Dedicated Endpoint only, not callable on the shared API → a shared-API vision model instead (Nemotron-3.5-Super-VL since 2026-10-27)
- [x] Fine-tuning: wizard offers Gemma-4-E4B-it, no Nemotron (2026-10-02)
- [x] Gemma-4-E4B-it offers **LoRA fine-tuning** in the wizard's Training type step (2026-10-02) — use LoRA for the tone tuning (style only, cheaper, less forgetting)
- [x] LoRA serving for Gemma 4: the price list has only Gemma-4 *Fine-tuning* SKUs (no Input/Output or `-LoRa` serving SKUs), so a tuned Gemma 4 most likely needs a Dedicated Endpoint. Per the fine-tuning docs, serverless LoRA deploy is listed only for Llama-3.1-8B-Instruct and Llama-3.3-70B-Instruct; Qwen3-14B/32B are trainable but not on that list, so a Chinese model does not fix serving (2026-10-02)
- **Decision (D43):** SFT is a showcase only — the app runtime uses Nemotron + style card + few-shot; no serving of a tuned model (phase-11 11.7)
- [ ] Tone: compare Nemotron-3 Nano / Super / gpt-oss-120b / gemma-3-27b-it on the same few-shot tone prompt (07B.8), blind-rated by the sitter

- [ ] Ultra/Super: `response_format` / JSON schema adherence
- [x] Image input: base64 data URL (D12) accepted by the vision model on Token Factory — smoke 2026-09-29
- [x] Nano: inquiry reply p50 latency with ~2k-token grounding JSON — **p50 ≈ 3.2 s, max ≈ 6.1 s** over 10 runs (2026-10-07, see "Inquiry reply latency" below; target < 10 s)
- [x] Nemotron tool calling on Token Factory: **works** on both `NVIDIA-Nemotron-3-Nano-30B-A3B` (≈ 0.9 s) and `nemotron-3-super-120b-a12b` (≈ 0.9 s) with `tools` + `tool_choice="auto"` and `enable_thinking: false` — returns a proper `tool_calls` entry with valid JSON arguments (2026-10-07). Used only by the optional agent mode (7B.11)

---

## Verify

```bash
cd backend
export $(grep -v '^#' .env | grep NEBIUS_API_KEY | xargs)
curl -s "https://api.tokenfactory.us-central1.nebius.com/v1/models" \
  -H "Authorization: Bearer $NEBIUS_API_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print([m['id'] for m in d['data'] if 'nemotron' in m['id'].lower()])"
```


---

## Live check — `scripts/test_nebius.py` (7.1, 2026-10-04)

`cd backend && PYTHONPATH=. .venv/bin/python -m scripts.test_nebius` — 5 calls per role ("Say hi in one sentence."; vision gets `frontend/assets/demo/nap.jpg`), reasoning **off**, from the developer's laptop in Toronto.

| Role | Model | TTFT (median of 5) | Latency (median of 5) | Sample answer |
| :--- | :--- | ---: | ---: | :--- |
| fast | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | 642 ms | 782 ms | Hello! 😊 |
| report | `nvidia/nemotron-3-super-120b-a12b` | 195 ms | 197 ms | Hi! 👋 |
| safety | `nvidia/Nemotron-3-Ultra-550b-a55b` | 172 ms | 185 ms | Hi there! |
| vision | an earlier vision model | 1146 ms | 1266 ms | A small white dog with its mouth open is sitting on a white surface. |

Embeddings: `Qwen/Qwen3-Embedding-8B` returns 1024 dimensions with `dimensions=1024`.

**What the spike found (code comments in `app/services/nebius.py`):**

- **Reasoning toggle:** Nemotron thinks by default (the thinking comes back in a separate `reasoning` field, not in `content`). `extra_body={"chat_template_kwargs": {"enable_thinking": False}}` turns it off — Super: ~780 ms → ~240 ms, Nano: ~2.8 s → ~0.7 s for a one-line JSON answer. `chat(..., reasoning=True)` keeps it (Phase 08 safety step). The vision model gets no flag.
- **JSON mode:** `response_format={"type": "json_object"}` works on Nano and Super. `chat_json` still extracts the first balanced `{…}` and validates it with pydantic, retries once with a correction message, then raises `AIInvalidOutput`.
- **Streaming** works (TTFT = first content token); if a model refuses streaming or JSON mode with a 400/422, the call repeats without it and TTFT is null.
- **Not tested here:** tool calling (7B.11 spike), long inputs.
