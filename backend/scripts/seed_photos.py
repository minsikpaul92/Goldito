"""Upload the demo photos the reset seeds into Moments (see app/services/demo_history.py).

Run once per demo set (and again if a seeded photo was deleted in the app); it only uploads what Cloudinary does not
have yet. Dry run unless you say --apply:

    cd backend
    .venv/bin/python -m scripts.seed_photos                  # dry run for the default set
    .venv/bin/python -m scripts.seed_photos --set paul --apply

Reads CLOUDINARY_* from backend/.env. The files are in frontend/assets/demo (no people, no metadata).
"""

import argparse
import sys
from pathlib import Path

import cloudinary.api
import cloudinary.exceptions
import cloudinary.uploader
from app.services import demo_history
from app.services.cloudinary import configure_cloudinary
from app.services.demo_accounts import DEFAULT_SET, DEMO_SETS, set_for_key

# The same incoming transformation as a browser upload (`INCOMING_IMAGE`), as the SDK wants it.
INCOMING = [{"crop": "limit", "width": 2000}, {"quality": "auto"}]
ASSETS = Path(__file__).resolve().parents[2] / "frontend" / "assets" / "demo"


def exists(public_id: str) -> bool:
    try:
        cloudinary.api.resource(public_id, resource_type="image")
        return True
    except cloudinary.exceptions.NotFound:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--set", dest="set_key", choices=[s.key for s in DEMO_SETS], default=DEFAULT_SET.key
    )
    parser.add_argument("--apply", action="store_true", help="really upload (default: dry run)")
    args = parser.parse_args()

    configure_cloudinary()
    demo_set = set_for_key(args.set_key)
    todo = []
    for public_id, name in demo_history.seed_photo_files(demo_set.key):
        path = ASSETS / name
        if not path.is_file():
            raise SystemExit(f"Missing file: {path}")
        if not exists(public_id):
            todo.append((public_id, path))
    print(
        f"Set `{demo_set.key}`: {len(todo)} photos to upload ({'APPLY' if args.apply else 'dry run'})"
    )
    for public_id, path in todo:
        print(f"  {public_id}  <-  {path.name}")
        if args.apply:
            cloudinary.uploader.upload(
                str(path),
                public_id=public_id,
                resource_type="image",
                overwrite=False,
                transformation=INCOMING,
            )
    if not args.apply and todo:
        print("Dry run only — add --apply to upload.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
