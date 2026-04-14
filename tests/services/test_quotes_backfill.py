import asyncio


def test_offhours_backfill_when_empty(monkeypatch):
    from app.services.quotes_ingestion_service import QuotesIngestionService
    import app.services.quotes_ingestion_service as qis_mod

    class _FakeManager:
        def find_latest_trade_date_with_fallback(self):
            return "20250102"

    monkeypatch.setattr(qis_mod, "DataSourceManager", _FakeManager, raising=True)

    # Fake DB/collection
    class _FakeResult:
        def __init__(self, upserted):
            self.matched_count = 0
            self.modified_count = 0
            self.upserted_ids = {i: None for i in range(upserted)}

    class _FakeCursor:
        def __init__(self, docs):
            self.docs = docs

        async def to_list(self, length=None):
            return list(self.docs)

    class _MarketQuotesColl:
        def __init__(self):
            self.last_ops = None

        async def create_index(self, *args, **kwargs):
            return "ok"

        async def estimated_document_count(self):
            return 0  # empty -> should trigger backfill

        async def bulk_write(self, ops, ordered=False):
            self.last_ops = ops
            return _FakeResult(len(ops))

    class _DailyQuotesColl:
        def __init__(self):
            self.docs = [
                {
                    "code": "000001",
                    "trade_date": "20250102",
                    "period": "daily",
                    "close": 10.2,
                    "pct_chg": 0.2,
                    "amount": 1.1e8,
                    "volume": 3.0e7,
                },
                {
                    "code": "600000",
                    "trade_date": "20250102",
                    "period": "daily",
                    "close": 9.7,
                    "pct_chg": -0.4,
                    "amount": 7.1e7,
                    "volume": 2.1e7,
                },
            ]

        def find(self, query):
            return _FakeCursor(self.docs)

    class _StatusColl:
        async def update_one(self, *args, **kwargs):
            return None

    class _FakeDB:
        def __init__(self):
            self.market_quotes = _MarketQuotesColl()
            self.stock_daily_quotes = _DailyQuotesColl()
            self.quotes_ingestion_status = _StatusColl()

        def __getitem__(self, name: str):
            return getattr(self, name)

    fake_db = _FakeDB()

    def _fake_get_mongo_db():
        return fake_db

    monkeypatch.setattr(qis_mod, "get_mongo_db", _fake_get_mongo_db, raising=True)

    async def _run():
        svc = QuotesIngestionService()
        # Force off-hours
        monkeypatch.setattr(QuotesIngestionService, "_is_trading_time", lambda self, now=None: False, raising=True)
        await svc.run_once()
        assert fake_db.market_quotes.last_ops is not None
        assert len(fake_db.market_quotes.last_ops) == 2

    asyncio.run(_run())

