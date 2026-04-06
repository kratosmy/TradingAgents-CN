from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings
from app.core.database import get_mongo_db
from app.models.analysis import AnalysisParameters, SingleAnalysisRequest
from app.models.watch_digest import WatchDigest, WatchDigestCard, WatchRule
from app.services.favorites_service import favorites_service
from app.services.scheduler_service import get_scheduler_service
from app.services.simple_analysis_service import get_simple_analysis_service
from app.utils.timezone import now_tz


SCHEDULE_LABELS = {
    "daily_pre_market": "每天盘前",
    "daily_post_market": "每天盘后",
    "intra_day": "盘中播报",
    "weekly_review": "每周复盘",
}

logger = logging.getLogger(__name__)


class WatchDigestService:
    def __init__(self) -> None:
        self.db = None

    async def _get_db(self):
        if self.db is None:
            self.db = get_mongo_db()
        return self.db

    async def get_user_rules(self, user_id: str) -> List[Dict[str, Any]]:
        db = await self._get_db()
        rules = await db.watch_rules.find({"user_id": user_id}).sort("updated_at", -1).to_list(length=None)
        return [self._serialize_rule(doc) for doc in rules]

    async def upsert_rule(
        self,
        user_id: str,
        stock_code: str,
        stock_name: Optional[str],
        market: str,
        schedule_type: str,
        cron_expr: Optional[str],
        status: str,
    ) -> Dict[str, Any]:
        db = await self._get_db()
        now = now_tz()
        payload = WatchRule(
            user_id=user_id,
            stock_code=stock_code,
            stock_name=stock_name,
            market=market,
            schedule_type=schedule_type,
            cron_expr=cron_expr,
            status=status,
            created_at=now,
            updated_at=now,
        ).model_dump()
        await db.watch_rules.update_one(
            {"user_id": user_id, "stock_code": stock_code},
            {"$set": {**payload, "updated_at": now}, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        saved = await db.watch_rules.find_one({"user_id": user_id, "stock_code": stock_code})
        await self._sync_scheduler_job(saved)
        return self._serialize_rule(saved)

    async def delete_rule(self, user_id: str, stock_code: str) -> bool:
        db = await self._get_db()
        result = await db.watch_rules.delete_one({"user_id": user_id, "stock_code": stock_code})
        await self._remove_scheduler_job(user_id, stock_code)
        return result.deleted_count > 0

    async def list_digest_cards(self, user_id: str) -> List[Dict[str, Any]]:
        favorites = await favorites_service.get_user_favorites(user_id)
        rules = await self.get_user_rules(user_id)
        rules_map = {item["stock_code"]: item for item in rules}
        digests_map = await self._get_latest_digests_map(user_id)

        cards: List[Dict[str, Any]] = []
        for favorite in favorites:
            stock_code = favorite.get("stock_code") or favorite.get("symbol")
            if not stock_code:
                continue

            digest = digests_map.get(stock_code) or {}
            rule = rules_map.get(stock_code) or {}
            schedule_type = rule.get("schedule_type")
            card = WatchDigestCard(
                stock_code=stock_code,
                stock_name=favorite.get("stock_name") or stock_code,
                market=favorite.get("market", "A股"),
                board=favorite.get("board"),
                exchange=favorite.get("exchange"),
                current_price=favorite.get("current_price"),
                change_percent=favorite.get("change_percent"),
                summary=digest.get("summary") or "暂无摘要，请先执行一次解读。",
                recommendation=digest.get("recommendation"),
                risk_level=digest.get("risk_level") or self._risk_from_alerts(favorite),
                confidence_score=digest.get("confidence_score"),
                schedule_type=schedule_type,
                rule_status=rule.get("status", "inactive"),
                updated_at=self._serialize_datetime(digest.get("updated_at") or digest.get("generated_at")),
                report_id=digest.get("report_id"),
                task_id=digest.get("task_id"),
            ).model_dump()
            card["schedule_label"] = SCHEDULE_LABELS.get(schedule_type or "", "未配置")
            cards.append(card)

        cards.sort(key=lambda item: (item["rule_status"] != "active", item["stock_code"]))
        return cards

    async def trigger_digest_refresh(
        self,
        user_id: str,
        stock_code: str,
        stock_name: str,
        market: str = "A股",
    ) -> Dict[str, Any]:
        service = get_simple_analysis_service()
        request = SingleAnalysisRequest(
            symbol=stock_code,
            parameters=AnalysisParameters(market_type=market, research_depth="标准"),
        )
        return await service.create_analysis_task(user_id, request)

    async def run_digest_refresh(
        self,
        task_id: Optional[str],
        user_id: str,
        stock_code: str,
        stock_name: str,
        market: str = "A股",
    ) -> None:
        service = get_simple_analysis_service()
        request = SingleAnalysisRequest(
            symbol=stock_code,
            parameters=AnalysisParameters(market_type=market, research_depth="标准"),
        )
        if not task_id:
            created = await service.create_analysis_task(user_id, request)
            task_id = created["task_id"]
        await service.execute_analysis_background(task_id, user_id, request)
        await self.upsert_digest_from_latest_report(user_id, stock_code, stock_name, market, task_id)

    async def upsert_digest_from_latest_report(
        self,
        user_id: str,
        stock_code: str,
        stock_name: Optional[str],
        market: str,
        task_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        db = await self._get_db()
        report_query: Dict[str, Any] = {"stock_symbol": stock_code}
        if task_id:
            report_query["task_id"] = task_id
        report = await db.analysis_reports.find_one(report_query, sort=[("created_at", -1)])

        if not report and task_id:
            task = await db.analysis_tasks.find_one({"task_id": task_id}, {"result": 1})
            result = (task or {}).get("result") or {}
            if result:
                payload = WatchDigest(
                    user_id=user_id,
                    stock_code=stock_code,
                    stock_name=stock_name or stock_code,
                    market=market,
                    report_id=result.get("analysis_id"),
                    task_id=task_id,
                    summary=result.get("summary") or "分析已完成，请查看详细报告。",
                    recommendation=result.get("recommendation"),
                    risk_level=result.get("risk_level") or "中等",
                    confidence_score=result.get("confidence_score"),
                    status="ready",
                ).model_dump()
                await db.watch_digests.update_one(
                    {"user_id": user_id, "stock_code": stock_code},
                    {"$set": {**payload, "updated_at": now_tz()}},
                    upsert=True,
                )
                return payload
            return None

        if not report:
            return None

        payload = WatchDigest(
            user_id=user_id,
            stock_code=stock_code,
            stock_name=report.get("stock_name") or stock_name or stock_code,
            market=report.get("market_type") or market,
            report_id=str(report.get("_id")),
            task_id=report.get("task_id"),
            summary=report.get("summary") or "分析已完成，请查看详细报告。",
            recommendation=report.get("recommendation"),
            risk_level=report.get("risk_level") or "中等",
            confidence_score=report.get("confidence_score"),
            status="ready",
            generated_at=report.get("updated_at") or report.get("created_at") or now_tz(),
            updated_at=now_tz(),
        ).model_dump()
        await db.watch_digests.update_one(
            {"user_id": user_id, "stock_code": stock_code},
            {"$set": {**payload, "updated_at": now_tz()}},
            upsert=True,
        )
        return payload

    async def trigger_refresh_for_all(self, user_id: str) -> List[Dict[str, Any]]:
        favorites = await favorites_service.get_user_favorites(user_id)
        tasks = []
        for favorite in favorites:
            stock_code = favorite.get("stock_code")
            if not stock_code:
                continue
            created = await self.trigger_digest_refresh(
                user_id=user_id,
                stock_code=stock_code,
                stock_name=favorite.get("stock_name") or stock_code,
                market=favorite.get("market", "A股"),
            )
            tasks.append(
                {
                    "stock_code": stock_code,
                    "stock_name": favorite.get("stock_name") or stock_code,
                    "market": favorite.get("market", "A股"),
                    "task_id": created["task_id"],
                }
            )
        return tasks

    async def rebuild_scheduler_jobs(self) -> int:
        db = await self._get_db()
        rules = await db.watch_rules.find({"status": "active"}).to_list(length=None)
        count = 0
        for rule in rules:
            try:
                await self._sync_scheduler_job(rule)
                count += 1
            except ValueError as exc:
                logger.warning("跳过无效自选股解读规则 %s: %s", rule.get("stock_code"), exc)
        return count

    async def _get_latest_digests_map(self, user_id: str) -> Dict[str, Dict[str, Any]]:
        db = await self._get_db()
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$sort": {"updated_at": -1, "generated_at": -1}},
            {"$group": {"_id": "$stock_code", "doc": {"$first": "$$ROOT"}}},
        ]
        rows = await db.watch_digests.aggregate(pipeline).to_list(length=None)
        return {row["_id"]: row["doc"] for row in rows}

    def _serialize_rule(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "stock_code": doc.get("stock_code"),
            "stock_name": doc.get("stock_name"),
            "market": doc.get("market", "A股"),
            "schedule_type": doc.get("schedule_type"),
            "schedule_label": SCHEDULE_LABELS.get(doc.get("schedule_type", ""), "未配置"),
            "cron_expr": doc.get("cron_expr"),
            "status": doc.get("status", "active"),
            "updated_at": self._serialize_datetime(doc.get("updated_at")),
        }

    def _serialize_datetime(self, value: Optional[datetime]) -> Optional[str]:
        if value is None:
            return None
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return str(value)

    def _risk_from_alerts(self, favorite: Dict[str, Any]) -> str:
        if favorite.get("alert_price_high") or favorite.get("alert_price_low"):
            return "关注"
        return "未解读"

    async def _sync_scheduler_job(self, rule: Optional[Dict[str, Any]]) -> None:
        if not rule:
            return

        user_id = rule.get("user_id")
        stock_code = rule.get("stock_code")
        if not user_id or not stock_code:
            return

        try:
            scheduler_service = get_scheduler_service()
        except RuntimeError:
            return

        job_id = self._build_job_id(user_id, stock_code)
        scheduler = scheduler_service.scheduler
        existing = scheduler.get_job(job_id)

        if rule.get("status") != "active":
            if existing:
                scheduler.remove_job(job_id)
            return

        trigger = self._build_trigger(rule.get("schedule_type"), rule.get("cron_expr"))
        scheduler.add_job(
            execute_watch_rule_job,
            trigger=trigger,
            id=job_id,
            name=f"自选股解读:{rule.get('stock_name') or stock_code}",
            replace_existing=True,
            kwargs={
                "user_id": user_id,
                "stock_code": stock_code,
                "stock_name": rule.get("stock_name") or stock_code,
                "market": rule.get("market", "A股"),
            },
        )

    async def _remove_scheduler_job(self, user_id: str, stock_code: str) -> None:
        try:
            scheduler_service = get_scheduler_service()
        except RuntimeError:
            return
        job_id = self._build_job_id(user_id, stock_code)
        if scheduler_service.scheduler.get_job(job_id):
            scheduler_service.scheduler.remove_job(job_id)

    def _build_job_id(self, user_id: str, stock_code: str) -> str:
        return f"watch_digest:{user_id}:{stock_code}"

    def _build_trigger(self, schedule_type: Optional[str], cron_expr: Optional[str]):
        if cron_expr:
            return CronTrigger.from_crontab(cron_expr, timezone=settings.TIMEZONE)
        if schedule_type == "daily_pre_market":
            return CronTrigger(day_of_week="mon-fri", hour=8, minute=30, timezone=settings.TIMEZONE)
        if schedule_type == "intra_day":
            return CronTrigger(day_of_week="mon-fri", hour="10-14", minute=0, timezone=settings.TIMEZONE)
        if schedule_type == "weekly_review":
            return CronTrigger(day_of_week="fri", hour=16, minute=0, timezone=settings.TIMEZONE)
        return CronTrigger(day_of_week="mon-fri", hour=15, minute=30, timezone=settings.TIMEZONE)


async def execute_watch_rule_job(user_id: str, stock_code: str, stock_name: str, market: str = "A股") -> None:
    await watch_digest_service.run_digest_refresh(
        task_id=None,
        user_id=user_id,
        stock_code=stock_code,
        stock_name=stock_name,
        market=market,
    )


watch_digest_service = WatchDigestService()
