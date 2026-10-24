"""DELETE /api/feed/{post_id}: out of my Feed only, or for both within 30 minutes; the file goes when nobody can see
the post any more (phase-05 5.7, #345)."""

import cloudinary.uploader
import pytest
from app.routers import feed
from app.services import authz
from app.services import cloudinary as cloudinary_service

from tests import test_media_sign as base
from tests.fakes import FakeDB
from tests.test_media_sign import PET_ID, SITTER_ID, owner_token, sitter_token

POST_ID = "00000000-0000-4000-8000-0000000000b1"
OTHER_POST_ID = "00000000-0000-4000-8000-0000000000b2"
MEDIA_ID = "00000000-0000-4000-8000-0000000000c1"
# Reuse the media-sign fixtures (JWT settings, test client).
isolated_settings = base.isolated_settings
client = base.client

PUBLIC_ID = f"goldito/{PET_ID}/feed/abc"


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
        care_checkins=extra.get("care_checkins", []),
        safety_checks=extra.get("safety_checks", []),
        daily_reports=extra.get("daily_reports", []),
        handoff_checks=extra.get("handoff_checks", []),
        pet_stickers=extra.get("pet_stickers", []),
    )


@pytest.fixture
def destroyed(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    calls: list[dict] = []
    monkeypatch.setattr(cloudinary_service, "configure_cloudinary", lambda: None)
    monkeypatch.setattr(
        cloudinary.uploader, "destroy", lambda public_id, **kw: calls.append({"id": public_id, **kw})
    )
    return calls


@pytest.fixture
def rpc(monkeypatch: pytest.MonkeyPatch) -> dict:
    """The database's answer to remove_feed_post: {"purge": ...} or an error message; `calls` records what was asked."""
    state: dict = {"answer": {"purge": True}, "error": None, "calls": []}

    def fake(token, fn, params, **_kw):
        state["calls"].append((fn, params))
        if state["error"]:
            raise authz.RpcError(fn, 400, state["error"])
        return state["answer"]

    monkeypatch.setattr(authz, "rpc_json", fake)
    return state


def delete(client, token: str, scope: str | None = None):
    url = f"/api/feed/{POST_ID}" + (f"?scope={scope}" if scope else "")
    return client.delete(url, headers={"Authorization": f"Bearer {token}"})


def test_removing_from_my_feed_keeps_the_post_for_the_other_person(client, monkeypatch, destroyed, rpc) -> None:
    rpc["answer"] = {"purge": False}
    db = make_db()
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    response = delete(client, owner_token())
    assert response.status_code == 200
    assert response.json() == {"removed": True, "deleted": False, "media_removed": False}
    assert rpc["calls"][0][1]["p_scope"] == "me"
    assert destroyed == []
    assert len(db.tables["feed_posts"]) == 1
    assert len(db.tables["media"]) == 1


def test_when_nobody_can_see_it_any_more_the_post_file_and_media_row_go(client, monkeypatch, destroyed, rpc) -> None:
    db = make_db()
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    response = delete(client, sitter_token())
    assert response.status_code == 200
    assert response.json() == {"removed": True, "deleted": True, "media_removed": True}
    assert destroyed == [{"id": PUBLIC_ID, "resource_type": "image", "invalidate": True}]
    assert db.tables["feed_posts"] == []
    assert db.tables["media"] == []


def test_delete_for_both_asks_the_database_with_the_everyone_scope(client, monkeypatch, destroyed, rpc) -> None:
    db = make_db()
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    response = delete(client, sitter_token(), "everyone")
    assert response.status_code == 200
    assert rpc["calls"] == [("remove_feed_post", {"p_post": POST_ID, "p_scope": "everyone"})]
    assert db.tables["feed_posts"] == []


def test_an_unknown_scope_is_refused(client, monkeypatch, destroyed, rpc) -> None:
    monkeypatch.setattr(feed, "get_service_client", lambda: make_db())
    assert delete(client, sitter_token(), "all").status_code == 422
    assert rpc["calls"] == []


@pytest.mark.parametrize(
    ("message", "code"),
    [("not_found", 404), ("not_author", 403), ("too_late", 409), ("boom", 502)],
)
def test_the_databases_refusals_become_http_errors(client, monkeypatch, destroyed, rpc, message, code) -> None:
    rpc["error"] = message
    db = make_db()
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    response = delete(client, owner_token(), "everyone")
    assert response.status_code == code
    assert destroyed == []
    assert len(db.tables["feed_posts"]) == 1


def test_too_late_says_it_can_only_be_deleted_on_my_side(client, monkeypatch, destroyed, rpc) -> None:
    rpc["error"] = "too_late"
    monkeypatch.setattr(feed, "get_service_client", lambda: make_db())
    assert "your side" in delete(client, sitter_token(), "everyone").json()["detail"]


def test_media_still_used_by_another_post_is_kept(client, monkeypatch, destroyed, rpc) -> None:
    db = make_db(feed_posts=[{"id": OTHER_POST_ID, "posted_by": SITTER_ID, "media_id": MEDIA_ID}])
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    response = delete(client, sitter_token())
    assert response.json() == {"removed": True, "deleted": True, "media_removed": False}
    assert destroyed == []
    assert [p["id"] for p in db.tables["feed_posts"]] == [OTHER_POST_ID]
    assert len(db.tables["media"]) == 1


# A Diary page's picture box (014t), a handoff check and a sticker in the box point at the same media row.
@pytest.mark.parametrize(
    "table", ["task_logs", "care_checkins", "safety_checks", "daily_reports", "handoff_checks", "pet_stickers"]
)
def test_a_photo_still_used_elsewhere_is_kept(client, monkeypatch, destroyed, rpc, table) -> None:
    db = make_db(**{table: [{"id": "row-1", "media_id": MEDIA_ID}]})
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    response = delete(client, sitter_token())
    assert response.json() == {"removed": True, "deleted": True, "media_removed": False}
    assert destroyed == []
    assert db.tables["feed_posts"] == []
    assert len(db.tables["media"]) == 1


def test_a_file_that_will_not_go_is_left_behind_and_the_delete_still_counts(client, monkeypatch, rpc) -> None:
    db = make_db()
    monkeypatch.setattr(feed, "get_service_client", lambda: db)
    monkeypatch.setattr(cloudinary_service, "configure_cloudinary", lambda: None)

    def boom(*_a, **_k):
        raise ConnectionError("down")

    monkeypatch.setattr(cloudinary.uploader, "destroy", boom)
    response = delete(client, sitter_token())
    assert response.status_code == 200
    assert response.json() == {"removed": True, "deleted": True, "media_removed": False}
    assert db.tables["feed_posts"] == []
    assert len(db.tables["media"]) == 1
