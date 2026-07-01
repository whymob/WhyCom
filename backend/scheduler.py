"""APScheduler bootstrap — automated background jobs (daily alerts digest)."""
import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.mongodb import MongoDBJobStore

from deps import logger
from helpers import send_email_async, compute_alerts, build_alerts_digest_html


scheduler: AsyncIOScheduler | None = None


async def _job_send_alerts_digest():
    recipients_raw = os.environ.get("ALERTS_DIGEST_RECIPIENTS", "") or os.environ.get("ADMIN_EMAIL", "")
    recipients = [r.strip() for r in recipients_raw.split(",") if r.strip()]
    if not recipients:
        logger.info("[scheduler] alerts_digest: sem destinatários configurados — a saltar")
        return
    if not os.environ.get("RESEND_API_KEY"):
        logger.warning("[scheduler] alerts_digest: RESEND_API_KEY em falta — a saltar")
        return
    items = await compute_alerts()
    if not items:
        logger.info("[scheduler] alerts_digest: sem alertas ativos — nada a enviar")
        return
    subject = f"[WhyMob] {len(items)} alertas ativos"
    html = build_alerts_digest_html(items)
    for to in recipients:
        try:
            email = await send_email_async(to, subject, html)
            logger.info(f"[scheduler] alerts_digest enviado para {to} (id={email.get('id')})")
        except Exception as e:
            logger.error(f"[scheduler] alerts_digest falhou para {to}: {e}")


def _build_jobstores() -> dict:
    """Se JOBSTORE=mongodb, usa MongoDB (safe para multi-worker); caso contrário, in-memory."""
    if os.environ.get("JOBSTORE", "memory").lower() == "mongodb":
        try:
            store = MongoDBJobStore(
                database=os.environ["DB_NAME"],
                collection=os.environ.get("SCHEDULER_COLLECTION", "apscheduler_jobs"),
                host=os.environ["MONGO_URL"],
            )
            logger.info("[scheduler] jobstore: MongoDB")
            return {"default": store}
        except Exception as e:
            logger.error(f"[scheduler] falha a criar MongoDBJobStore, a usar memory: {e}")
    logger.info("[scheduler] jobstore: memory")
    return {}


def start_scheduler() -> AsyncIOScheduler | None:
    global scheduler
    if os.environ.get("SCHEDULER_ENABLED", "true").lower() not in ("1", "true", "yes"):
        logger.info("[scheduler] desativado via SCHEDULER_ENABLED")
        return None
    scheduler = AsyncIOScheduler(
        timezone=os.environ.get("SCHEDULER_TZ", "Europe/Lisbon"),
        jobstores=_build_jobstores(),
    )
    hour = int(os.environ.get("ALERTS_DIGEST_CRON_HOUR", "9"))
    minute = int(os.environ.get("ALERTS_DIGEST_CRON_MINUTE", "0"))
    day_of_week = os.environ.get("ALERTS_DIGEST_CRON_DOW", "mon-fri")
    scheduler.add_job(
        _job_send_alerts_digest,
        CronTrigger(hour=hour, minute=minute, day_of_week=day_of_week),
        id="alerts_digest",
        name="Daily alerts digest",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(f"[scheduler] iniciado — alerts_digest às {hour:02d}:{minute:02d} ({day_of_week}, TZ={scheduler.timezone})")
    return scheduler


def stop_scheduler():
    global scheduler
    if scheduler is not None:
        scheduler.shutdown(wait=False)
        scheduler = None
