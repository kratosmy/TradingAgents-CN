import asyncio
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime

import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import favorites as favorites_router
from app.services.favorites_service import FavoritesService, favorites_service
from app.services.watch_digest_service import watch_digest_service


def _clone(value):
    return deepcopy(value)


def _matches(document, query):
    for key, expected in query.items():
        if key == "_id":
            if document.get("_id") != expected:
                return False
            continue

        if key == "user_id":
            if document.get("user_id") != expected:
                return False
            continue

        if key == "favorites.stock_code":
            favorites = document.get("favorites", [])
            if not any(item.get("stock_code") == expected for item in favorites):
                return False
            continue

        if key == "favorite_stocks.stock_code":
            favorites = document.get("favorite_stocks", [])
            if not any(item.get("stock_code") == expected for item in favorites):
                return False
            continue

        value = document.get(key)
        if isinstance(expected, dict) and "$in" in expected:
            if value not in expected["$in"]:
                return False
            continue

        if value != expected:
            return False

    return True


@dataclass
class _UpdateResult:
    matched_count: int
    modified_count: int
    upserted_id: str | None = None


class _FakeCursor:
    def __init__(self, docs):
        self._docs = _clone(docs)

    def sort(self, field, direction):
        reverse = direction == -1
        self._docs.sort(key=lambda item: item.get(field), reverse=reverse)
        return self

    async def to_list(self, length=None):
        return _clone(self._docs if length is None else self._docs[:length])


class _FakeLookupCollection:
    def __init__(self, docs=None):
        self.docs = _clone(docs or [])

    async def find_one(self, query, projection=None):
        for document in self.docs:
            if _matches(document, query):
                return _clone(document)
        return None

    def find(self, query, projection=None):
        return _FakeCursor([document for document in self.docs if _matches(document, query)])

    def aggregate(self, pipeline):
        match_step = next((step for step in pipeline if "$match" in step), {})
        match_query = match_step.get("$match", {})
        matched = [document for document in self.docs if _matches(document, match_query)]

        tags = sorted(
            {
                tag
                for document in matched
                for favorite in document.get("favorite_stocks", [])
                for tag in favorite.get("tags", [])
                if tag
            }
        )
        return _FakeCursor([{"_id": tag} for tag in tags])


class _FakeUserFavoritesCollection(_FakeLookupCollection):
    def get_doc(self, user_id):
        for document in self.docs:
            if document.get("user_id") == user_id:
                return document
        return None

    async def update_one(self, query, update, upsert=False):
        overlap = set(update.get("$set", {})).intersection(update.get("$setOnInsert", {}))
        if overlap:
            field = sorted(overlap)[0]
            raise ValueError(f"Updating the path '{field}' would create a conflict at '{field}'")

        document = None
        for candidate in self.docs:
            if _matches(candidate, query):
                document = candidate
                break
        created = False

        if document is None and upsert and set(query.keys()) == {"user_id"}:
            document = {}
            self.docs.append(document)
            created = True

        if document is None:
            return _UpdateResult(matched_count=0, modified_count=0)

        modified = False

        if created and "$setOnInsert" in update:
            document.update(_clone(update["$setOnInsert"]))
            modified = True

        if "$push" in update:
            for field, value in update["$push"].items():
                document.setdefault(field, []).append(_clone(value))
                modified = True

        if "$pull" in update:
            for field, value in update["$pull"].items():
                if field != "favorites":
                    continue
                stock_code = value.get("stock_code")
                before = len(document.get("favorites", []))
                document["favorites"] = [
                    item for item in document.get("favorites", [])
                    if item.get("stock_code") != stock_code
                ]
                modified = modified or before != len(document["favorites"])

        if "$set" in update:
            for field, value in update["$set"].items():
                if field.startswith("favorites.$."):
                    stock_code = query.get("favorites.stock_code")
                    key = field.split(".", 2)[2]
                    for item in document.get("favorites", []):
                        if item.get("stock_code") == stock_code:
                            item[key] = _clone(value)
                            modified = True
                            break
                else:
                    if document.get(field) != value:
                        document[field] = _clone(value)
                        modified = True

        return _UpdateResult(
            matched_count=1,
            modified_count=1 if modified else 0,
            upserted_id="upserted" if created else None,
        )

    def aggregate(self, pipeline):
        user_id = next(
            step["$match"]["user_id"]
            for step in pipeline
            if "$match" in step and "user_id" in step["$match"]
        )
        document = self.get_doc(user_id) or {}
        tags = sorted(
            {
                tag
                for favorite in document.get("favorites", [])
                for tag in favorite.get("tags", [])
                if tag
            }
        )
        return _FakeCursor([{"_id": tag} for tag in tags])


