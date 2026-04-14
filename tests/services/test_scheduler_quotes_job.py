import inspect
from types import SimpleNamespace

from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI


def test_scheduler_adds_quotes_job(monkeypatch):
    # Flags to assert behavior
    state = SimpleNamespace(
        ensure_indexes_called=False,
        run_once_called=False,
    )

    # Fake QuotesIngestionService used by app.main during startup
    class _FakeQuotesIngestion:
        async def ensure_indexes(self):
            state.ensure_indexes_called = True

        async def run_once(self):
            state.run_once_called = True
            return None

        async def backfill_last_close_snapshot_if_needed(self):
            return None

    # Capture added jobs from scheduler
    class _FakeScheduler:
        def __init__(self):
            self.jobs = []

        def add_job(self, func, trigger, *args, **kwargs):
            # record and keep a handle to the callable and trigger
            self.jobs.append({"func": func, "trigger": trigger, "args": args, "kwargs": kwargs})

        def start(self):
            # no-op in tests
            return None

        def shutdown(self, wait=False):
            return None

        def pause_job(self, job_id):
            return None

        def resume_job(self, job_id):
            return None

    # Patch scheduler and service in app.main before startup runs
    import app.main as main_mod

    fake_scheduler = _FakeScheduler()

    # Patch blocking init/close DB and basic sync service
    async def _noop_async(*args, **kwargs):
        return None

    class _FakeBasicsService:
        async def run_full_sync(self, force: bool = False):
            return None

    monkeypatch.setattr(main_mod, "init_db", _noop_async, raising=True)
    monkeypatch.setattr(main_mod, "close_db", _noop_async, raising=True)
    monkeypatch.setattr(main_mod, "_print_config_summary", _noop_async, raising=True)
    monkeypatch.setattr(main_mod, "get_basics_sync_service", lambda: _FakeBasicsService(), raising=True)

    # Patch scheduler, quotes service and asyncio.create_task
    monkeypatch.setattr(main_mod, "AsyncIOScheduler", lambda *args, **kwargs: fake_scheduler, raising=True)
    monkeypatch.setattr(main_mod, "QuotesIngestionService", _FakeQuotesIngestion, raising=True)

    # Directly drive the lifespan to avoid importing full router stack
    import asyncio as _asyncio

    async def _run():
        async with main_mod.lifespan(FastAPI()):
            return

    _asyncio.run(_run())

    # Assert a job with IntervalTrigger was scheduled
    assert fake_scheduler.jobs, "No jobs scheduled for quotes ingestion"
    job = None
    for j in fake_scheduler.jobs:
        if isinstance(j["trigger"], IntervalTrigger):
            job = j
            break
    assert job is not None, "Quotes ingestion IntervalTrigger job not found"

    # Ensure ensure_indexes called during startup
    assert state.ensure_indexes_called is True

    # Simulate scheduler tick by invoking the stored func
    job_func = job["func"]
    assert inspect.iscoroutinefunction(job_func)
    _asyncio.run(job_func())

    assert state.run_once_called is True

