from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, Deal, DealStatus, Milestone, Project, ProjectDocument, ProjectHealth, User
from app.schemas.projects import (
    MilestoneCreate,
    MilestoneResponse,
    MilestoneUpdate,
    PortalMilestoneResponse,
    ProjectCreate,
    ProjectDocumentResponse,
    ProjectPortalResponse,
    ProjectResponse,
    ProjectUpdate,
)
from app.services import project_health, storage

MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024


def _pagination(page: int, page_size: int) -> tuple[int, int]:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    return (page - 1) * page_size, page_size


def _not_found(entity: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity} not found")


async def _scalar_name(db: AsyncSession, statement) -> str | None:
    result = await db.execute(statement)
    return result.scalar_one_or_none()


async def _get_account(db: AsyncSession, account_id: UUID) -> Account:
    result = await db.execute(select(Account).where(Account.id == account_id, Account.is_active.is_(True)))
    account = result.scalar_one_or_none()
    if account is None:
        raise _not_found("Account")
    return account


async def _get_deal(db: AsyncSession, deal_id: UUID) -> Deal:
    result = await db.execute(select(Deal).where(Deal.id == deal_id, Deal.is_active.is_(True)))
    deal = result.scalar_one_or_none()
    if deal is None:
        raise _not_found("Deal")
    return deal


async def _sync_project_health(db: AsyncSession, project_id: UUID) -> None:
    result = await db.execute(select(Project).where(Project.id == project_id, Project.is_active.is_(True)))
    project = result.scalar_one_or_none()
    if project is not None:
        await project_health.update_single_project_health(db, project)


async def get_project_model(db: AsyncSession, project_id: UUID) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id, Project.is_active.is_(True)))
    project = result.scalar_one_or_none()
    if project is None:
        raise _not_found("Project")
    return project


async def _list_milestones(db: AsyncSession, project_id: UUID) -> list[Milestone]:
    result = await db.execute(
        select(Milestone).where(Milestone.project_id == project_id).order_by(Milestone.due_date.asc())
    )
    return list(result.scalars().all())


async def _list_document_models(db: AsyncSession, project_id: UUID) -> list[ProjectDocument]:
    result = await db.execute(
        select(ProjectDocument)
        .where(ProjectDocument.project_id == project_id)
        .order_by(ProjectDocument.created_at.desc())
    )
    return list(result.scalars().all())


