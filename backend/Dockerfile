# Goldito backend — FastAPI on Python 3.12 (phase 10.3, pulled forward as U0).
# Build from backend/:  docker build -t goldito-backend .
# Run locally:          docker run --rm -p 8000:8000 --env-file .env goldito-backend
# Secrets come from the host's env (Nebius Serverless Endpoint / Render), never baked into the image.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

WORKDIR /srv

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 10001 goldito
USER goldito

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/health', timeout=4)"

# Hosts like Render set PORT; behind their proxy, trust X-Forwarded-* for the client scheme and IP.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
