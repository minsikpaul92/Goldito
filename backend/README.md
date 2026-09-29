# PawNote backend

FastAPI service (media signing, AI routes). Scaffold lands in Phase 1.2.

## Environment

1. Copy variables from [`.env.example`](.env.example) into [`.env`](.env) (`.env` is gitignored).
2. Fill secrets from your password manager — see [docs/plan/env-setup.ko.md](../docs/plan/env-setup.ko.md).

Run (after Phase 1.2):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