class _FakeDb:
    def __init__(self, *, user_favorites_docs=None, user_docs=None, market_quotes=None, stock_basic_info=None):
        self.user_favorites = _FakeUserFavoritesCollection(user_favorites_docs)
        self.users = _FakeLookupCollection(user_docs)
        self.market_quotes = _FakeLookupCollection(market_quotes)
        self.stock_basic_info = _FakeLookupCollection(stock_basic_info)

    def __getitem__(self, name):
        return getattr(self, name)


@pytest.fixture(autouse=True)
def _reset_singletons():
    original_favorites_db = favorites_service.db
    original_watch_digest_db = watch_digest_service.db
    yield
    favorites_service.db = original_favorites_db
    watch_digest_service.db = original_watch_digest_db


@pytest.fixture
def api_client():
    app = FastAPI()
    app.include_router(favorites_router.router, prefix="/api")

    async def _current_user():
        return {"id": "user-1", "username": "tester"}

    app.dependency_overrides[favorites_router.get_current_user] = _current_user

    with TestClient(app) as client:
        yield client


def test_get_user_favorites_skips_online_quote_fallback_when_market_quotes_empty(monkeypatch):
    service = FavoritesService()
    service.db = _FakeDb(
        user_favorites_docs=[
            {
                "user_id": "u1",
                "canonical_version": FavoritesService.CANONICAL_VERSION,
                "favorites": [{"stock_code": "600519", "stock_name": "贵州茅台", "market": "A股"}],
            }
        ]
    )

    called = False

    class _QuotesService:
        async def get_quotes(self, codes):
            nonlocal called
            called = True
            return {}

    monkeypatch.setattr(
        "app.services.favorites_service.get_quotes_service",
        lambda: _QuotesService(),
    )

    items = asyncio.run(service.get_user_favorites("u1"))

    assert len(items) == 1
    assert items[0]["stock_code"] == "600519"
    assert items[0]["current_price"] is None
    assert called is False


