from fastapi import APIRouter

from app.routers.activities import router as activities_router
from app.routers.accounts import router as accounts_router
from app.routers.campaigns import router as campaigns_router
from app.routers.contacts import router as contacts_router
from app.routers.deals import router as deals_router
from app.routers.leads import router as leads_router
from app.routers.pipelines import router as pipelines_router
from app.routers.projects import portal_router, router as projects_router
from app.routers.reports import router as reports_router
from app.routers.search import router as search_router
from app.routers.sms_settings import router as sms_settings_router
from app.routers.tasks import router as tasks_router
from app.routers.users import router as users_router
from app.routers.webhooks import router as webhooks_router

api_router = APIRouter()
api_router.include_router(activities_router)
api_router.include_router(accounts_router)
api_router.include_router(campaigns_router)
api_router.include_router(contacts_router)
api_router.include_router(deals_router)
api_router.include_router(leads_router)
api_router.include_router(pipelines_router)
api_router.include_router(portal_router)
api_router.include_router(projects_router)
api_router.include_router(reports_router)
api_router.include_router(search_router)
api_router.include_router(sms_settings_router)
api_router.include_router(tasks_router)
api_router.include_router(users_router)
api_router.include_router(webhooks_router)

__all__ = ["api_router"]
