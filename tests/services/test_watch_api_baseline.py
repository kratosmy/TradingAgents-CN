import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import favorites, watch_digest


@pytest.fixture
def api_client(monkeypatch):
    app = FastAPI()
    app.include_router(favorites.router, prefix="/api")
    app.include_router(watch_digest.router)

    async def _current_user():
        return {"id": "user-1", "username": "tester"}

    app.dependency_overrides[favorites.get_current_user] = _current_user
    app.dependency_overrides[watch_digest.get_current_user] = _current_user

    with TestClient(app) as client:
        yield client


def test_watch_routes_require_authentication():
    app = FastAPI()
    app.include_router(favorites.router, prefix="/api")
    app.include_router(watch_digest.router)

    client = TestClient(app)

    favorites_resp = client.get("/api/favorites/")
    digests_resp = client.get("/api/watch/digests")
    rules_resp = client.get("/api/watch/rules")
    refresh_resp = client.post("/api/watch/digests/refresh-all")

    assert favorites_resp.status_code == 401
    assert digests_resp.status_code == 401
    assert rules_resp.status_code == 401
    assert refresh_resp.status_code == 401


def test_watch_routes_are_mounted_and_reachable(api_client, monkeypatch):
    async def _get_user_favorites(user_id):
        assert user_id == "user-1"
        return []

    async def _list_digest_cards(user_id):
        assert user_id == "user-1"
        return [{"stock_code": "600519", "summary": "ok"}]

    async def _get_user_rules(user_id):
        assert user_id == "user-1"
        return [{"stock_code": "600519", "schedule_type": "daily_post_market"}]

    async def _trigger_refresh_for_all(user_id):
        assert user_id == "user-1"
        return [{"stock_code": "600519", "stock_name": "贵州茅台", "market": "A股", "task_id": "task-1"}]

    async def _run_digest_refresh(*args, **kwargs):
        return None

    monkeypatch.setattr(favorites.favorites_service, "get_user_favorites", _get_user_favorites)
    monkeypatch.setattr(watch_digest.watch_digest_service, "list_digest_cards", _list_digest_cards)
    monkeypatch.setattr(watch_digest.watch_digest_service, "get_user_rules", _get_user_rules)
    monkeypatch.setattr(watch_digest.watch_digest_service, "trigger_refresh_for_all", _trigger_refresh_for_all)
    monkeypatch.setattr(watch_digest.watch_digest_service, "run_digest_refresh", _run_digest_refresh)

    favorites_resp = api_client.get("/api/favorites/")
    digests_resp = api_client.get("/api/watch/digests")
    rules_resp = api_client.get("/api/watch/rules")
    refresh_resp = api_client.post("/api/watch/digests/refresh-all")

    assert favorites_resp.status_code == 200
    assert favorites_resp.json()["success"] is True
    assert favorites_resp.json()["data"] == []

    assert digests_resp.status_code == 200
    assert digests_resp.json()["data"][0]["stock_code"] == "600519"

    assert rules_resp.status_code == 200
    assert rules_resp.json()["data"][0]["stock_code"] == "600519"

    assert refresh_resp.status_code == 200
    assert refresh_resp.json()["data"] == {"count": 1, "stocks": ["600519"]}
