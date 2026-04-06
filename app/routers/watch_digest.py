from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional

from app.core.response import ok
from app.routers.auth_db import get_current_user
from app.services.watch_digest_service import watch_digest_service


router = APIRouter(prefix="/api/watch", tags=["watch-digest"])


class UpsertWatchRuleRequest(BaseModel):
    stock_name: Optional[str] = None
    market: str = "A股"
    schedule_type: str = Field(default="daily_post_market")
    cron_expr: Optional[str] = None
    status: str = "active"


class RefreshDigestRequest(BaseModel):
    stock_name: str
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
    created = await watch_digest_service.trigger_digest_refresh(
        user_id=current_user["id"],
        stock_code=stock_code,
        stock_name=request.stock_name,
        market=request.market,
    )
    background_tasks.add_task(
        watch_digest_service.run_digest_refresh,
        created["task_id"],
        current_user["id"],
        stock_code,
        request.stock_name,
        request.market,
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