def test_get_user_favorites_migrates_legacy_records_once_and_preserves_metadata(monkeypatch):
    user_id = "507f1f77bcf86cd799439011"
    service = FavoritesService()
    service.db = _FakeDb(
        user_favorites_docs=[
            {
                "user_id": user_id,
                "favorites": [
                    {
                        "stock_code": "600519",
                        "stock_name": "贵州茅台",
                        "market": "A股",
                        "added_at": datetime(2026, 4, 13, 8, 0, 0),
                        "tags": ["core"],
                        "notes": "",
                        "alert_price_high": None,
                        "alert_price_low": 1400.0,
                    }
                ],
            },
            {
                "user_id": "user-2",
                "canonical_version": FavoritesService.CANONICAL_VERSION,
                "favorites": [{"stock_code": "300750", "stock_name": "宁德时代", "market": "A股"}],
            },
        ],
        user_docs=[
            {
                "_id": ObjectId(user_id),
                "favorite_stocks": [
                    {
                        "symbol": "600519",
                        "stock_name": "贵州茅台",
                        "market": "A股",
                        "added_at": datetime(2026, 4, 10, 9, 30, 0),
                        "tags": ["legacy"],
                        "notes": "legacy note",
                        "alert_price_high": 1900.0,
                        "alert_price_low": None,
                    },
                    {
                        "stock_code": "000001",
                        "stock_name": "平安银行",
                        "market": "A股",
                        "added_at": datetime(2026, 4, 11, 9, 30, 0),
                        "tags": ["bank"],
                        "notes": "legacy only",
                    },
                ],
            },
            {
                "_id": "user-2",
                "favorite_stocks": [{"stock_code": "002594", "stock_name": "比亚迪", "market": "A股"}],
            },
        ],
    )

    class _QuotesService:
        async def get_quotes(self, codes):
            return {}

    monkeypatch.setattr(
        "app.services.favorites_service.get_quotes_service",
        lambda: _QuotesService(),
    )

    items = asyncio.run(service.get_user_favorites(user_id))
    by_code = {item["stock_code"]: item for item in items}

    assert set(by_code) == {"600519", "000001"}
    assert by_code["600519"]["tags"] == ["core", "legacy"]
    assert by_code["600519"]["notes"] == "legacy note"
    assert by_code["600519"]["alert_price_high"] == 1900.0
    assert by_code["600519"]["alert_price_low"] == 1400.0
    assert by_code["000001"]["notes"] == "legacy only"

    stored = service.db.user_favorites.get_doc(user_id)
    assert stored["canonical_version"] == FavoritesService.CANONICAL_VERSION
    assert len(stored["favorites"]) == 2
    assert {item["stock_code"] for item in stored["favorites"]} == {"600519", "000001"}


def test_remove_favorite_uses_migrated_canonical_state_without_resurfacing_legacy_data():
    user_id = "507f1f77bcf86cd799439012"
    service = FavoritesService()
    service.db = _FakeDb(
        user_docs=[
            {
                "_id": ObjectId(user_id),
                "favorite_stocks": [
                    {"stock_code": "600519", "stock_name": "贵州茅台", "market": "A股"}
                ],
            }
        ]
    )

    assert asyncio.run(service.is_favorite(user_id, "600519")) is True

    migrated = service.db.user_favorites.get_doc(user_id)
    assert migrated["canonical_version"] == FavoritesService.CANONICAL_VERSION

    assert asyncio.run(service.remove_favorite(user_id, "600519")) is True
    removed_doc = service.db.user_favorites.get_doc(user_id)
    assert removed_doc["favorites"] == []
    assert removed_doc["legacy_migration_checked_at"] is not None
    assert removed_doc["legacy_migrated_at"] is not None
    assert asyncio.run(service.is_favorite(user_id, "600519")) is False
    assert asyncio.run(service.get_user_favorites(user_id)) == []


def test_get_user_favorites_retries_legacy_merge_after_initial_empty_touch(monkeypatch):
    user_id = "507f1f77bcf86cd799439099"
    service = FavoritesService()
    fake_db = _FakeDb(
        user_docs=[
            {
                "_id": ObjectId(user_id),
                "favorite_stocks": [],
            }
        ]
    )
    service.db = fake_db

    class _QuotesService:
        async def get_quotes(self, codes):
            return {}

    monkeypatch.setattr(
        "app.services.favorites_service.get_quotes_service",
        lambda: _QuotesService(),
    )

    first_items = asyncio.run(service.get_user_favorites(user_id))
    assert first_items == []

    stored_after_first_touch = service.db.user_favorites.get_doc(user_id)
    assert stored_after_first_touch["favorites"] == []
    assert "canonical_version" not in stored_after_first_touch
    assert "legacy_migrated_at" not in stored_after_first_touch

    fake_db.users.docs[0]["favorite_stocks"] = [
        {
            "symbol": "600519",
            "stock_name": "贵州茅台",
            "market": "A股",
            "added_at": datetime(2026, 4, 10, 9, 30, 0),
            "tags": ["legacy", "core"],
            "notes": "delayed legacy",
            "alert_price_high": 1900.0,
            "alert_price_low": 1400.0,
        }
    ]

    second_items = asyncio.run(service.get_user_favorites(user_id))

    assert [item["stock_code"] for item in second_items] == ["600519"]
    assert second_items[0]["tags"] == ["legacy", "core"]
    assert second_items[0]["notes"] == "delayed legacy"
    assert second_items[0]["alert_price_high"] == 1900.0
    assert second_items[0]["alert_price_low"] == 1400.0

    stored_after_retry = service.db.user_favorites.get_doc(user_id)
    assert stored_after_retry["canonical_version"] == FavoritesService.CANONICAL_VERSION
    assert stored_after_retry["legacy_migrated_at"] is not None
    assert stored_after_retry["favorites"] == [
        {
            "stock_code": "600519",
            "stock_name": "贵州茅台",
            "market": "A股",
            "added_at": datetime(2026, 4, 10, 9, 30, 0),
            "tags": ["legacy", "core"],
            "notes": "delayed legacy",
            "alert_price_high": 1900.0,
            "alert_price_low": 1400.0,
        }
    ]


