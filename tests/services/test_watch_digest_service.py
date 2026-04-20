from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone

import pytest

import app.services.watch_digest_service as watch_digest_module
from app.services.watch_digest_service import WatchDigestService, WatchlistMembershipRequiredError


def _clone(value):
    return deepcopy(value)


def _matches(document, query):
    for key, expected in query.items():
        if document.get(key) != expected:
            return False
    return True


@dataclass
class _UpdateResult:
    matched_count: int
    modified_count: int
    upserted_id: str | None = None


@dataclass
class _DeleteResult:
    deleted_count: int


class _FakeCursor:
    def __init__(self, docs):
        self._docs = _clone(docs)

    def sort(self, field, direction):
        reverse = direction == -1
        self._docs.sort(key=lambda item: item.get(field), reverse=reverse)
        return self

    async def to_list(self, length=None):
        return _clone(self._docs if length is None else self._docs[:length])


class _FakeCollection:
    def __init__(self, docs=None):
        self.docs = _clone(docs or [])

    def find(self, query):
        return _FakeCursor([document for document in self.docs if _matches(document, query)])

    async def find_one(self, query, projection=None, sort=None):
        matches = [document for document in self.docs if _matches(document, query)]
        if sort:
            for field, direction in reversed(sort):
                matches.sort(key=lambda item: item.get(field), reverse=direction == -1)
        return _clone(matches[0]) if matches else None

    async def update_one(self, query, update, upsert=False):
        document = next((item for item in self.docs if _matches(item, query)), None)
        created = False

        if document is None and upsert:
            document = _clone(query)
            self.docs.append(document)
            created = True

        if document is None:
            return _UpdateResult(matched_count=0, modified_count=0)

        modified = False

        if created:
            for field, value in update.get("$setOnInsert", {}).items():
                document[field] = _clone(value)
                modified = True

        for field, value in update.get("$set", {}).items():
            if document.get(field) != value:
                document[field] = _clone(value)
                modified = True

        return _UpdateResult(
            matched_count=1,
            modified_count=1 if modified else 0,
            upserted_id="upserted" if created else None,
        )

    async def delete_one(self, query):
        before = len(self.docs)
        self.docs = [document for document in self.docs if not _matches(document, query)]
        return _DeleteResult(deleted_count=before - len(self.docs))


class _FakeDb:
    def __init__(self, *, watch_rules_docs=None, watch_digests_docs=None, analysis_task_docs=None):
        self.watch_rules = _FakeCollection(watch_rules_docs)
        self.watch_digests = _FakeCollection(watch_digests_docs)
        self.analysis_reports = _FakeCollection()
        self.analysis_tasks = _FakeCollection(analysis_task_docs)


@pytest.mark.asyncio
async def test_watch_rule_upsert_is_user_scoped_and_reuses_same_stock_rule(monkeypatch):
    service = WatchDigestService()
    service.db = _FakeDb()

    timestamps = iter(
        [
            datetime(2026, 4, 15, 9, 0, tzinfo=timezone.utc),
            datetime(2026, 4, 15, 10, 0, tzinfo=timezone.utc),
            datetime(2026, 4, 15, 11, 0, tzinfo=timezone.utc),
        ]
    )

    async def _get_favorite(user_id, stock_code):
        return {"stock_code": stock_code, "stock_name": f"{stock_code}-name", "market": "A股"}

    def _raise_runtime_error():
        raise RuntimeError("scheduler unavailable in unit test")

    monkeypatch.setattr(watch_digest_module.favorites_service, "get_favorite", _get_favorite)
    monkeypatch.setattr("app.services.watch_digest_service.now_tz", lambda: next(timestamps))
    monkeypatch.setattr("app.services.watch_digest_service.get_scheduler_service", _raise_runtime_error)

    first = await service.upsert_rule(
        user_id="user-1",
        stock_code="600519",
        stock_name="ignored first name",
        market="美股",
        schedule_type="daily_post_market",
        cron_expr=None,
        status="active",
    )
    second = await service.upsert_rule(
        user_id="user-1",
        stock_code="600519",
        stock_name="ignored second name",
        market="港股",
        schedule_type="weekly_review",
        cron_expr=None,
        status="paused",
    )
    other_user = await service.upsert_rule(
        user_id="user-2",
        stock_code="600519",
        stock_name="other user",
        market="A股",
        schedule_type="daily_pre_market",
        cron_expr=None,
        status="active",
    )

    assert len(service.db.watch_rules.docs) == 2

    user_1_rules = await service.get_user_rules("user-1")
    user_2_rules = await service.get_user_rules("user-2")

    assert first["stock_name"] == "600519-name"
    assert first["market"] == "A股"
    assert first["schedule_summary"] == "每天盘后"
    assert second["stock_name"] == "600519-name"
    assert second["market"] == "A股"
    assert second["schedule_type"] == "weekly_review"
    assert second["schedule_summary"] == "每周复盘"
    assert second["status"] == "paused"
    assert second["created_at"] == "2026-04-15T09:00:00+00:00"
    assert second["updated_at"] == "2026-04-15T10:00:00+00:00"
    assert user_1_rules == [second]
    assert other_user["created_at"] == "2026-04-15T11:00:00+00:00"
    assert user_2_rules == [other_user]


