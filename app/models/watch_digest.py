from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.utils.timezone import now_tz


class WatchRule(BaseModel):
    user_id: str
    stock_code: str
    stock_name: Optional[str] = None
    market: str = "A股"
    schedule_type: str = "daily_post_market"
    cron_expr: Optional[str] = None
    status: str = "active"
    created_at: datetime = Field(default_factory=now_tz)
    updated_at: datetime = Field(default_factory=now_tz)


class WatchDigest(BaseModel):
    user_id: str
    stock_code: str
    stock_name: Optional[str] = None
    market: str = "A股"
    report_id: Optional[str] = None
    task_id: Optional[str] = None
    summary: str = ""
    recommendation: Optional[str] = None
    risk_level: str = "中等"
    confidence_score: Optional[float] = None
    status: str = "ready"
    generated_at: datetime = Field(default_factory=now_tz)
    updated_at: datetime = Field(default_factory=now_tz)


class WatchDigestCard(BaseModel):
    stock_code: str
    stock_name: str
    market: str = "A股"
    board: Optional[str] = None
    exchange: Optional[str] = None
    current_price: Optional[float] = None
    change_percent: Optional[float] = None
    summary: str = ""
    recommendation: Optional[str] = None
    risk_level: str = "未配置"
    confidence_score: Optional[float] = None
    schedule_type: Optional[str] = None
    rule_status: str = "inactive"
    updated_at: Optional[str] = None
    report_id: Optional[str] = None
    task_id: Optional[str] = None
