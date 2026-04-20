from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import auth_db, watch_digest


def _build_user():
    return SimpleNamespace(
        id="user-1",
        username="mini-user",
        email="mini-user@example.com",
        is_admin=False,
        is_active=True,
        preferences=None,
    )


def test_login_success_envelope_and_digest_token_handoff(monkeypatch):
    app = FastAPI()
    app.include_router(auth_db.router, prefix="/api/auth")
    app.include_router(watch_digest.router)

    user = _build_user()

    async def _authenticate_user(username, password):
        if username == "mini-user" and password == "correct-password":
            return user
        return None

    async def _get_user_by_username(username):
        if username == "mini-user":
            return user
        return None

    async def _log_operation(**_kwargs):
        return None

    async def _list_digest_cards(user_id):
        assert user_id == "user-1"
        return [
            {
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "market": "A股",
                "board": "主板",
                "exchange": "SSE",
                "current_price": 1688.50,
                "change_percent": "+1.82%",
                "digest_status": "ready",
                "summary": "digest ok",
                "risk_level": "低风险",
                "rule_status": "active",
                "task_status": "completed",
                "task_id": "task-1",
                "updated_at": "2026-04-20T16:00:00+08:00",
                "task_updated_at": "2026-04-20T16:00:00+08:00",
            }
        ]

    monkeypatch.setattr(auth_db.user_service, "authenticate_user", _authenticate_user)
    monkeypatch.setattr(auth_db.user_service, "get_user_by_username", _get_user_by_username)
    monkeypatch.setattr(auth_db, "log_operation", _log_operation)
    monkeypatch.setattr(
        auth_db.AuthService,
        "create_access_token",
        lambda sub, expires_delta=None: "refresh-token-1" if expires_delta else "access-token-1",
    )
    monkeypatch.setattr(
        auth_db.AuthService,
        "verify_token",
        lambda token: SimpleNamespace(sub="mini-user") if token == "access-token-1" else None,
    )
    monkeypatch.setattr(watch_digest.watch_digest_service, "list_digest_cards", _list_digest_cards)

    with TestClient(app) as client:
        login_response = client.post(
            "/api/auth/login",
            json={"username": "mini-user", "password": "correct-password"},
        )

        assert login_response.status_code == 200
        login_body = login_response.json()
        assert login_body["success"] is True
        assert login_body["data"]["access_token"] == "access-token-1"
        assert login_body["data"]["refresh_token"] == "refresh-token-1"
        assert login_body["data"]["expires_in"] == 3600
        assert login_body["data"]["user"] == {
            "id": "user-1",
            "username": "mini-user",
            "email": "mini-user@example.com",
            "name": "mini-user",
            "is_admin": False,
        }

        digests_response = client.get(
            "/api/watch/digests",
            headers={"Authorization": f"Bearer {login_body['data']['access_token']}"},
        )

        assert digests_response.status_code == 200
        assert digests_response.json()["data"][0]["stock_code"] == "600519"


def test_login_failure_modes_remain_distinct_for_mini_client(monkeypatch):
    app = FastAPI()
    app.include_router(auth_db.router, prefix="/api/auth")

    user = _build_user()

    async def _authenticate_user(username, password):
        if username == "mini-user" and password == "correct-password":
            return user
        return None

    async def _log_operation(**_kwargs):
        return None

    monkeypatch.setattr(auth_db.user_service, "authenticate_user", _authenticate_user)
    monkeypatch.setattr(auth_db, "log_operation", _log_operation)

    with TestClient(app) as client:
        blank_response = client.post(
            "/api/auth/login",
            json={"username": "", "password": ""},
        )
        invalid_response = client.post(
            "/api/auth/login",
            json={"username": "mini-user", "password": "bad-password"},
        )
        missing_username_response = client.post(
            "/api/auth/login",
            json={"password": "correct-password"},
        )
        mistyped_field_response = client.post(
            "/api/auth/login",
            json={"user_name": "mini-user", "password": "correct-password"},
        )

        assert blank_response.status_code == 400
        assert blank_response.json()["detail"] == "用户名和密码不能为空"

        assert invalid_response.status_code == 401
        assert invalid_response.json()["detail"] == "用户名或密码错误"

        assert missing_username_response.status_code == 422
        missing_detail = missing_username_response.json()["detail"]
        assert missing_detail[0]["loc"] == ["body", "username"]

        assert mistyped_field_response.status_code == 422
        mistyped_detail = mistyped_field_response.json()["detail"]
        assert mistyped_detail[0]["loc"] == ["body", "username"]