@pytest.mark.asyncio
async def test_watch_rule_upsert_requires_watchlist_membership_and_valid_schedule(monkeypatch):
    service = WatchDigestService()
    service.db = _FakeDb()

    async def _missing_favorite(user_id, stock_code):
        return None

    monkeypatch.setattr(watch_digest_module.favorites_service, "get_favorite", _missing_favorite)

    with pytest.raises(WatchlistMembershipRequiredError, match="目标股票不在当前用户的自选股中"):
        await service.upsert_rule(
            user_id="user-1",
            stock_code="600519",
            stock_name="贵州茅台",
            market="A股",
            schedule_type="daily_post_market",
            cron_expr=None,
            status="active",
        )

    async def _get_favorite(user_id, stock_code):
        return {"stock_code": stock_code, "stock_name": "贵州茅台", "market": "A股"}

    monkeypatch.setattr(watch_digest_module.favorites_service, "get_favorite", _get_favorite)

    with pytest.raises(ValueError, match="不支持的 schedule_type: bogus"):
        await service.upsert_rule(
            user_id="user-1",
            stock_code="600519",
            stock_name="贵州茅台",
            market="A股",
            schedule_type="bogus",
            cron_expr=None,
            status="active",
        )

    with pytest.raises(ValueError, match="cron_expr格式无效"):
        await service.upsert_rule(
            user_id="user-1",
            stock_code="600519",
            stock_name="贵州茅台",
            market="A股",
            schedule_type="custom",
            cron_expr="bad cron",
            status="active",
        )


@pytest.mark.asyncio
async def test_trigger_digest_refresh_requires_watchlist_membership_and_uses_canonical_metadata(monkeypatch):
    service = WatchDigestService()
    service.db = _FakeDb()

    async def _get_favorite(user_id, stock_code):
        return {"stock_code": stock_code, "stock_name": "贵州茅台", "market": "A股"}

    captured = {}

    class _SimpleAnalysisService:
        async def create_analysis_task(self, user_id, request):
            captured["user_id"] = user_id
            captured["symbol"] = request.symbol
            captured["market_type"] = request.parameters.market_type
            return {"task_id": "task-1", "status": "queued"}

    monkeypatch.setattr(watch_digest_module.favorites_service, "get_favorite", _get_favorite)
    monkeypatch.setattr(
        "app.services.simple_analysis_service.get_simple_analysis_service",
        lambda: _SimpleAnalysisService(),
    )

    result = await service.trigger_digest_refresh(
        user_id="user-1",
        stock_code="600519",
        stock_name="错误别名",
        market="美股",
    )

    assert result == {
        "task_id": "task-1",
        "status": "queued",
        "stock_code": "600519",
        "stock_name": "贵州茅台",
        "market": "A股",
    }
    assert captured == {
        "user_id": "user-1",
        "symbol": "600519",
        "market_type": "A股",
    }

    async def _missing_favorite(user_id, stock_code):
        return None

    monkeypatch.setattr(watch_digest_module.favorites_service, "get_favorite", _missing_favorite)

    with pytest.raises(WatchlistMembershipRequiredError, match="目标股票不在当前用户的自选股中"):
        await service.trigger_digest_refresh(
            user_id="user-1",
            stock_code="000001",
            stock_name="平安银行",
            market="A股",
        )


