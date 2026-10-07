"""Caption + category on real photos, with latency (phase-09 DoD 1 · 4). Real vision model, local demo photos.

    .venv/bin/python scripts/measure_caption.py [runs per photo]

Uses the three demo photos in `frontend/assets/demo/` (meal · walk · nap), so no Cloudinary and no database.
"""

import base64
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai.prompts import load_prompt  # noqa: E402
from app.routers.ai_caption import Captioned, tidy_caption  # noqa: E402
from app.services import nebius  # noqa: E402

DEMO = Path(__file__).resolve().parents[2] / "frontend" / "assets" / "demo"
EXPECTED = {"meal": "meal", "walk": "walk", "nap": "nap"}


def main() -> None:
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    latencies: list[float] = []
    right = total = 0
    for name, expected in EXPECTED.items():
        url = "data:image/jpeg;base64," + base64.b64encode((DEMO / f"{name}.jpg").read_bytes()).decode()
        for _ in range(runs):
            messages = [
                {"role": "system", "content": load_prompt("caption/system.md") + "\n\nStyle notes for this sitter: Friendly, plain and brief."},
                {"role": "user", "content": [{"type": "text", "text": "Pet: Max (dog)"}, {"type": "image_url", "image_url": {"url": url}}]},
            ]
            started = time.perf_counter()
            parsed, _ = nebius.chat_json("vision", messages, Captioned, endpoint="measure", max_tokens=120, temperature=0.8, timeout=20)
            ms = (time.perf_counter() - started) * 1000
            latencies.append(ms)
            total += 1
            right += parsed.category == expected
            print(f"{name:5} → {parsed.category:5} {'✓' if parsed.category == expected else '✗'} {ms:5.0f} ms  {tidy_caption(parsed.caption)!r}")
    print(f"\ncategory right: {right}/{total} · latency median {statistics.median(latencies):.0f} ms, max {max(latencies):.0f} ms")


if __name__ == "__main__":
    main()
