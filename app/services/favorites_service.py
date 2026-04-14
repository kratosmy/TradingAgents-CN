"""
自选股服务
"""

import logging
from typing import List, Optional, Dict, Any, Iterable
from datetime import datetime, timezone
from bson import ObjectId

from app.core.database import get_mongo_db
from app.services.quotes_service import get_quotes_service
from app.utils.timezone import now_tz


class FavoritesService:
    """自选股服务类"""

    CANONICAL_VERSION = 1
    DEFAULT_MARKET = "A股"
    RESERVED_FAVORITE_FIELDS = {
        "stock_code",
        "symbol",
        "stock_name",
        "market",
        "exchange",
        "added_at",
        "tags",
        "notes",
        "alert_price_high",
        "alert_price_low",
    }

    logger = logging.getLogger("webapi")
    
    def __init__(self):
        self.db = None
    
    async def _get_db(self):
        """获取数据库连接"""
        if self.db is None:
            self.db = get_mongo_db()
        return self.db

    def _is_valid_object_id(self, user_id: str) -> bool:
        """
        检查是否是有效的ObjectId格式
        注意：这里只检查格式，不代表数据库中实际存储的是ObjectId类型
        为了兼容性，我们统一使用 user_favorites 集合存储自选股
        """
        # 强制返回 False，统一使用 user_favorites 集合
        return False

    def _build_user_lookup_candidates(self, user_id: str) -> List[Any]:
        candidates: List[Any] = [user_id]
        if ObjectId.is_valid(user_id):
            candidates.append(ObjectId(user_id))
        return candidates

    def _extract_stock_code(self, favorite: Optional[Dict[str, Any]]) -> Optional[str]:
        if not favorite:
            return None

        stock_code = favorite.get("stock_code") or favorite.get("symbol")
        if stock_code is None:
            return None

        normalized = str(stock_code).strip()
        return normalized or None

    def _parse_datetime(self, value: Any) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, datetime):
            if value.tzinfo is not None:
                return value.astimezone(timezone.utc).replace(tzinfo=None)
            return value
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if parsed.tzinfo is not None:
                    return parsed.astimezone(timezone.utc).replace(tzinfo=None)
                return parsed
            except ValueError:
                return None
        return None

    def _merge_tags(self, *tag_lists: Iterable[Any]) -> List[str]:
        merged: List[str] = []
        seen = set()
        for tag_list in tag_lists:
            for tag in tag_list or []:
                normalized = str(tag).strip()
                if not normalized or normalized in seen:
                    continue
                merged.append(normalized)
                seen.add(normalized)
        return merged

    def _normalize_market(self, favorite: Optional[Dict[str, Any]]) -> str:
        if not favorite:
            return self.DEFAULT_MARKET

        market = favorite.get("market")
        if market is None:
            market = favorite.get("exchange")

        normalized = str(market).strip() if market is not None else ""
        return normalized or self.DEFAULT_MARKET

    def _extract_extra_metadata(self, favorite: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not favorite:
            return {}

        return {
            key: value
            for key, value in favorite.items()
            if key not in self.RESERVED_FAVORITE_FIELDS
        }

    def _normalize_favorite(self, favorite: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        stock_code = self._extract_stock_code(favorite)
        if not stock_code:
            return None

        normalized = {
            "stock_code": stock_code,
            "stock_name": favorite.get("stock_name") or stock_code,
            "market": self._normalize_market(favorite),
            "added_at": favorite.get("added_at") or now_tz(),
            "tags": self._merge_tags(favorite.get("tags", [])),
            "notes": favorite.get("notes") or "",
            "alert_price_high": favorite.get("alert_price_high"),
            "alert_price_low": favorite.get("alert_price_low"),
        }
        normalized.update(self._extract_extra_metadata(favorite))
        return normalized

    def _merge_favorite_records(self, primary: Dict[str, Any], secondary: Dict[str, Any]) -> Dict[str, Any]:
        primary_added_at = self._parse_datetime(primary.get("added_at"))
        secondary_added_at = self._parse_datetime(secondary.get("added_at"))

        if primary_added_at and secondary_added_at:
            added_at = min(primary_added_at, secondary_added_at)
        else:
            added_at = primary.get("added_at") or secondary.get("added_at") or now_tz()

        merged = {
            "stock_code": primary.get("stock_code") or secondary.get("stock_code"),
            "stock_name": primary.get("stock_name") or secondary.get("stock_name"),
            "market": primary.get("market") or secondary.get("market") or self.DEFAULT_MARKET,
            "added_at": added_at,
            "tags": self._merge_tags(primary.get("tags", []), secondary.get("tags", [])),
            "notes": primary.get("notes") or secondary.get("notes") or "",
            "alert_price_high": (
                primary.get("alert_price_high")
                if primary.get("alert_price_high") is not None
                else secondary.get("alert_price_high")
            ),
            "alert_price_low": (
                primary.get("alert_price_low")
                if primary.get("alert_price_low") is not None
                else secondary.get("alert_price_low")
            ),
        }
        merged.update(self._extract_extra_metadata(secondary))
        merged.update(self._extract_extra_metadata(primary))
        return merged

    def _canonical_contains_legacy_snapshot(
        self,
        canonical_favorites: List[Dict[str, Any]],
        legacy_favorites: List[Dict[str, Any]],
    ) -> bool:
        canonical_by_code: Dict[str, Dict[str, Any]] = {}
        for source in canonical_favorites:
            normalized = self._normalize_favorite(source)
            if normalized:
                canonical_by_code[normalized["stock_code"]] = normalized

        legacy_by_code: Dict[str, Dict[str, Any]] = {}
        for source in legacy_favorites:
            normalized = self._normalize_favorite(source)
            if normalized:
                legacy_by_code[normalized["stock_code"]] = normalized

        if not legacy_by_code:
            return False

        for stock_code, legacy_item in legacy_by_code.items():
            canonical_item = canonical_by_code.get(stock_code)
            if canonical_item is None:
                return False

            expected = self._merge_favorite_records(canonical_item, legacy_item)
            if canonical_item != expected:
                return False

        return True

    def _canonical_doc_finalized_after_legacy_merge(self, canonical_doc: Optional[Dict[str, Any]]) -> bool:
        if canonical_doc is None:
            return False

        if canonical_doc.get("canonical_version") != self.CANONICAL_VERSION:
            return False

        return canonical_doc.get("legacy_migrated_at") is not None

    def _canonical_doc_migration_checked(self, canonical_doc: Optional[Dict[str, Any]]) -> bool:
        if canonical_doc is None:
            return False

        return canonical_doc.get("legacy_migration_checked_at") is not None

    async def _get_legacy_favorites(self, db, user_id: str) -> List[Dict[str, Any]]:
        for candidate in self._build_user_lookup_candidates(user_id):
            user = await db.users.find_one({"_id": candidate})
            if user:
                return (user or {}).get("favorite_stocks", [])
        return []

    def _build_canonical_document(
        self,
        *,
        user_id: str,
        favorites: List[Dict[str, Any]],
        existing_doc: Optional[Dict[str, Any]] = None,
        migration_complete: Optional[bool] = None,
        migration_checked_at: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        existing_doc = existing_doc or {}
        now = now_tz()
        payload = {
            "favorites": favorites,
            "updated_at": now,
        }

        if existing_doc.get("created_at"):
            payload["created_at"] = existing_doc["created_at"]
        else:
            payload["created_at"] = now

        if migration_checked_at is None:
            migration_checked_at = existing_doc.get("legacy_migration_checked_at")
        if migration_checked_at is not None:
            payload["legacy_migration_checked_at"] = migration_checked_at

        if migration_complete is None:
            migration_complete = bool(
                existing_doc.get("canonical_version") == self.CANONICAL_VERSION
                or existing_doc.get("legacy_migrated_at")
            )

        if migration_complete:
            payload["canonical_version"] = self.CANONICAL_VERSION
            if existing_doc.get("legacy_migrated_at"):
                payload["legacy_migrated_at"] = existing_doc["legacy_migrated_at"]
            else:
                payload["legacy_migrated_at"] = now
            if existing_doc.get("legacy_migration_completed_with_favorites"):
                payload["legacy_migration_completed_with_favorites"] = existing_doc[
                    "legacy_migration_completed_with_favorites"
                ]
            else:
                payload["legacy_migration_completed_with_favorites"] = bool(favorites)
            if migration_checked_at is None:
                payload["legacy_migration_checked_at"] = now

        return {"user_id": user_id, **payload}

    def _build_canonical_upsert_update(self, document: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        set_payload = dict(document)
        set_on_insert: Dict[str, Any] = {}

        for immutable_field in ("user_id", "created_at"):
            if immutable_field in set_payload:
                set_on_insert[immutable_field] = set_payload.pop(immutable_field)

        update: Dict[str, Dict[str, Any]] = {"$set": set_payload}
        if set_on_insert:
            update["$setOnInsert"] = set_on_insert
        return update

    async def _ensure_canonical_favorites(self, user_id: str) -> List[Dict[str, Any]]:
        db = await self._get_db()
        canonical_doc = await db.user_favorites.find_one({"user_id": user_id})
        canonical_favorites = (canonical_doc or {}).get("favorites", [])
        legacy_favorites = await self._get_legacy_favorites(db, user_id)
        legacy_has_visible_entries = any(
            self._normalize_favorite(source) is not None for source in legacy_favorites
        )
        migration_finalized = self._canonical_doc_finalized_after_legacy_merge(canonical_doc)
        retry_window_open = not self._canonical_doc_migration_checked(canonical_doc)

        if migration_finalized and not legacy_has_visible_entries:
            return canonical_favorites

        if migration_finalized and legacy_has_visible_entries:
            if not canonical_favorites:
                if canonical_doc.get("legacy_migration_completed_with_favorites"):
                    return canonical_favorites
                migration_finalized = False
            else:
                if self._canonical_contains_legacy_snapshot(canonical_favorites, legacy_favorites):
                    return canonical_favorites

        if (
            canonical_doc is not None
            and canonical_favorites
            and not legacy_has_visible_entries
            and not retry_window_open
        ):
            return canonical_favorites

        merged: Dict[str, Dict[str, Any]] = {}
        for source in canonical_favorites:
            normalized = self._normalize_favorite(source)
            if not normalized:
                continue
            merged[normalized["stock_code"]] = normalized

        for source in legacy_favorites:
            normalized = self._normalize_favorite(source)
            if not normalized:
                continue
            existing = merged.get(normalized["stock_code"])
            if existing:
                merged[normalized["stock_code"]] = self._merge_favorite_records(existing, normalized)
            else:
                merged[normalized["stock_code"]] = normalized

        merged_favorites = sorted(
            merged.values(),
            key=lambda item: self._parse_datetime(item.get("added_at")) or now_tz().replace(tzinfo=None),
        )
        now = now_tz()
        merged_doc = self._build_canonical_document(
            user_id=user_id,
            favorites=merged_favorites,
            existing_doc=canonical_doc,
            migration_complete=legacy_has_visible_entries,
            migration_checked_at=now,
        )
        await db.user_favorites.update_one(
            {"user_id": user_id},
            self._build_canonical_upsert_update(merged_doc),
            upsert=True,
        )
        return merged_favorites

    def _format_favorite(self, favorite: Dict[str, Any]) -> Dict[str, Any]:
        """格式化收藏条目（仅基础信息，不包含实时行情）。
        行情将在 get_user_favorites 中批量富集。
        """
        stock_code = self._extract_stock_code(favorite)
        added_at = favorite.get("added_at")
        if isinstance(added_at, datetime):
            added_at = added_at.isoformat()
        return {
            "stock_code": stock_code,
            "stock_name": favorite.get("stock_name") or stock_code,
            "market": self._normalize_market(favorite),
            "added_at": added_at,
            "tags": favorite.get("tags", []),
            "notes": favorite.get("notes", ""),
            "alert_price_high": favorite.get("alert_price_high"),
            "alert_price_low": favorite.get("alert_price_low"),
            # 行情占位，稍后填充
            "current_price": None,
            "change_percent": None,
            "volume": None,
        }

    async def get_user_favorites(self, user_id: str) -> List[Dict[str, Any]]:
        """获取用户自选股列表，并批量拉取实时行情进行富集（兼容字符串ID与ObjectId）。"""
        db = await self._get_db()

        favorites = await self._ensure_canonical_favorites(user_id)

        # 先格式化基础字段
        items = [self._format_favorite(fav) for fav in favorites]

        # 批量获取股票基础信息（板块等）
        codes = [it.get("stock_code") for it in items if it.get("stock_code")]
        if codes:
            try:
                # 🔥 获取数据源优先级配置
                from app.core.unified_config import UnifiedConfigManager
                config = UnifiedConfigManager()
                data_source_configs = await config.get_data_source_configs_async()

                # 提取启用的数据源，按优先级排序
                enabled_sources = [
                    ds.type.lower() for ds in data_source_configs
                    if ds.enabled and ds.type.lower() in ['tushare', 'akshare', 'baostock']
                ]

                if not enabled_sources:
                    enabled_sources = ['tushare', 'akshare', 'baostock']

                preferred_source = enabled_sources[0] if enabled_sources else 'tushare'

                # 从 stock_basic_info 获取板块信息（只查询优先级最高的数据源）
                basic_info_coll = db["stock_basic_info"]
                cursor = basic_info_coll.find(
                    {"code": {"$in": codes}, "source": preferred_source},  # 🔥 添加数据源筛选
                    {"code": 1, "sse": 1, "market": 1, "_id": 0}
                )
                basic_docs = await cursor.to_list(length=None)
                basic_map = {str(d.get("code")).zfill(6): d for d in (basic_docs or [])}

                for it in items:
                    code = it.get("stock_code")
                    basic = basic_map.get(code)
                    if basic:
                        # market 字段表示板块（主板、创业板、科创板等）
                        it["board"] = basic.get("market", "-")
                        # sse 字段表示交易所（上海证券交易所、深圳证券交易所等）
                        it["exchange"] = basic.get("sse", "-")
                    else:
                        it["board"] = "-"
                        it["exchange"] = "-"
            except Exception as e:
                # 查询失败时设置默认值
                for it in items:
                    it["board"] = "-"
                    it["exchange"] = "-"

        # 批量获取行情（优先使用入库的 market_quotes，30秒更新）
        if codes:
            try:
                coll = db["market_quotes"]
                cursor = coll.find({"code": {"$in": codes}}, {"code": 1, "close": 1, "pct_chg": 1, "amount": 1})
                docs = await cursor.to_list(length=None)
                quotes_map = {str(d.get("code")).zfill(6): d for d in (docs or [])}
                for it in items:
                    code = it.get("stock_code")
                    q = quotes_map.get(code)
                    if q:
                        it["current_price"] = q.get("close")
                        it["change_percent"] = q.get("pct_chg")
                # 兜底：对未命中的代码使用在线源补齐（可选）
                missing = [c for c in codes if c not in quotes_map]
                if missing and quotes_map:
                    try:
                        quotes_online = await get_quotes_service().get_quotes(missing)
                        for it in items:
                            code = it.get("stock_code")
                            if it.get("current_price") is None:
                                q2 = quotes_online.get(code, {}) if quotes_online else {}
                                it["current_price"] = q2.get("close")
                                it["change_percent"] = q2.get("pct_chg")
                    except Exception:
                        pass
            except Exception:
                # 查询失败时保持占位 None，避免影响基础功能
                pass

        return items

    async def get_favorite(self, user_id: str, stock_code: str) -> Optional[Dict[str, Any]]:
        """获取单个规范化自选股条目（不做行情富集）。"""
        db = await self._get_db()
        canonical_favorites = await self._ensure_canonical_favorites(user_id)
        normalized_stock_code = self._extract_stock_code({"stock_code": stock_code})
        if not normalized_stock_code:
            return None

        canonical_doc = await db.user_favorites.find_one({"user_id": user_id})
        source_favorites = (
            (canonical_doc or {}).get("favorites", [])
            if canonical_doc is not None
            else canonical_favorites
        )

        for favorite in source_favorites:
            normalized = self._normalize_favorite(favorite)
            if normalized and normalized["stock_code"] == normalized_stock_code:
                return normalized

        for favorite in canonical_favorites:
            normalized = self._normalize_favorite(favorite)
            if normalized and normalized["stock_code"] == normalized_stock_code:
                return normalized

        return None

    async def add_favorite(
        self,
        user_id: str,
        stock_code: str,
        stock_name: str,
        market: str = "A股",
        tags: List[str] = None,
        notes: str = "",
        alert_price_high: Optional[float] = None,
        alert_price_low: Optional[float] = None
    ) -> bool:
        """添加股票到自选股（兼容字符串ID与ObjectId）"""
        try:
            self.logger.info("🔧 [add_favorite] 开始添加自选股: user_id=%s, stock_code=%s", user_id, stock_code)

            db = await self._get_db()
            canonical_favorites = await self._ensure_canonical_favorites(user_id)
            canonical_doc = await db.user_favorites.find_one({"user_id": user_id})
            normalized_stock_code = self._extract_stock_code({"stock_code": stock_code})

            favorite_stock = self._normalize_favorite(
                {
                    "stock_code": normalized_stock_code,
                    "stock_name": stock_name,
                    "market": market,
                    "added_at": now_tz(),
                    "tags": tags or [],
                    "notes": notes,
                    "alert_price_high": alert_price_high,
                    "alert_price_low": alert_price_low,
                }
            )

            stored_favorites = [self._normalize_favorite(item) for item in canonical_favorites]
            stored_favorites = [item for item in stored_favorites if item]
            stored_favorites.append(favorite_stock)

            canonical_doc = self._build_canonical_document(
                user_id=user_id,
                favorites=stored_favorites,
                existing_doc=canonical_doc,
            )

            await db.user_favorites.update_one(
                {"user_id": user_id},
                self._build_canonical_upsert_update(canonical_doc),
                upsert=True,
            )
            return True
        except Exception as exc:
            self.logger.error("❌ [add_favorite] 添加自选股异常: %s: %s", type(exc).__name__, exc, exc_info=True)
            raise

    async def remove_favorite(self, user_id: str, stock_code: str) -> bool:
        """从自选股中移除股票（兼容字符串ID与ObjectId）"""
        db = await self._get_db()
        await self._ensure_canonical_favorites(user_id)
        normalized_stock_code = self._extract_stock_code({"stock_code": stock_code})

        canonical_doc = await db.user_favorites.find_one({"user_id": user_id})
        canonical_favorites = [
            self._normalize_favorite(item)
            for item in (canonical_doc or {}).get("favorites", [])
        ]
        canonical_favorites = [item for item in canonical_favorites if item]

        remaining_favorites = [
            item for item in canonical_favorites if item["stock_code"] != normalized_stock_code
        ]
        if len(remaining_favorites) == len(canonical_favorites):
            return False

        updated_doc = self._build_canonical_document(
            user_id=user_id,
            favorites=remaining_favorites,
            existing_doc=canonical_doc,
            migration_complete=True,
        )
        await db.user_favorites.update_one(
            {"user_id": user_id},
            self._build_canonical_upsert_update(updated_doc),
            upsert=True,
        )
        return True

    async def update_favorite(
        self,
        user_id: str,
        stock_code: str,
        tags: Optional[List[str]] = None,
        notes: Optional[str] = None,
        alert_price_high: Optional[float] = None,
        alert_price_low: Optional[float] = None
    ) -> bool:
        """更新自选股信息（兼容字符串ID与ObjectId）"""
        db = await self._get_db()
        await self._ensure_canonical_favorites(user_id)
        normalized_stock_code = self._extract_stock_code({"stock_code": stock_code})

        if all(value is None for value in [tags, notes, alert_price_high, alert_price_low]):
            return True

        canonical_doc = await db.user_favorites.find_one({"user_id": user_id})
        canonical_favorites = [
            self._normalize_favorite(item)
            for item in (canonical_doc or {}).get("favorites", [])
        ]
        canonical_favorites = [item for item in canonical_favorites if item]

        updated = False
        updated_favorites: List[Dict[str, Any]] = []
        for favorite in canonical_favorites:
            if favorite["stock_code"] != normalized_stock_code:
                updated_favorites.append(favorite)
                continue

            patched = dict(favorite)
            if tags is not None:
                patched["tags"] = self._merge_tags(tags)
            if notes is not None:
                patched["notes"] = notes
            if alert_price_high is not None:
                patched["alert_price_high"] = alert_price_high
            if alert_price_low is not None:
                patched["alert_price_low"] = alert_price_low
            updated_favorites.append(patched)
            updated = True

        if not updated:
            return False

        updated_doc = self._build_canonical_document(
            user_id=user_id,
            favorites=updated_favorites,
            existing_doc=canonical_doc,
        )
        await db.user_favorites.update_one(
            {"user_id": user_id},
            self._build_canonical_upsert_update(updated_doc),
            upsert=True,
        )
        return True

    async def is_favorite(self, user_id: str, stock_code: str) -> bool:
        """检查股票是否在自选股中（兼容字符串ID与ObjectId）"""
        try:
            self.logger.info("🔧 [is_favorite] 检查自选股: user_id=%s, stock_code=%s", user_id, stock_code)

            db = await self._get_db()
            await self._ensure_canonical_favorites(user_id)
            normalized_stock_code = self._extract_stock_code({"stock_code": stock_code})

            doc = await db.user_favorites.find_one(
                {
                    "user_id": user_id,
                    "favorites.stock_code": normalized_stock_code
                }
            )
            result = doc is not None
            self.logger.info("🔧 [is_favorite] 查询结果: %s", result)
            return result
        except Exception as exc:
            self.logger.error("❌ [is_favorite] 检查自选股异常: %s: %s", type(exc).__name__, exc, exc_info=True)
            raise

    async def get_user_tags(self, user_id: str) -> List[str]:
        """获取用户使用的所有标签（兼容字符串ID与ObjectId）"""
        db = await self._get_db()
        await self._ensure_canonical_favorites(user_id)

        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$unwind": "$favorites"},
            {"$unwind": "$favorites.tags"},
            {"$group": {"_id": "$favorites.tags"}},
            {"$sort": {"_id": 1}}
        ]
        result = await db.user_favorites.aggregate(pipeline).to_list(None)

        return [item["_id"] for item in result if item.get("_id")]

    def _get_mock_price(self, stock_code: str) -> float:
        """获取模拟股价"""
        # 基于股票代码生成模拟价格
        base_price = hash(stock_code) % 100 + 10
        return round(base_price + (hash(stock_code) % 1000) / 100, 2)
    
    def _get_mock_change(self, stock_code: str) -> float:
        """获取模拟涨跌幅"""
        # 基于股票代码生成模拟涨跌幅
        change = (hash(stock_code) % 2000 - 1000) / 100
        return round(change, 2)
    
    def _get_mock_volume(self, stock_code: str) -> int:
        """获取模拟成交量"""
        # 基于股票代码生成模拟成交量
        return (hash(stock_code) % 10000 + 1000) * 100


# 创建全局实例
favorites_service = FavoritesService()