@pytest.mark.asyncio
async def test_list_digest_cards_projects_canonical_watchlist_with_compact_placeholders_and_task_metadata(monkeypatch):
    service = WatchDigestService()
    service.db = _FakeDb(
        watch_rules_docs=[
            {
                "user_id": "user-1",
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "market": "A股",
                "schedule_type": "daily_post_market",
                "cron_expr": None,
                "status": "active",
                "created_at": datetime(2026, 4, 15, 8, 0, tzinfo=timezone.utc),
                "updated_at": datetime(2026, 4, 15, 8, 30, tzinfo=timezone.utc),
            }
        ],
        watch_digests_docs=[
            {
                "user_id": "user-1",
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "market": "A股",
                "summary": "白酒龙头保持强势。",
                "recommendation": "继续持有",
                "risk_level": "低",
                "confidence_score": 0.91,
                "status": "ready",
                "report_id": "report-1",
                "task_id": "task-ready",
                "generated_at": datetime(2026, 4, 15, 9, 0, tzinfo=timezone.utc),
                "updated_at": datetime(2026, 4, 15, 9, 30, tzinfo=timezone.utc),
            }
        ],
        analysis_task_docs=[
            {
                "user_id": "user-1",
                "task_id": "task-old",
                "stock_code": "000001",
                "status": "failed",
                "created_at": datetime(2026, 4, 15, 7, 0, tzinfo=timezone.utc),
            },
            {
                "user_id": "user-1",
                "task_id": "task-pending",
                "stock_symbol": "000001",
                "status": "pending",
                "created_at": datetime(2026, 4, 15, 10, 0, tzinfo=timezone.utc),
            },
            {
                "user_id": "user-2",
                "task_id": "task-other-user",
                "stock_code": "000001",
                "status": "running",
                "created_at": datetime(2026, 4, 15, 11, 0, tzinfo=timezone.utc),
            },
        ],
    )

    async def _get_user_favorites(user_id):
        assert user_id == "user-1"
        return [
            {
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "market": "A股",
                "board": "主板",
                "exchange": "上海证券交易所",
                "current_price": 1678.0,
                "change_percent": 1.8,
            },
            {
                "stock_code": "000001",
                "stock_name": "平安银行",
                "market": "A股",
                "board": "主板",
                "exchange": "深圳证券交易所",
                "current_price": 11.2,
                "change_percent": -0.6,
                "alert_price_low": 10.5,
            },
            {
                "symbol": "600519",
                "stock_name": "重复条目应忽略",
                "market": "A股",
            },
        ]

    monkeypatch.setattr(watch_digest_module.favorites_service, "get_user_favorites", _get_user_favorites)

    cards = await service.list_digest_cards("user-1")

    assert [card["stock_code"] for card in cards] == ["600519", "000001"]

    ready_card = cards[0]
    placeholder_card = cards[1]
    required_fields = {
        "stock_code",
        "stock_name",
        "market",
        "board",
        "exchange",
        "current_price",
        "change_percent",
        "digest_status",
        "summary",
        "risk_level",
        "rule_status",
        "task_status",
        "task_id",
        "updated_at",
        "task_updated_at",
    }

    assert required_fields <= set(ready_card)
    assert required_fields <= set(placeholder_card)
    assert "symbol" not in ready_card
    assert "symbol" not in placeholder_card

    assert ready_card == {
        "stock_code": "600519",
        "stock_name": "贵州茅台",
        "market": "A股",
        "board": "主板",
        "exchange": "上海证券交易所",
        "current_price": 1678.0,
        "change_percent": 1.8,
        "digest_status": "ready",
        "summary": "白酒龙头保持强势。",
        "recommendation": "继续持有",
        "risk_level": "低",
        "confidence_score": 0.91,
        "schedule_type": "daily_post_market",
        "schedule_summary": "每天盘后",
        "cron_expr": None,
        "rule_status": "active",
        "generated_at": "2026-04-15T09:00:00+00:00",
        "updated_at": "2026-04-15T09:30:00+00:00",
        "report_id": "report-1",
        "task_id": "task-ready",
        "task_status": None,
        "task_updated_at": None,
        "schedule_label": "每天盘后",
    }
    assert placeholder_card == {
        "stock_code": "000001",
        "stock_name": "平安银行",
        "market": "A股",
        "board": "主板",
        "exchange": "深圳证券交易所",
        "current_price": 11.2,
        "change_percent": -0.6,
        "digest_status": "pending",
        "summary": "暂无摘要，请先执行一次解读。",
        "recommendation": None,
        "risk_level": "关注",
        "confidence_score": None,
        "schedule_type": None,
        "schedule_summary": "未配置",
        "cron_expr": None,
        "rule_status": "inactive",
        "generated_at": None,
        "updated_at": "2026-04-15T10:00:00+00:00",
        "report_id": None,
        "task_id": "task-pending",
        "task_status": "pending",
        "task_updated_at": "2026-04-15T10:00:00+00:00",
        "schedule_label": "未配置",
    }
    assert "report_body" not in placeholder_card


