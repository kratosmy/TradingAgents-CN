import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import auth_db
from app.services.wechat_auth_service import WechatCredentialError, WechatIdentityConflictError, wechat_auth_service


@pytest.fixture
def auth_client(monkeypatch):
    app = FastAPI()
    app.include_router(auth_db.router, prefix="/api/auth")

    async def _current_user():
        return {
            "id": "stable-user-1",
            "username": "web-user",
            "email": "web-user@example.com",
            "is_admin": False,
        }

    app.dependency_overrides[auth_db.get_current_user] = _current_user

    with TestClient(app) as client:
        yield client


def test_wechat_login_surfaces_stable_internal_user_contract(auth_client, monkeypatch):
    calls = {}

    async def _login_with_code(code, profile):
        calls["login"] = {"code": code, "profile": profile}
        return {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "expires_in": 3600,
            "token_type": "bearer",
            "user": {
                "id": "internal-user-1",
                "username": "wx_user",
                "email": "wx_user@wechat.local",
                "name": "wx_user",
                "is_admin": False,
            },
            "wechat_identity": {
                "bound": True,
                "provider": "wechat_miniprogram",
                "openid_masked": "open***1234",
                "user_id": "internal-user-1",
            },
        }

    monkeypatch.setattr(auth_db.wechat_auth_service, "login_with_code", _login_with_code)

    response = auth_client.post(
        "/api/auth/wechat/login",
        json={
            "code": "wx-code",
            "nickname": "Mini 用户",
            "avatar_url": "https://example.com/avatar.png",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["user"]["id"] == "internal-user-1"
    assert body["data"]["wechat_identity"]["provider"] == "wechat_miniprogram"
    assert calls["login"] == {
        "code": "wx-code",
        "profile": {
            "nickname": "Mini 用户",
            "avatar_url": "https://example.com/avatar.png",
        },
    }


def test_wechat_bind_uses_current_internal_user_id(auth_client, monkeypatch):
    calls = {}

    async def _bind_with_code(user_id, code, profile):
        calls["bind"] = {"user_id": user_id, "code": code, "profile": profile}
        return {
            "bound": True,
            "provider": "wechat_miniprogram",
            "openid_masked": "open***5678",
            "user_id": user_id,
        }

    monkeypatch.setattr(auth_db.wechat_auth_service, "bind_with_code", _bind_with_code)

    response = auth_client.post(
        "/api/auth/wechat/bind",
        json={"code": "bind-code", "nickname": "Bound Mini"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["user_id"] == "stable-user-1"
    assert calls["bind"] == {
        "user_id": "stable-user-1",
        "code": "bind-code",
        "profile": {
            "nickname": "Bound Mini",
            "avatar_url": None,
        },
    }


def test_wechat_bind_conflict_maps_to_409(auth_client, monkeypatch):
    async def _bind_with_code(*args, **kwargs):
        raise WechatIdentityConflictError("该微信身份已绑定其他账号")

    monkeypatch.setattr(auth_db.wechat_auth_service, "bind_with_code", _bind_with_code)

    response = auth_client.post("/api/auth/wechat/bind", json={"code": "already-bound"})

    assert response.status_code == 409
    assert response.json()["detail"] == "该微信身份已绑定其他账号"


def test_wechat_bind_routes_require_authenticated_internal_user():
    app = FastAPI()
    app.include_router(auth_db.router, prefix="/api/auth")

    client = TestClient(app)

    bind_response = client.post("/api/auth/wechat/bind", json={"code": "bind-code"})
    status_response = client.get("/api/auth/wechat/bind-status")
    unbind_response = client.delete("/api/auth/wechat/bind")

    assert bind_response.status_code == 401
    assert status_response.status_code == 401
    assert unbind_response.status_code == 401


def test_wechat_bind_status_and_unbind_are_caller_scoped(auth_client, monkeypatch):
    calls = {}

    async def _get_bind_status(user_id):
        calls["status_user_id"] = user_id
        return {
            "bound": True,
            "provider": "wechat_miniprogram",
            "openid_masked": "open***abcd",
            "user_id": user_id,
        }

    async def _unbind_user(user_id):
        calls["unbind_user_id"] = user_id
        return True

    monkeypatch.setattr(auth_db.wechat_auth_service, "get_bind_status", _get_bind_status)
    monkeypatch.setattr(auth_db.wechat_auth_service, "unbind_user", _unbind_user)

    status_response = auth_client.get("/api/auth/wechat/bind-status")
    unbind_response = auth_client.delete("/api/auth/wechat/bind")

    assert status_response.status_code == 200
    assert status_response.json()["data"]["user_id"] == "stable-user-1"
    assert unbind_response.status_code == 200
    assert unbind_response.json()["data"] == {
        "bound": False,
        "removed": True,
        "provider": "wechat_miniprogram",
    }
    assert calls == {
        "status_user_id": "stable-user-1",
        "unbind_user_id": "stable-user-1",
    }


@pytest.mark.asyncio
async def test_wechat_code_exchange_rejects_placeholder_credentials(monkeypatch):
    monkeypatch.setenv("WECHAT_MINIPROGRAM_APP_ID", "PLACEHOLDER_APP_ID")
    monkeypatch.setenv("WECHAT_MINIPROGRAM_APP_SECRET", "PLACEHOLDER_APP_SECRET")

    with pytest.raises(WechatCredentialError, match="credentials are not configured"):
        await wechat_auth_service.exchange_code("wx-code")
