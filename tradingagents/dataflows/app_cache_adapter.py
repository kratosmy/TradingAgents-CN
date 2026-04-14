"""Backward-compatible app cache adapter imports."""

from .cache.app_adapter import get_basics_from_cache, get_market_quote_dataframe

__all__ = ["get_basics_from_cache", "get_market_quote_dataframe"]
