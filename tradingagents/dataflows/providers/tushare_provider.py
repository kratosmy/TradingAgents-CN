"""Backward-compatible Tushare provider module."""

from __future__ import annotations

from .china import tushare as _impl

TUSHARE_AVAILABLE = _impl.TUSHARE_AVAILABLE
ts = _impl.ts


class TushareProvider(_impl.TushareProvider):
    def _sync_module_globals(self) -> None:
        _impl.TUSHARE_AVAILABLE = TUSHARE_AVAILABLE
        _impl.ts = ts

    def connect_sync(self) -> bool:
        self._sync_module_globals()
        return super().connect_sync()

    async def connect(self) -> bool:
        self._sync_module_globals()
        return await super().connect()


_tushare_provider: TushareProvider | None = None


def get_tushare_provider() -> TushareProvider:
    global _tushare_provider
    if _tushare_provider is None:
        _tushare_provider = TushareProvider()
    return _tushare_provider


__all__ = ["TUSHARE_AVAILABLE", "TushareProvider", "get_tushare_provider", "ts"]