def test_get_user_favorites_retries_late_visible_legacy_data_after_empty_canonical_finalization_pressure(monkeypatch):
    user_id = "507f1f77bcf86cd799439101"
    service = FavoritesService()
    fake_db = _FakeDb(
        user_favorites_docs=[
            {
                "user_id": user_id,
                "canonical_version": FavoritesService.CANONICAL_VERSION,
                "favorites": [],
                "legacy_migration_checked_at": datetime(2026, 4, 12, 9, 0, 0),
                "legacy_migrated_at": datetime(2026, 4, 12, 9, 0, 0),
                "legacy_migration_completed_with_favorites": False,
            }
        ],
        user_docs=[
            {
                "_id": ObjectId(user_id),
                "favorite_stocks": [],
            }
        ],
    )
    service.db = fake_db

    class _QuotesService:
        async def get_quotes(self, codes):
            return {}

    monkeypatch.setattr(
        "app.services.favorites_service.get_quotes_service",
        lambda: _QuotesService(),
    )

    first_items = asyncio.run(service.get_user_favorites(user_id))
    assert first_items == []

    fake_db.users.docs[0]["favorite_stocks"] = [
        {
            "stock_code": "000001",
            "stock_name": "平安银行",
            "market": "A股",
            "added_at": datetime(2026, 4, 13, 9, 30, 0),
            "tags": ["late"],
            "notes": "became visible later",
            "alert_price_low": 12.5,
        }
    ]

    retried_items = asyncio.run(service.get_user_favorites(user_id))

    assert [item["stock_code"] for item in retried_items] == ["000001"]
    assert retried_items[0]["notes"] == "became visible later"
    assert retried_items[0]["tags"] == ["late"]
    assert retried_items[0]["alert_price_low"] == 12.5

    stored = service.db.user_favorites.get_doc(user_id)
    assert stored["canonical_version"] == FavoritesService.CANONICAL_VERSION
    assert [item["stock_code"] for item in stored["favorites"]] == ["000001"]