def build_document_response(document: ProjectDocument) -> ProjectDocumentResponse:
    storage_key = document.storage_key or document.file_url
    filename = document.filename or document.name
    mime_type = document.mime_type or document.content_type
    download_url = storage.generate_presigned_download_url(storage_key) if storage_key else document.file_url

    return ProjectDocumentResponse(
        id=document.id,
        project_id=document.project_id,
        filename=filename,
        file_size=document.file_size,
        mime_type=mime_type,
        storage_key=storage_key,
        uploaded_by=document.uploaded_by,
        description=document.description,
        download_url=download_url,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


async def build_project_response(db: AsyncSession, project: Project) -> ProjectResponse:
    account_name = await _scalar_name(db, select(Account.name).where(Account.id == project.account_id))
    owner_name = await _scalar_name(db, select(User.full_name).where(User.id == project.owner_id))
    milestones = [MilestoneResponse.model_validate(item) for item in await _list_milestones(db, project.id)]
    documents = [build_document_response(item) for item in await _list_document_models(db, project.id)]

    return ProjectResponse(
        id=project.id,
        name=project.name,
        account_id=project.account_id,
        account_name=account_name,
        deal_id=project.deal_id,
        status=project.status,
        start_date=project.start_date,
        end_date=project.end_date,
        health=project.health,
        owner_id=project.owner_id,
        owner_name=owner_name,
        portal_token=project.portal_token,
        is_active=project.is_active,
        milestones=milestones,
        documents=documents,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


async def list_projects(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 20,
    health: ProjectHealth | None = None,
    owner_id: UUID | None = None,
    account_id: UUID | None = None,
) -> list[ProjectResponse]:
    offset, limit = _pagination(page, page_size)
    query = select(Project).where(Project.is_active.is_(True))

    if health:
        query = query.where(Project.health == health)
    if owner_id:
        query = query.where(Project.owner_id == owner_id)
    if account_id:
        query = query.where(Project.account_id == account_id)

    result = await db.execute(query.order_by(Project.created_at.desc()).offset(offset).limit(limit))
    return [await build_project_response(db, project) for project in result.scalars().all()]


async def create_project(db: AsyncSession, project_in: ProjectCreate, current_user: User) -> ProjectResponse:
    data = project_in.model_dump()
    data["owner_id"] = data.get("owner_id") or current_user.id
    data["portal_token"] = str(uuid4())

    await _get_account(db, data["account_id"])
    if data.get("deal_id") is not None:
        deal = await _get_deal(db, data["deal_id"])
        if deal.account_id != data["account_id"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project deal must belong to the selected account",
            )

    project = Project(**data)
    db.add(project)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project could not be created") from exc

    await db.refresh(project)
    return await build_project_response(db, project)


async def create_project_from_deal(db: AsyncSession, deal_id: UUID, current_user: User) -> ProjectResponse:
    deal = await _get_deal(db, deal_id)
    status_value = deal.status.value if hasattr(deal.status, "value") else str(deal.status)
    if status_value != DealStatus.won.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only closed-won deals can be converted to projects",
        )

    project = Project(
        name=deal.title,
        account_id=deal.account_id,
        deal_id=deal.id,
        status="active",
        start_date=date.today(),
        end_date=deal.expected_close,
        health=ProjectHealth.green,
        owner_id=current_user.id,
        portal_token=str(uuid4()),
    )
    db.add(project)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project could not be created") from exc

    await db.refresh(project)
    return await build_project_response(db, project)


async def get_project(db: AsyncSession, project_id: UUID) -> ProjectResponse:
    project = await get_project_model(db, project_id)
    return await build_project_response(db, project)


async def update_project(db: AsyncSession, project_id: UUID, project_in: ProjectUpdate) -> ProjectResponse:
    project = await get_project_model(db, project_id)
    update_data = project_in.model_dump(exclude_unset=True)

    for field_name, value in update_data.items():
        if field_name in {"name", "status", "start_date", "end_date", "health", "owner_id"} and value is None:
            continue
        setattr(project, field_name, value)

    await db.commit()
    await db.refresh(project)
    return await build_project_response(db, project)


async def archive_project(db: AsyncSession, project_id: UUID) -> None:
    project = await get_project_model(db, project_id)
    project.is_active = False
    await db.commit()


async def soft_delete_project(db: AsyncSession, project_id: UUID) -> None:
    await archive_project(db, project_id)


async def list_milestones(db: AsyncSession, project_id: UUID) -> list[MilestoneResponse]:
    await get_project_model(db, project_id)
    return [MilestoneResponse.model_validate(item) for item in await _list_milestones(db, project_id)]


async def add_milestone(
    db: AsyncSession,
    project_id: UUID,
    milestone_in: MilestoneCreate,
) -> MilestoneResponse:
    await get_project_model(db, project_id)
    milestone = Milestone(project_id=project_id, **milestone_in.model_dump())
    db.add(milestone)
    await db.flush()
    await _sync_project_health(db, project_id)
    await db.commit()
    await db.refresh(milestone)
    return MilestoneResponse.model_validate(milestone)


async def update_milestone(
    db: AsyncSession,
    project_id: UUID,
    milestone_id: UUID,
    milestone_in: MilestoneUpdate,
) -> MilestoneResponse:
    await get_project_model(db, project_id)
    milestone = await get_milestone_model(db, project_id, milestone_id)
    update_data = milestone_in.model_dump(exclude_unset=True)

    for field_name, value in update_data.items():
        if field_name in {"title", "due_date"} and value is None:
            continue
        setattr(milestone, field_name, value)

    await _sync_project_health(db, project_id)
    await db.commit()
    await db.refresh(milestone)
    return MilestoneResponse.model_validate(milestone)


async def complete_milestone(db: AsyncSession, project_id: UUID, milestone_id: UUID) -> MilestoneResponse:
    await get_project_model(db, project_id)
    milestone = await get_milestone_model(db, project_id, milestone_id)
    milestone.completed_at = datetime.now(timezone.utc)
    await _sync_project_health(db, project_id)
    await db.commit()
    await db.refresh(milestone)
    return MilestoneResponse.model_validate(milestone)


async def delete_milestone(db: AsyncSession, project_id: UUID, milestone_id: UUID) -> None:
    await get_project_model(db, project_id)
    milestone = await get_milestone_model(db, project_id, milestone_id)
    await db.delete(milestone)
    await _sync_project_health(db, project_id)
    await db.commit()


async def get_milestone_model(db: AsyncSession, project_id: UUID, milestone_id: UUID) -> Milestone:
    result = await db.execute(
        select(Milestone).where(Milestone.id == milestone_id, Milestone.project_id == project_id)
    )
    milestone = result.scalar_one_or_none()
    if milestone is None:
        raise _not_found("Milestone")
    return milestone


async def upload_document(
    db: AsyncSession,
    project_id: UUID,
    *,
    filename: str,
    content: bytes,
    mime_type: str | None,
    uploaded_by: UUID,
    description: str | None = None,
) -> ProjectDocumentResponse:
    await get_project_model(db, project_id)
    file_size = len(content)
    if file_size > MAX_DOCUMENT_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Project documents cannot exceed 20MB",
        )

    storage_key, download_url = await storage.upload_project_document(
        project_id=project_id,
        filename=filename,
        content=content,
        content_type=mime_type,
    )
    document = ProjectDocument(
        project_id=project_id,
        name=filename,
        file_url=download_url,
        content_type=mime_type,
        description=description,
        filename=filename,
        file_size=file_size,
        mime_type=mime_type,
        storage_key=storage_key,
        uploaded_by=uploaded_by,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return build_document_response(document)


async def list_documents(db: AsyncSession, project_id: UUID) -> list[ProjectDocumentResponse]:
    await get_project_model(db, project_id)
    return [build_document_response(item) for item in await _list_document_models(db, project_id)]


async def delete_document(db: AsyncSession, project_id: UUID, document_id: UUID) -> None:
    await get_project_model(db, project_id)
    result = await db.execute(
        select(ProjectDocument).where(
            ProjectDocument.id == document_id,
            ProjectDocument.project_id == project_id,
        )
    )
    document = result.scalar_one_or_none()
    if document is None:
        raise _not_found("Project document")
    await db.delete(document)
    await db.commit()


async def get_portal_project(db: AsyncSession, portal_token: UUID | str) -> ProjectPortalResponse:
    result = await db.execute(
        select(Project).where(
            Project.portal_token == str(portal_token),
            Project.is_active.is_(True),
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise _not_found("Project")

    account_name = await _scalar_name(db, select(Account.name).where(Account.id == project.account_id))
    milestones = [
        PortalMilestoneResponse(
            title=milestone.title,
            due_date=milestone.due_date,
            completed=milestone.completed_at is not None,
        )
        for milestone in await _list_milestones(db, project.id)
    ]

    return ProjectPortalResponse(
        project_name=project.name,
        account_name=account_name,
        health=project.health,
        milestones=milestones,
        status=project.status,
        start_date=project.start_date,
        end_date=project.end_date,
    )
