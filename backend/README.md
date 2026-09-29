# PawNote backend

FastAPI (Python 3.12): Cloudinary signing, JWT-protected routes, Nemotron via Nebius Token Factory.

**Backend API (Phase 1.2+):** FastAPI app under `app/`, `requirements.txt`, `tests/`.

## Environment

1. Copy [`.env.example`](.env.example) → `.env` (gitignored).
2. Variable names match [architecture §4](../docs/plan/phases/architecture.ko.md#4-환경-변수-마스터-목록).
3. Secrets setup: [docs/plan/env-setup.ko.md](../docs/plan/env-setup.ko.md).

## Run

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
curl -s http://localhost:8000/health
pytest -q
```

Default port **8000**. Set `CORS_ORIGINS` to include Expo web (`http://localhost:8081`, `http://localhost:19006`).

## Planned layout

See [architecture §2](../docs/plan/phases/architecture.ko.md#2-리포-구조-최종-형태): `app/main.py`, `routers/`, `services/nebius.py`, `ai/prompts/`, etc.
