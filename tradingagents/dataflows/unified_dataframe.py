"""Backward-compatible unified DataFrame helpers for curated tests."""

from __future__ import annotations

import pandas as pd

from .data_source_manager import get_data_source_manager
from .providers.china.akshare import get_akshare_provider
from .providers.china.baostock import get_baostock_provider
from .providers.china.tushare import get_tushare_provider


def get_tushare_adapter():
    """Compatibility alias retained for older tests and callers."""
    return get_tushare_provider()


def _source_name(source) -> str:
    return str(getattr(source, "value", source)).lower()


def _standardize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()

    out = df.copy()
    column_map = {
        "Open": "open",
        "High": "high",
        "Low": "low",
        "Close": "close",
        "Volume": "vol",
        "Amount": "amount",
        "open": "open",
        "high": "high",
        "low": "low",
        "close": "close",
        "volume": "vol",
        "vol": "vol",
        "amount": "amount",
        "trade_date": "date",
        "date": "date",
        "symbol": "code",
        "Symbol": "code",
        "code": "code",
    }
    out = out.rename(columns={column: column_map.get(column, column) for column in out.columns})

    if "date" in out.columns:
        try:
            out["date"] = pd.to_datetime(out["date"])
            out = out.sort_values("date").reset_index(drop=True)
        except Exception:
            pass

    return out


def _fetch_from_provider(provider, symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
    for method_name in ("get_stock_data", "get_daily_data"):
        method = getattr(provider, method_name, None)
        if not callable(method):
            continue

        try:
            data = method(symbol, start_date, end_date)
        except TypeError:
            continue

        if isinstance(data, pd.DataFrame):
            return data

    return pd.DataFrame()


def get_china_daily_df_unified(symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
    """
    Return a normalized daily DataFrame with source fallback.

    Preferred order is the manager's current source followed by its configured
    fallback sources. Older tests patch the provider getters in this module, so
    this compatibility layer keeps that indirection intact.
    """

    manager = get_data_source_manager()
    ordered_sources = []

    current_source = getattr(manager, "current_source", None)
    if current_source is not None:
        ordered_sources.append(_source_name(current_source))

    for source in getattr(manager, "available_sources", []):
        name = _source_name(source)
        if name not in ordered_sources:
            ordered_sources.append(name)

    if not ordered_sources:
        ordered_sources = ["tushare", "akshare", "baostock"]

    providers = {
        "tushare": get_tushare_adapter,
        "akshare": get_akshare_provider,
        "baostock": get_baostock_provider,
    }

    for source_name in ordered_sources:
        provider_factory = providers.get(source_name)
        if provider_factory is None:
            continue

        df = _fetch_from_provider(provider_factory(), symbol, start_date, end_date)
        if not df.empty:
            return _standardize_dataframe(df)

    return pd.DataFrame()


__all__ = ["get_china_daily_df_unified", "get_tushare_adapter"]
