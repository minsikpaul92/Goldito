"""Put the two demo accounts into a known test state (review FB-10).

A hosted-database write that cannot be undone, so it is a dry run unless you say --apply:

    cd backend
    .venv/bin/python -m scripts.reset_demo                       # dry run for the `pets` state
    .venv/bin/python -m scripts.reset_demo --state confirmed     # dry run for another state
    .venv/bin/python -m scripts.reset_demo --apply               # asks you to type reset, then does it

States: `empty` (owner has no pets) · `pets` (Max + Mochi, before any booking, the default) ·
`confirmed` (a booking the sitter accepted, before checkout). What is deleted and kept:
app/services/demo_reset.py. The same thing is behind the temporary Demo tools button
(`POST /api/demo/reset`, only while DEMO_RESET_ENABLED=1).

Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (and DEMO_PASSWORD for `confirmed`) from
backend/.env. Never run it against a project that holds real data: it is for the demo project only.
"""

import argparse
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.deps.supabase import get_service_client
from app.services import demo_reset


def confirmed(answer: str) -> bool:
    """`reset` in any case, with stray spaces ignored."""
    return answer.strip().lower() == "reset"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--state", choices=demo_reset.STATES, default="pets", help="the state to start from")
    parser.add_argument("--apply", action="store_true", help="really delete (default: dry run)")
    parser.add_argument("--yes", action="store_true", help="skip the typed confirmation (with --apply)")
    args = parser.parse_args()

    settings = get_settings()
    client = get_service_client()
    try:
        owner_id, sitter_id = demo_reset.demo_ids(client)
    except LookupError as exc:
        raise SystemExit(str(exc)) from exc
    today = datetime.now(ZoneInfo(settings.app_timezone)).date()

    print(f"Project: {settings.supabase_url}")
    print(f"Owner {owner_id[:8]}… · sitter {sitter_id[:8]}…  state `{args.state}` ({'APPLY' if args.apply else 'dry run'})")
    if args.apply and not args.yes:
        answer = input("This deletes the demo accounts' stays, inquiries, reports and notices. Type reset to continue: ")
        if not confirmed(answer):
            print("Cancelled — nothing changed.")
            return 1

    for label, rows in demo_reset.reset(client, owner_id, sitter_id, today, state=args.state, apply=args.apply):
        print(f"  {'deleted' if args.apply else 'would delete':<13} {rows:>4}  {label}")
    print("  (rows that cascade from bookings and inquiries go with them)")

    if args.apply:
        print(f"Built state `{args.state}`: services + prices · {demo_reset.OPEN_DAYS} open days · display names")
    else:
        print("Dry run only — add --apply to delete and build the state.")
    if demo_reset.tone_history_count(client, sitter_id) == 0:
        print("Note: the sitter has no seeded tone samples — run `python scripts/seed_tone.py --apply`.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
