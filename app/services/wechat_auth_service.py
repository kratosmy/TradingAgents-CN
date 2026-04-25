import hashlib
import os
import secrets
from typing import Any, Dict, Optional

import httpx
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.models.user import User, UserPreferences
from app.services.auth_service import AuthService
from app.services.user_service import UserService, user_service
from app.utils.timezone import now_tz


WECHAT_PROVIDER = "wechat_miniprogram"
DEFAULT_CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session"


class WechatAuthError(Exception):
    """Base error for WeChat Mini Program auth failures."""


class WechatCredentialError(WechatAuthError):
    """Raised when required WeChat app credentials are not configured."""


class WechatCodeExchangeError(WechatAuthError):
    """Raised when WeChat rejects or cannot exchange a login code."""


class WechatIdentityConflictError(WechatAuthError):
    """Raised when an external WeChat identity already belongs to another user."""


class WechatAuthService:
    def __init__(self):
        self.users_collection = user_service.users_collection
        self.identities_collection = user_service.db.user_external_identities

    async def login_with_code(self, code: str, profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        session = await self.exchange_code(code)
        identity = self._find_identity(session["openid"])

        if identity:
            user = await user_service.get_user_by_id(str(identity["user_id"]))
            if not user:
                raise WechatAuthError("绑定的内部账号不存在")
            self._touch_identity(identity["_id"], profile)
        else:
            user = await self._create_user_for_identity(session, profile)
            identity = self._upsert_identity(str(user.id), session, profile)

        return self._build_login_response(user, identity)

    async def bind_with_code(
        self,
        user_id: str,
        code: str,
        profile: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        session = await self.exchange_code(code)
        identity = self._find_identity(session["openid"])

        if identity and str(identity.get("user_id")) != str(user_id):
            raise WechatIdentityConflictError("该微信身份已绑定其他账号")

        saved = self._upsert_identity(user_id, session, profile)
        return self._serialize_identity(saved, bound=True)

    async def get_bind_status(self, user_id: str) -> Dict[str, Any]:
        identity = self.identities_collection.find_one(
            {
                "provider": WECHAT_PROVIDER,
                "user_id": str(user_id),
            }
        )
        if not identity:
            return {"bound": False, "provider": WECHAT_PROVIDER}
        return self._serialize_identity(identity, bound=True)

    async def unbind_user(self, user_id: str) -> bool:
        result = self.identities_collection.delete_one(
            {
                "provider": WECHAT_PROVIDER,
                "user_id": str(user_id),
            }
        )
        return result.deleted_count > 0

    async def exchange_code(self, code: str) -> Dict[str, str]:
        normalized_code = str(code or "").strip()
        if not normalized_code:
            raise WechatCodeExchangeError("微信登录 code 不能为空")

        app_id = self._get_env_value("WECHAT_MINIPROGRAM_APP_ID")
        app_secret = self._get_env_value("WECHAT_MINIPROGRAM_APP_SECRET")
        if not app_id or not app_secret:
            raise WechatCredentialError("WeChat Mini Program credentials are not configured")

        code2session_url = os.getenv("WECHAT_MINIPROGRAM_CODE2SESSION_URL", DEFAULT_CODE2SESSION_URL)
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                code2session_url,
                params={
                    "appid": app_id,
                    "secret": app_secret,
                    "js_code": normalized_code,
                    "grant_type": "authorization_code",
                },
            )
            response.raise_for_status()
            payload = response.json()

        if payload.get("errcode"):
            raise WechatCodeExchangeError(payload.get("errmsg") or "微信登录 code 兑换失败")

        openid = str(payload.get("openid") or "").strip()
        if not openid:
            raise WechatCodeExchangeError("微信登录响应缺少 openid")

        return {
            "openid": openid,
            "unionid": str(payload.get("unionid") or "").strip(),
            "session_key": str(payload.get("session_key") or "").strip(),
        }

    def _find_identity(self, openid: str) -> Optional[Dict[str, Any]]:
        return self.identities_collection.find_one(
            {
                "provider": WECHAT_PROVIDER,
                "openid": openid,
            }
        )

    async def _create_user_for_identity(
        self,
        session: Dict[str, str],
        profile: Optional[Dict[str, Any]] = None,
    ) -> User:
        openid = session["openid"]
        digest = hashlib.sha256(openid.encode("utf-8")).hexdigest()[:16]
        username = f"wx_{digest}"
        email = f"{username}@wechat.local"
        now = now_tz()
        profile = profile or {}

        user_doc = {
            "username": username,
            "email": email,
            "hashed_password": UserService.hash_password(secrets.token_urlsafe(32)),
            "is_active": True,
            "is_verified": True,
            "is_admin": False,
            "created_at": now,
            "updated_at": now,
            "last_login": now,
            "preferences": UserPreferences().model_dump(),
            "daily_quota": 1000,
            "concurrent_limit": 3,
            "total_analyses": 0,
            "successful_analyses": 0,
            "failed_analyses": 0,
            "favorite_stocks": [],
            "external_profile": self._sanitize_profile(profile),
        }

        try:
            result = self.users_collection.insert_one(user_doc)
            user_doc["_id"] = result.inserted_id
        except DuplicateKeyError as exc:
            existing = self.users_collection.find_one({"username": username})
            if not existing:
                raise WechatAuthError("创建微信内部账号失败") from exc
            user_doc = existing

        return User(**user_doc)

    def _upsert_identity(
        self,
        user_id: str,
        session: Dict[str, str],
        profile: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        now = now_tz()
        selector = {
            "provider": WECHAT_PROVIDER,
            "openid": session["openid"],
        }
        update = {
            "$set": {
                "provider": WECHAT_PROVIDER,
                "openid": session["openid"],
                "unionid": session.get("unionid") or None,
                "user_id": str(user_id),
                "profile": self._sanitize_profile(profile or {}),
                "updated_at": now,
                "last_login_at": now,
            },
            "$setOnInsert": {
                "created_at": now,
            },
        }
        self.identities_collection.update_one(selector, update, upsert=True)
        return self.identities_collection.find_one(selector) or {
            **selector,
            "user_id": str(user_id),
            "unionid": session.get("unionid") or None,
            "profile": self._sanitize_profile(profile or {}),
            "updated_at": now,
            "created_at": now,
        }

    def _touch_identity(self, identity_id: ObjectId, profile: Optional[Dict[str, Any]] = None) -> None:
        update: Dict[str, Any] = {"last_login_at": now_tz(), "updated_at": now_tz()}
        if profile:
            update["profile"] = self._sanitize_profile(profile)
        self.identities_collection.update_one({"_id": identity_id}, {"$set": update})

    def _build_login_response(self, user: User, identity: Dict[str, Any]) -> Dict[str, Any]:
        access_token = AuthService.create_access_token(sub=user.username)
        refresh_token = AuthService.create_access_token(sub=user.username, expires_delta=60 * 60 * 24 * 7)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": 60 * 60,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
                "name": user.username,
                "is_admin": user.is_admin,
            },
            "wechat_identity": self._serialize_identity(identity, bound=True),
        }

    def _serialize_identity(self, identity: Dict[str, Any], bound: bool) -> Dict[str, Any]:
        return {
            "bound": bound,
            "provider": WECHAT_PROVIDER,
            "openid_masked": self._mask_openid(identity.get("openid")),
            "unionid_masked": self._mask_openid(identity.get("unionid")),
            "user_id": str(identity.get("user_id")) if identity.get("user_id") else None,
            "updated_at": self._serialize_datetime(identity.get("updated_at")),
            "last_login_at": self._serialize_datetime(identity.get("last_login_at")),
        }

    def _sanitize_profile(self, profile: Dict[str, Any]) -> Dict[str, str]:
        nickname = str(profile.get("nickname") or profile.get("nickName") or "").strip()
        avatar_url = str(profile.get("avatar_url") or profile.get("avatarUrl") or "").strip()

        return {
            "nickname": nickname[:80],
            "avatar_url": avatar_url[:512],
        }

    def _mask_openid(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        value = str(value)
        if len(value) <= 8:
            return f"{value[:2]}***"
        return f"{value[:4]}***{value[-4:]}"

    def _serialize_datetime(self, value: Any) -> Optional[str]:
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return None

    def _get_env_value(self, key: str) -> str:
        value = str(os.getenv(key, "")).strip()
        if not value or value.startswith("PLACEHOLDER_") or "your-" in value:
            return ""
        return value


wechat_auth_service = WechatAuthService()