def test_migration_and_updates_preserve_arbitrary_metadata_fields():
    user_id = "507f1f77bcf86cd799439102"
    service = FavoritesService()
    service.db = _FakeDb(
        user_docs=[
            {
                "_id": ObjectId(user_id),
                "favorite_stocks": [
                    {
                        "symbol": "600519",
                        "stock_name": "贵州茅台",
                        "market": "A股",
                        "tags": ["legacy"],
                        "notes": "legacy note",
                        "custom_strategy": "swing",
                        "metadata_blob": {"owner": "legacy", "importance": 2},
                    }
                ],
            }
        ]
    )

    migrated = asyncio.run(service.get_user_favorites(user_id))
    assert migrated[0]["stock_code"] == "600519"

    stored_after_migration = service.db.user_favorites.get_doc(user_id)
    migrated_item = stored_after_migration["favorites"][0]
    assert migrated_item["custom_strategy"] == "swing"
    assert migrated_item["metadata_blob"] == {"owner": "legacy", "importance": 2}

    assert asyncio.run(
        service.add_favorite(
            user_id,
            "000001",
            "平安银行",
            tags=["bank"],
            notes="new favorite",
        )
    ) is True
    stored_after_add = service.db.user_favorites.get_doc(user_id)
    first_item = next(item for item in stored_after_add["favorites"] if item["stock_code"] == "600519")
    assert first_item["custom_strategy"] == "swing"
    assert first_item["metadata_blob"] == {"owner": "legacy", "importance": 2}

    assert asyncio.run(
        service.update_favorite(
            user_id,
            "600519",
            notes="patched note",
            alert_price_high=1999.0,
        )
    ) is True
    stored_after_update = service.db.user_favorites.get_doc(user_id)
    updated_item = next(item for item in stored_after_update["favorites"] if item["stock_code"] == "600519")
    assert updated_item["notes"] == "patched note"
    assert updated_item["alert_price_high"] == 1999.0
    assert updated_item["custom_strategy"] == "swing"
    assert updated_item["metadata_blob"] == {"owner": "legacy", "importance": 2}


def test_favorites_routes_cover_duplicate_partial_update_tags_and_sync_contracts(api_client, monkeypatch):
    favorites_service.db = _FakeDb()

    class _SyncService:
        async def sync_realtime_quotes(self, symbols, force=True):
            return {"success_count": len(symbols), "failed_count": 0}

    async def _get_tushare_sync_service():
        return _SyncService()

    monkeypatch.setattr(
        "app.worker.tushare_sync_service.get_tushare_sync_service",
        _get_tushare_sync_service,
    )

    create_response = api_client.post(
        "/api/favorites/",
        json={
            "stock_code": "600519",
            "stock_name": "贵州茅台",
            "market": "A股",
            "tags": ["core"],
            "notes": "buy-and-hold",
            "alert_price_high": 1900.0,
        },
    )
    assert create_response.status_code == 200
    assert create_response.json()["data"] == {"stock_code": "600519"}

    duplicate_response = api_client.post(
        "/api/favorites/",
        json={"stock_code": "600519", "stock_name": "贵州茅台", "market": "A股"},
    )
    assert duplicate_response.status_code == 400

    check_response = api_client.get("/api/favorites/check/600519")
    assert check_response.status_code == 200
    assert check_response.json()["data"] == {"stock_code": "600519", "is_favorite": True}

    update_response = api_client.put(
        "/api/favorites/600519",
        json={"notes": "updated note"},
    )
    assert update_response.status_code == 200

    favorites_response = api_client.get("/api/favorites/")
    item = favorites_response.json()["data"][0]
    assert item["stock_code"] == "600519"
    assert item["tags"] == ["core"]
    assert item["notes"] == "updated note"
    assert item["alert_price_high"] == 1900.0

    tags_response = api_client.get("/api/favorites/tags")
    assert tags_response.status_code == 200
    assert tags_response.json()["data"] == ["core"]

    sync_response = api_client.post("/api/favorites/sync-realtime", json={"data_source": "tushare"})
    assert sync_response.status_code == 200
    assert sync_response.json()["data"] == {
        "total": 1,
        "success_count": 1,
        "failed_count": 0,
        "symbols": ["600519"],
        "data_source": "tushare",
        "message": "同步完成: 成功 1 只，失败 0 只",
    }

    unsupported_sync = api_client.post("/api/favorites/sync-realtime", json={"data_source": "bogus"})
    assert unsupported_sync.status_code == 400
    assert api_client.get("/api/favorites/check/600519").json()["data"]["is_favorite"] is True

    delete_response = api_client.delete("/api/favorites/600519")
    assert delete_response.status_code == 200
    assert api_client.get("/api/favorites/check/600519").json()["data"]["is_favorite"] is False

    missing_delete = api_client.delete("/api/favorites/600519")
    assert missing_delete.status_code == 404

    empty_sync = api_client.post("/api/favorites/sync-realtime", json={"data_source": "tushare"})
    assert empty_sync.status_code == 200
    assert empty_sync.json()["data"] == {
        "total": 0,
        "success_count": 0,
        "failed_count": 0,
        "message": "没有自选股需要同步",
    }


