"""Handoff photo check on the sample photos, with latency (phase-06b 6B.5). Real vision model, local files.

    .venv/bin/python scripts/measure_handoff.py [runs per photo] [folder]

Defaults to `tests/fixtures/handoff/` (dog_at_door · car_crate_ok · car_no_crate · empty_room). Until the real
photos are in, those files are labelled placeholders, so an expectation that fails here is not a model result.
No Cloudinary and no database.
"""

import base64
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai.prompts import load_prompt  # noqa: E402
from app.routers.ai_handoff_check import HandoffFindings, decide_status  # noqa: E402
from app.services import nebius  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "handoff"
# photo → (check type, the status we expect)
EXPECTED = {
    "dog_at_door": ("pet_checkin", "ok"),
    "car_crate_ok": ("vehicle_safety", "ok"),
    "car_no_crate": ("vehicle_safety", "warning"),
    "empty_room": ("pet_checkin", "warning"),
}


def main() -> None:
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    folder = Path(sys.argv[2]) if len(sys.argv) > 2 else FIXTURES
    latencies: list[float] = []
    right = total = 0
    for name, (check_type, expected) in EXPECTED.items():
        url = "data:image/jpeg;base64," + base64.b64encode((folder / f"{name}.jpg").read_bytes()).decode()
        for _ in range(runs):
            messages = [
                {"role": "system", "content": load_prompt("handoff_check/system.md")},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"Check type: {check_type}\nPet: Max (dog)"},
                        {"type": "image_url", "image_url": {"url": url}},
                    ],
                },
            ]
            started = time.perf_counter()
            parsed, _ = nebius.chat_json(
                "vision", messages, HandoffFindings, endpoint="measure", max_tokens=200, temperature=0.1, timeout=20
            )
            ms = (time.perf_counter() - started) * 1000
            latencies.append(ms)
            verdict = decide_status(check_type, parsed)
            total += 1
            right += verdict == expected
            print(f"{name:13} {check_type:14} → {verdict:7} {'✓' if verdict == expected else '✗'} {ms:5.0f} ms  {parsed.model_dump()}")
    print(f"\nstatus right: {right}/{total} · latency median {statistics.median(latencies):.0f} ms, max {max(latencies):.0f} ms")


if __name__ == "__main__":
    main()
