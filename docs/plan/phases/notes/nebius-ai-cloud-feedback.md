# Nebius AI Cloud — onboarding notes for the feedback log

Raw notes for the required Nebius / NVIDIA feedback (phase 10.6, hackathon README §7). Write down what happened while it is fresh; 10.6 turns this into the README table.

## 2026-10-09 — first try at a Serverless AI endpoint for the FastAPI backend (U0)

**Goal:** run `backend/Dockerfile` (FastAPI, CPU only, port 8000) as a public HTTPS endpoint so the Vercel app can call it.

**What worked**
- Endpoint form is clear: Custom image path, port + HTTP/TCP, platform (`cpu-d3`), preset (`2vcpu-8gb`), Regular vs Preemptible, live cost estimate ($0.08/hour) before creating.
- A public image on GitHub Container Registry (`ghcr.io/...`) needs no registry credentials — no Nebius keys in CI.
- **Files** can inject a whole `.env` into the container (mount path `/srv/.env`, ≤ 64 KiB) — a usable workaround for many env vars.

**What got in the way**
1. **Secret environment variables failed:** "Error saving environment variable to MysteryBox — `[permission_denied]`" on our account (the one that created the project). No hint in the form which role or group is missing.
2. **No bulk env import:** environment variables are one key/value row at a time; nothing like "paste a .env" (Render and Vercel both have it).
3. **Billing wall at Create:** "When you submit the billing details, we will charge your card $25 to top up your balance." The $100 AI Cloud credit from Builders & Brews Toronto (Sep 29) was not visible on the account, and the form does not say whether credits are used before the top-up.
4. **Bearer token auth vs app auth:** the endpoint's optional token uses `Authorization: Bearer`, the same header our app uses for its Supabase JWT, so it has to stay off. Worth a note in the docs (or a custom header name option).
5. **Min container disk 100 GiB** for a ~300 MB image; it shows up as a separate storage line in the estimate.
6. **Always on:** no scale-to-zero for endpoints, so a demo that must stay up until judging ends (Dec 15) costs about $128 on the smallest CPU preset.

**Outcome:** backend went to Render's free plan (D18 fallback) the same day; the image and the endpoint settings above are ready if the credit turns up ([phase-10.md](../phase-10.md) 10.3).

**Would we use it again?** For GPU or model serving, yes — the form and the cost estimate are good. For a small always-on CPU API, the billing step and the secrets permission were the blockers, not the product itself.
