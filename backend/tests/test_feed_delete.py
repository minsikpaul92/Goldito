"""DELETE /api/feed/{post_id}: author-only, removes the file unless still used (phase-05 5.7)."""

import cloudinary.uploader
import pytest
from app.routers import feed
from app.services import cloudinary as cloudinary_service

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import OWNER_ID, PET_ID, SITTER_ID, owner_token, sitter_token

POST_ID = "00000000-0000-4000-8000-0000000000b1"
OTHER_POST_ID = "00000000-0000-4000-8000-0000000000b2"
MEDIA_ID = "00000000-0000-4000-8000-0000000000c1"
# Reuse the media-sign fixtures (JWT settings, test client).
isolated_settings = base.isolated_settings
client = base.client

PUBLIC_ID = f"pawnote/{PET_ID}/feed/abc"


def make_db(**extra) -> FakeDB:
    return FakeDB(
        feed_posts=[
            {
                "id": POST_ID,
                "posted_by": SITTER_ID,
                "media_id": MEDIA_ID,
                "media": {"cloudinary_public_id": PUBLIC_ID, "resource_type": "image"},
            },
            *extra.get("feed_posts", []),
        ],
        media=[{"id": MEDIA_ID}],
        task_logs=extra.get("task_logs", []),
        safety_checks=[],
    )


@pytest.fixture
def destroyed(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    calls: list[dict] = []
    monkeypatch.setattr(cloudinary_service, "configure_cloudinary", lambda: None)
    monkeypatch.setattr(
        cloudinary.uploader, "destroy", lambda public_id, **kw: calls.append({"id": public_id, **kw})
    )
    return calls


def delete(client, token: str):
    return client.delete(f"/api/feed/{POST_ID}", headers={"Authorization": f"Bearer {token}"})


def test_author_delete_removes_post_file_and_media_row(client, monkeypatch, destroyed) -> None:
    db = make_db()
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    response = delete(client, sitter_token())
    assert response.status_code == 200
    assert response.json() == {"deleted": True, "media_removed": True}
    assert destroyed == [{"id": PUBLIC_ID, "resource_type": "image", "invalidate": True}]
    assert db.tables["feed_posts"] == []
    assert db.tables["media"] == []


def test_owner_can_delete_their_own_post(client, monkeypatch, destroyed) -> None:
    db = make_db()
    db.tables["feed_posts"][0]["posted_by"] = OWNER_ID
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    response = delete(client, owner_token())
    assert response.status_code == 200
    assert db.tables["feed_posts"] == []


def test_other_user_cannot_delete(client, monkeypatch, destroyed) -> None:
    db = make_db()
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    response = delete(client, owner_token())
    assert response.status_code == 403
    assert destroyed == []
    assert len(db.tables["feed_posts"]) == 1


def test_missing_post_is_404(client, monkeypatch, destroyed) -> None:
    monkeypatch.setattr(feed, "get_service_client", lambda: FakeDB(feed_posts=[]))
    assert delete(client, sitter_token()).status_code == 404


def test_media_still_used_by_another_post_is_kept(client, monkeypatch, destroyed) -> None:
    db = make_db(feed_posts=[{"id": OTHER_POST_ID, "posted_by": SITTER_ID, "media_id": MEDIA_ID}])
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    response = delete(client, sitter_token())
    assert response.json() == {"deleted": True, "media_removed": False}
    assert destroyed == []
    assert [p["id"] for p in db.tables["feed_posts"]] == [OTHER_POST_ID]
    assert len(db.tables["media"]) == 1


def test_cloudinary_failure_changes_nothing(client, monkeypatch) -> None:
    db = make_db()
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    monkeypatch.setattr(cloudinary_service, "configure_cloudinary", lambda: None)

    def boom(*_a, **_k):
        raise ConnectionError("down")

    monkeypatch.setattr(cloudinary.uploader, "destroy", boom)
    response = delete(client, sitter_token())
    assert response.status_code == 502
    assert len(db.tables["feed_posts"]) == 1
    assert len(db.tables["media"]) == 1
