from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from typing import Optional

from app.core.response import ok
from app.routers.auth_db import get_current_user
from app.services.watch_digest_service import WatchlistMembershipRequiredError, watch_digest_service


router = APIRouter(prefix="/api/watch", tags=["watch-digest"])


class UpsertWatchRuleRequest(BaseModel):
    stock_name: Optional[str] = None
    market: str = "A股"
    schedule_type: str = Field(default="daily_post_market")
    cron_expr: Optional[str] = None
    status: str = "active"

    @model_validator(mode="after")
    def validate_schedule_combination(self):
        normalized_schedule_type = (self.schedule_type or "daily_post_market").strip()
        normalized_cron_expr = self.cron_expr.strip() if self.cron_expr is not None else None

        supported_schedule_types = {"custom", "daily_pre_market", "daily_post_market", "intra_day", "weekly_review"}

        if normalized_schedule_type == "custom" and not normalized_cron_expr:
            raise ValueError("custom 调度必须提供 cron_expr")
        if normalized_schedule_type != "custom" and normalized_cron_expr:
            raise ValueError("仅 custom 调度允许提供 cron_expr")
        if normalized_schedule_type not in supported_schedule_types:
            raise ValueError(f"不支持的 schedule_type: {normalized_schedule_type}")
        return self


class RefreshDigestRequest(BaseModel):
    stock_name: Optional[str] = None
    market: str = "A股"


@router.get("/digests")
async def list_watch_digests(current_user: dict = Depends(get_current_user)):
    cards = await watch_digest_service.list_digest_cards(current_user["id"])
    return ok(cards)


@router.get("/rules")
async def list_watch_rules(current_user: dict = Depends(get_current_user)):
    rules = await watch_digest_service.get_user_rules(current_user["id"])
    return ok(rules)


@router.put("/rules/{stock_code}")
async def upsert_watch_rule(
    stock_code: str,
    request: UpsertWatchRuleRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        rule = await watch_digest_service.upsert_rule(
            user_id=current_user["id"],
            stock_code=stock_code,
            stock_name=request.stock_name,
            market=request.market,
            schedule_type=request.schedule_type,
            cron_expr=request.cron_expr,
            status=request.status,
        )
    except WatchlistMembershipRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ok(rule, "监控策略已保存")


@router.delete("/rules/{stock_code}")
async def delete_watch_rule(stock_code: str, current_user: dict = Depends(get_current_user)):
    success = await watch_digest_service.delete_rule(current_user["id"], stock_code)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="监控策略不存在")
    return ok({"stock_code": stock_code}, "监控策略已删除")


@router.post("/digests/{stock_code}/refresh")
async def refresh_watch_digest(
    stock_code: str,
    request: RefreshDigestRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    try:
        created = await watch_digest_service.trigger_digest_refresh(
            user_id=current_user["id"],
            stock_code=stock_code,
            stock_name=request.stock_name or stock_code,
            market=request.market,
        )
    except WatchlistMembershipRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    background_tasks.add_task(
        watch_digest_service.run_digest_refresh,
        created["task_id"],
        current_user["id"],
        created.get("stock_code") or stock_code,
        created.get("stock_name") or request.stock_name or stock_code,
        created.get("market") or request.market,
    )
    return ok(created, "解读任务已创建")


@router.post("/digests/refresh-all")
async def refresh_all_watch_digests(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    tasks = await watch_digest_service.trigger_refresh_for_all(current_user["id"])
    for item in tasks:
        background_tasks.add_task(
            watch_digest_service.run_digest_refresh,
            item["task_id"],
            current_user["id"],
            item["stock_code"],
            item["stock_name"],
            item.get("market", "A股"),
        )
    return ok(
        {
            "count": len(tasks),
            "stocks": [item["stock_code"] for item in tasks],
        },
        "已批量创建解读任务",
    )