@pytest.mark.asyncio
async def test_list_digest_cards_preserves_exact_watch_membership_without_orphan_or_cross_user_leakage(monkeypatch):
    service = WatchDigestService()
    service.db = _FakeDb(
        watch_digests_docs=[
            {
                "user_id": "user-1",
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "market": "A股",
                "summary": "白酒龙头保持强势。",
                "risk_level": "低",
                "status": "ready",
                "updated_at": datetime(2026, 4, 15, 9, 0, tzinfo=timezone.utc),
            },
            {
                "user_id": "user-1",
                "stock_code": "300750",
                "stock_name": "宁德时代",
                "market": "A股",
                "summary": "孤儿摘要不应泄露到返回结果。",
                "risk_level": "中等",
                "status": "ready",
                "updated_at": datetime(2026, 4, 15, 10, 0, tzinfo=timezone.utc),
            },
            {
                "user_id": "user-2",
                "stock_code": "000001",
                "stock_name": "平安银行",
                "market": "A股",
                "summary": "其他用户摘要不应泄露。",
                "risk_level": "高",
                "status": "ready",
                "updated_at": datetime(2026, 4, 15, 11, 0, tzinfo=timezone.utc),
            },
        ],
        analysis_task_docs=[
            {
                "user_id": "user-1",
                "task_id": "task-pending",
                "stock_code": "000001",
                "status": "pending",
                "updated_at": datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc),
            },
            {
                "user_id": "user-2",
                "task_id": "task-other-user",
                "stock_code": "000001",
                "status": "running",
                "updated_at": datetime(2026, 4, 15, 13, 0, tzinfo=timezone.utc),
            },
        ],
    )

    async def _get_user_favorites(user_id):
        assert user_id == "user-1"
        return [
            {"stock_code": "600519", "stock_name": "贵州茅台", "market": "A股"},
            {"stock_code": "000001", "stock_name": "平安银行", "market": "A股"},
        ]

    monkeypatch.setattr(watch_digest_module.favorites_service, "get_user_favorites", _get_user_favorites)

    cards = await service.list_digest_cards("user-1")

    assert [card["stock_code"] for card in cards] == ["000001", "600519"]

    placeholder_card = cards[0]
    ready_card = cards[1]

    assert placeholder_card["summary"] == "暂无摘要，请先执行一次解读。"
    assert placeholder_card["digest_status"] == "pending"
    assert placeholder_card["task_id"] == "task-pending"
    assert placeholder_card["task_status"] == "pending"

    assert ready_card["summary"] == "白酒龙头保持强势。"
    assert ready_card["digest_status"] == "ready"

    assert {card["stock_code"] for card in cards} == {"600519", "000001"}
    assert all(card["stock_code"] != "300750" for card in cards)


@pytest.mark.asyncio
async def test_trigger_refresh_for_all_deduplicates_watchlist_membership_and_preserves_task_metadata(monkeypatch):
    service = WatchDigestService()

    async def _get_user_favorites(user_id):
        assert user_id == "user-1"
        return [
            {"stock_code": "600519", "stock_name": "贵州茅台", "market": "A股"},
            {"symbol": "600519", "stock_name": "重复条目应忽略", "market": "A股"},
            {"stock_code": "000001", "stock_name": "平安银行", "market": "A股"},
            {"stock_code": "", "stock_name": "空代码应忽略", "market": "A股"},
        ]

    captured_calls = []

    async def _trigger_digest_refresh(*, user_id, stock_code, stock_name, market):
        captured_calls.append((user_id, stock_code, stock_name, market))
        return {
            "task_id": f"task-{stock_code}",
            "status": "pending",
            "message": "任务已创建，等待执行",
            "stock_code": stock_code,
            "stock_name": stock_name,
            "market": market,
        }

    monkeypatch.setattr(watch_digest_module.favorites_service, "get_user_favorites", _get_user_favorites)
    monkeypatch.setattr(service, "trigger_digest_refresh", _trigger_digest_refresh)

    tasks = await service.trigger_refresh_for_all("user-1")

    assert captured_calls == [
        ("user-1", "600519", "贵州茅台", "A股"),
        ("user-1", "000001", "平安银行", "A股"),
    ]
    assert tasks == [
        {
            "stock_code": "600519",
            "stock_name": "贵州茅台",
            "market": "A股",
            "task_id": "task-600519",
            "status": "pending",
            "message": "任务已创建，等待执行",
        },
        {
            "stock_code": "000001",
            "stock_name": "平安银行",
            "market": "A股",
            "task_id": "task-000001",
            "status": "pending",
            "message": "任务已创建，等待执行",
        },
    ]
