import pytest

from app.services.favorites_service import FavoritesService


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, length=None):
        return list(self._docs)


class _FakeCollection:
    def __init__(self, *, find_one_result=None, find_docs=None):
        self._find_one_result = find_one_result
        self._find_docs = find_docs or []

    async def find_one(self, query):
        return self._find_one_result

    def find(self, query, projection=None):
        return _FakeCursor(self._find_docs)


class _FakeDb:
    def __init__(self, favorites):
        self.user_favorites = _FakeCollection(
            find_one_result={"user_id": "u1", "favorites": favorites}
        )
        self.market_quotes = _FakeCollection(find_docs=[])
        self.stock_basic_info = _FakeCollection(find_docs=[])

    def __getitem__(self, name):
        return getattr(self, name)


@pytest.mark.asyncio
async def test_get_user_favorites_skips_online_quote_fallback_when_market_quotes_empty(monkeypatch):
    service = FavoritesService()
    service.db = _FakeDb(
        favorites=[{"stock_code": "600519", "stock_name": "贵州茅台", "market": "A股"}]
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

    items = await service.get_user_favorites("u1")

    assert len(items) == 1
    assert items[0]["stock_code"] == "600519"
    assert items[0]["current_price"] is None
    assert called is False
