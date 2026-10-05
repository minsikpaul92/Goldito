"""Live check of every Token Factory role (phase-07 7.1). Needs NEBIUS_API_KEY in backend/.env.

    cd backend && .venv/bin/python -m scripts.test_nebius

For each role (fast / report / safety / vision) it makes 5 calls and prints a Markdown table of
median TTFT and latency — the numbers for the README's Token Factory feedback — then checks the
embedding model once. Costs a few cents; run it, don't loop it.
"""

import base64
import statistics
from pathlib import Path

from app.config import get_settings
from app.services import nebius

CALLS = 5
SAMPLE = Path(__file__).resolve().parents[2] / "frontend" / "assets" / "demo" / "nap.jpg"


def messages(role: str) -> list[dict]:
    if role != "vision":
        return [{"role": "user", "content": "Say hi in one sentence."}]
    image = "data:image/jpeg;base64," + base64.b64encode(SAMPLE.read_bytes()).decode("ascii")
    return [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "In one short sentence, what is in this photo?"},
                {"type": "image_url", "image_url": {"url": image}},
            ],
        }
    ]


def median(values: list[int | None]) -> str:
    real = [v for v in values if v is not None]
    return f"{int(statistics.median(real))} ms" if real else "n/a"


def main() -> None:
    settings = get_settings()
    if not settings.nebius_api_key:
        raise SystemExit("NEBIUS_API_KEY is not set in backend/.env")

    rows = []
    for role in ("fast", "report", "safety", "vision"):
        results = []
        for _ in range(CALLS):
            results.append(nebius.chat(role, messages(role), endpoint="test", max_tokens=120))
        sample = results[-1].text.replace("\n", " ")[:70]
        rows.append(
            (
                role,
                results[0].model,
                median([r.ttft_ms for r in results]),
                median([r.latency_ms for r in results]),
                sample,
            )
        )
        print(f"{role:7} ok  {results[0].model}  → {sample}")

    vector = nebius.embed(["a friendly maltese who loves belly rubs"])[0]
    print(f"embed   ok  {settings.model_embed}  → {len(vector)} dimensions")

    print("\n| Role | Model | TTFT (median of 5) | Latency (median of 5) | Sample answer |")
    print("| :--- | :--- | ---: | ---: | :--- |")
    for role, model, ttft, latency, sample in rows:
        print(f"| {role} | `{model}` | {ttft} | {latency} | {sample} |")


if __name__ == "__main__":
    main()
