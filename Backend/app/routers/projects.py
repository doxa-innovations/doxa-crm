from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import PROJECT_EDITOR_ROLES
from app.dependencies import get_current_user, get_db, require_role
from app.models import ProjectHealth, User
from app.schemas.projects import (
    MilestoneCreate,
    MilestoneResponse,
    MilestoneUpdate,
    ProjectCreate,
    ProjectDocumentResponse,
    ProjectPortalResponse,
    ProjectResponse,
    ProjectUpdate,
)
from app.middleware.rate_limit import PUBLIC_PORTAL_RATE_LIMIT, limiter
from app.services import projects as projects_service

router = APIRouter(prefix="/projects", tags=["Projects"])
portal_router = APIRouter(prefix="/portal", tags=["Customer Portal"])


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    health: ProjectHealth | None = None,
    owner_id: UUID | None = None,
    account_id: UUID | None = None,
) -> list[ProjectResponse]:
    return await projects_service.list_projects(
        db,
        page=page,
        page_size=page_size,
        health=health,
        owner_id=owner_id,
        account_id=account_id,
    )


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_in: ProjectCreate,
    current_user: Annotated[User, Depends(require_role(*PROJECT_EDITOR_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProjectResponse:
    return await projects_service.create_project(db, project_in, current_user)


@router.post("/from-deal/{deal_id}", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project_from_deal(
    deal_id: UUID,
    current_user: Annotated[User, Depends(require_role(*PROJECT_EDITOR_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProjectResponse:
    return await projects_service.create_project_from_deal(db, deal_id, current_user)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProjectResponse:
    return await projects_service.get_project(db, project_id)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    project_in: ProjectUpdate,
    current_user: Annotated[User, Depends(require_role(*PROJECT_EDITOR_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProjectResponse:
    return await projects_service.update_project(db, project_id, project_in)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    current_user: Annotated[User, Depends(require_role(*PROJECT_EDITOR_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await projects_service.archive_project(db, project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{project_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_project(
    project_id: UUID,
    current_user: Annotated[User, Depends(require_role(*PROJECT_EDITOR_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await projects_service.archive_project(db, project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/milestones", response_model=list[MilestoneResponse])
async def list_milestones(
    project_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MilestoneResponse]:
    return await projects_service.list_milestones(db, project_id)


@router.post("/{project_id}/milestones", response_model=MilestoneResponse, status_code=status.HTTP_201_CREATED)
async def add_milestone(
    project_id: UUID,
    milestone_in: MilestoneCreate,
    current_user: Annotated[User, Depends(require_role(*PROJECT_EDITOR_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MilestoneResponse:
    return await projects_service.add_milestone(db, project_id, milestone_in)


@router.patch("/{project_id}/milestones/{milestone_id}", response_model=MilestoneResponse)
async def update_milestone(
    project_id: UUID,
    milestone_id: UUID,
    milestone_in: MilestoneUpdate,
    current_user: Annotated[User, Depends(require_role(*PROJECT_EDITOR_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MilestoneResponse:
    return await projects_service.update_milestone(db, project_id, milestone_id, milestone_in)


@router.post("/{project_id}/milestones/{milestone_id}/complete", response_model=MilestoneResponse)
async def complete_milestone(
    project_id: UUID,
    milestone_id: UUID,
    current_user: Annotated[User, Depends(require_role(*PROJECT_EDITOR_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MilestoneResponse:
    return await projects_service.complete_milestone(db, project_id, milestone_id)


@router.delete("/{project_id}/milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_milestone(
    project_id: UUID,
    milestone_id: UUID,
    current_user: Annotated[User, Depends(require_role(*PROJECT_EDITOR_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await projects_service.delete_milestone(db, project_id, milestone_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{project_id}/documents", response_model=ProjectDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    project_id: UUID,
    current_user: Annotated[User, Depends(require_role(*PROJECT_EDITOR_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    description: str | None = Form(default=None),
) -> ProjectDocumentResponse:
    content = await file.read()
    return await projects_service.upload_document(
        db,
        project_id,
        filename=file.filename or "document",
        content=content,
        mime_type=file.content_type,
        uploaded_by=current_user.id,
        description=description,
    )


@router.get("/{project_id}/documents", response_model=list[ProjectDocumentResponse])
async def list_documents(
    project_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ProjectDocumentResponse]:
    return await projects_service.list_documents(db, project_id)


@router.delete("/{project_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    project_id: UUID,
    document_id: UUID,
    current_user: Annotated[User, Depends(require_role(*PROJECT_EDITOR_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await projects_service.delete_document(db, project_id, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@portal_router.get("/{portal_token}", response_model=ProjectPortalResponse)
@limiter.limit(PUBLIC_PORTAL_RATE_LIMIT)
async def get_portal_project(
    request: Request,
    portal_token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProjectPortalResponse:
    return await projects_service.get_portal_project(db, portal_token)
