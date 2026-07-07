"""WhyMob CRM — FastAPI application bootstrap.

The app is composed of thin routers under /app/backend/routers/.
Shared infra lives in deps.py (mongo, jwt, security) and helpers.py (business helpers).
"""
import os
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from deps import mongo_client, logger
from seed import seed_startup
from scheduler import start_scheduler, stop_scheduler

from routers.auth_users import router as auth_users_router
from routers.master_data import router as master_data_router
from routers.pipeline import router as pipeline_router
from routers.finance import router as finance_router
from routers.analytics import router as analytics_router
from routers.technical import router as technical_router
from routers.exports_audit import router as exports_audit_router
from routers.notifications import router as notifications_router


app = FastAPI(title="WhyMob CRM API")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"service": "WhyMob CRM", "ok": True}


@api.get("/health")
async def health():
    """Health check com ping ao Mongo."""
    from deps import db
    from datetime import datetime, timezone
    result = {"status": "ok", "checked_at": datetime.now(timezone.utc).isoformat(), "mongo": "ok"}
    try:
        await db.command("ping")
    except Exception as e:
        result["status"] = "degraded"
        result["mongo"] = f"error: {str(e)[:120]}"
    return result


# Register all sub-routers under /api
for r in (
    auth_users_router,
    master_data_router,
    pipeline_router,
    finance_router,
    analytics_router,
    technical_router,
    exports_audit_router,
    notifications_router,
):
    api.include_router(r)


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    seed_enabled = os.environ.get("ENABLE_STARTUP_SEED", "true").lower() in ("1", "true", "yes")
    if seed_enabled:
        try:
            await seed_startup()
            logger.info("Seed OK")
        except Exception as e:
            logger.exception("Seed error: %s", e)
    else:
        logger.info("Seed disabled by ENABLE_STARTUP_SEED")
    start_scheduler()


@app.on_event("shutdown")
async def on_shutdown():
    stop_scheduler()
    mongo_client.close()