def test_watch_digest_cards_project_migrated_legacy_entry_once(monkeypatch):
    user_id = "507f1f77bcf86cd799439013"
    favorites_service.db = _FakeDb(
        user_docs=[
            {
                "_id": ObjectId(user_id),
                "favorite_stocks": [
                    {"stock_code": "600519", "stock_name": "贵州茅台", "market": "A股"},
                    {"symbol": "600519", "stock_name": "贵州茅台", "market": "A股"},
                ],
            }
        ]
    )

    async def _empty_rules(user_id):
        return []

    async def _empty_digests(user_id):
        return {}

    monkeypatch.setattr(watch_digest_service, "get_user_rules", _empty_rules)
    monkeypatch.setattr(watch_digest_service, "_get_latest_digests_map", _empty_digests)

    cards = asyncio.run(watch_digest_service.list_digest_cards(user_id))

    assert len(cards) == 1
    assert cards[0]["stock_code"] == "600519"
    assert cards[0]["summary"] == "暂无摘要，请先执行一次解读。"


def test_add_update_remove_favorite_keep_canonical_document_without_legacy_branch():
    user_id = "507f1f77bcf86cd799439014"
    service = FavoritesService()
    service.db = _FakeDb(
        user_docs=[
            {
                "_id": ObjectId(user_id),
                "favorite_stocks": [
                    {
                        "symbol": "600519",
                        "stock_name": "贵州茅台",
                        "market": "A股",
                        "tags": ["legacy"],
                        "notes": "legacy note",
                    }
                ],
            }
        ]
    )

    assert asyncio.run(service.add_favorite(user_id, "000001", "平安银行", tags=["bank"], notes="new item")) is True

    stored = service.db.user_favorites.get_doc(user_id)
    assert stored["canonical_version"] == FavoritesService.CANONICAL_VERSION
    assert [item["stock_code"] for item in stored["favorites"]] == ["600519", "000001"]

    assert asyncio.run(
        service.update_favorite(
            user_id,
            "600519",
            tags=["core", "core", "legacy"],
            notes="patched",
            alert_price_high=1900.0,
        )
    ) is True
    updated = service.db.user_favorites.get_doc(user_id)
    updated_item = next(item for item in updated["favorites"] if item["stock_code"] == "600519")
    assert updated_item["tags"] == ["core", "legacy"]
    assert updated_item["notes"] == "patched"
    assert updated_item["alert_price_high"] == 1900.0
    assert updated_item["alert_price_low"] is None

    assert asyncio.run(service.remove_favorite(user_id, "000001")) is True
    after_remove = service.db.user_favorites.get_doc(user_id)
    assert [item["stock_code"] for item in after_remove["favorites"]] == ["600519"]


def test_get_user_tags_are_caller_scoped_after_legacy_migration():
    user_id = "507f1f77bcf86cd799439015"
    other_id = "user-2"
    service = FavoritesService()
    service.db = _FakeDb(
        user_favorites_docs=[
            {
                "user_id": other_id,
                "canonical_version": FavoritesService.CANONICAL_VERSION,
                "favorites": [
                    {"stock_code": "300750", "stock_name": "宁德时代", "tags": ["other-user", "growth"]}
                ],
            }
        ],
        user_docs=[
            {
                "_id": ObjectId(user_id),
                "favorite_stocks": [
                    {"stock_code": "600519", "stock_name": "贵州茅台", "tags": ["core", "income"]},
                    {"stock_code": "000001", "stock_name": "平安银行", "tags": ["income", "bank"]},
                ],
            }
        ],
    )

    tags = asyncio.run(service.get_user_tags(user_id))

    assert tags == ["bank", "core", "income"]
