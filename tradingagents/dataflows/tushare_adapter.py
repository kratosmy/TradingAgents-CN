"""Backward-compatible Tushare adapter surface used by legacy tests."""

from __future__ import annotations

from typing import Optional

import pandas as pd

from tradingagents.config.runtime_settings import use_app_cache_enabled

from . import app_cache_adapter
from .providers.china.tushare import get_tushare_provider


class TushareDataAdapter:
    def __init__(self, enable_cache: bool = True):
        self.enable_cache = enable_cache
        self.provider = get_tushare_provider()

    def _standardize_data(self, df: pd.DataFrame) -> pd.DataFrame:
        return df

    def _empty_frame(self) -> pd.DataFrame:
        return pd.DataFrame()

    def _get_realtime_data(self, symbol: str) -> pd.DataFrame:
        if use_app_cache_enabled(default=False):
            cached = app_cache_adapter.get_market_quote_dataframe(symbol)
            if cached is not None and not cached.empty:
                return self._standardize_data(cached)

        if self.provider is None:
            return self._empty_frame()

        if hasattr(self.provider, "get_stock_daily"):
            df = self.provider.get_stock_daily(symbol, None, None)
            if isinstance(df, pd.DataFrame):
                return self._standardize_data(df)

        return self._empty_frame()

    def get_stock_data(self, symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
        if self.provider is None or not hasattr(self.provider, "get_stock_daily"):
            return self._empty_frame()
        df = self.provider.get_stock_daily(symbol, start_date, end_date)
        return self._standardize_data(df) if isinstance(df, pd.DataFrame) else self._empty_frame()

    def get_stock_info(self, symbol: str):
        if self.provider is None:
            return None
        if hasattr(self.provider, "get_stock_info"):
            return self.provider.get_stock_info(symbol)
        if hasattr(self.provider, "get_stock_basic_info"):
            result = self.provider.get_stock_basic_info(symbol)
            return result
        return None

    def search_stocks(self, keyword: str) -> pd.DataFrame:
        if self.provider is None or not hasattr(self.provider, "get_stock_list"):
            return self._empty_frame()

        stock_list = self.provider.get_stock_list()
        if isinstance(stock_list, pd.DataFrame):
            mask = stock_list.astype(str).apply(lambda col: col.str.contains(keyword, case=False, na=False))
            return stock_list[mask.any(axis=1)]
        if isinstance(stock_list, list):
            return pd.DataFrame(
                [
                    row
                    for row in stock_list
                    if keyword.lower() in str(row).lower()
                ]
            )
        return self._empty_frame()

    def get_fundamentals(self, symbol: str):
        if self.provider is None or not hasattr(self.provider, "get_fundamentals"):
            return None
        return self.provider.get_fundamentals(symbol)


TushareAdapter = TushareDataAdapter

_tushare_adapter: Optional[TushareDataAdapter] = None


def get_tushare_adapter() -> TushareDataAdapter:
    global _tushare_adapter
    if _tushare_adapter is None:
        _tushare_adapter = TushareDataAdapter()
    return _tushare_adapter


__all__ = ["TushareAdapter", "TushareDataAdapter", "get_tushare_adapter"]
