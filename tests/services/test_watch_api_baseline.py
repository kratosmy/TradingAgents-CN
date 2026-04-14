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


def test_watch_rule_upsert_and_delete_routes_surface_stable_contract(api_client, monkeypatch):
    state = {}

    async def _upsert_rule(**kwargs):
        state["saved"] = kwargs
        return {
            "stock_code": kwargs["stock_code"],
            "stock_name": kwargs["stock_name"],
            "market": kwargs["market"],
            "schedule_type": kwargs["schedule_type"],
            "schedule_summary": "每天盘后",
            "cron_expr": kwargs["cron_expr"],
            "status": kwargs["status"],
            "created_at": "2026-04-14T10:00:00+08:00",
            "updated_at": "2026-04-14T10:00:00+08:00",
        }

    async def _get_user_rules(user_id):
        assert user_id == "user-1"
        return [state["saved_response"]]

    async def _delete_rule(user_id, stock_code):
        assert user_id == "user-1"
        return stock_code == "600519"

    monkeypatch.setattr(watch_digest.watch_digest_service, "upsert_rule", _upsert_rule)
    monkeypatch.setattr(watch_digest.watch_digest_service, "delete_rule", _delete_rule)

    upsert_resp = api_client.put(
        "/api/watch/rules/600519",
        json={
            "stock_name": "贵州茅台",
            "market": "A股",
            "schedule_type": "daily_post_market",
            "status": "active",
        },
    )

    assert upsert_resp.status_code == 200
    upsert_data = upsert_resp.json()["data"]
    state["saved_response"] = upsert_data
    assert upsert_data == {
        "stock_code": "600519",
        "stock_name": "贵州茅台",
        "market": "A股",
        "schedule_type": "daily_post_market",
        "schedule_summary": "每天盘后",
        "cron_expr": None,
        "status": "active",
        "created_at": "2026-04-14T10:00:00+08:00",
        "updated_at": "2026-04-14T10:00:00+08:00",
    }

    delete_resp = api_client.delete("/api/watch/rules/600519")
    assert delete_resp.status_code == 200
    assert delete_resp.json()["data"] == {"stock_code": "600519"}


@pytest.mark.parametrize(
    ("payload", "expected_detail"),
    [
        (
            {
                "stock_name": "贵州茅台",
                "market": "A股",
                "schedule_type": "custom",
                "status": "active",
            },
            "custom 调度必须提供 cron_expr",
        ),
        (
            {
                "stock_name": "贵州茅台",
                "market": "A股",
                "schedule_type": "daily_post_market",
                "cron_expr": "0 15 * * 1-5",
                "status": "active",
            },
            "仅 custom 调度允许提供 cron_expr",
        ),
    ],
)
def test_watch_rule_request_validation_returns_422_for_invalid_schedule_combinations(api_client, payload, expected_detail):
    response = api_client.put("/api/watch/rules/600519", json=payload)

    assert response.status_code == 422
    assert expected_detail in response.text


def test_watch_rule_upsert_maps_service_validation_errors_to_400(api_client, monkeypatch):
    async def _upsert_rule(**kwargs):
        raise ValueError("cron_expr格式无效")

    monkeypatch.setattr(watch_digest.watch_digest_service, "upsert_rule", _upsert_rule)

    response = api_client.put(
        "/api/watch/rules/600519",
        json={
            "stock_name": "贵州茅台",
            "market": "A股",
            "schedule_type": "custom",
            "cron_expr": "bad cron",
            "status": "active",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "cron_expr格式无效"
