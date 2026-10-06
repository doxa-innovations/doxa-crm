from __future__ import annotations

from datetime import date
from io import BytesIO
from typing import Annotated
from uuid import UUID
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models import User
from app.schemas.reports import (
    ActivityVolumeRow,
    CustomReportRequest,
    CustomReportResponse,
    CustomerHealthRow,
    DashboardResponse,
    DealVelocityRow,
    ForecastMonthRow,
    LeadFunnelResponse,
    LeadResponseTimeRow,
    LeadVolumeRow,
    OverdueTaskRow,
    PipelineSummaryRow,
    QuotaRow,
    RenewalPipelineRow,
    SequencePerformanceRow,
    WinLossRow,
)
from app.services import reports as reports_service

async def get_report_db(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    currency: Annotated[str, Query(pattern="^[A-Z]{3}$")] = "USD",
):
    from app.services.report_scope import ReportSession
    return ReportSession(db, user, currency)


router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/pipeline-summary", response_model=list[PipelineSummaryRow])
async def get_pipeline_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
    pipeline_id: UUID | None = None,
    owner_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[PipelineSummaryRow]:
    return await reports_service.pipeline_summary(
        db,
        pipeline_id=pipeline_id,
        owner_id=owner_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/deal-velocity", response_model=list[DealVelocityRow])
async def get_deal_velocity(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
    pipeline_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[DealVelocityRow]:
    return await reports_service.deal_velocity(
        db,
        pipeline_id=pipeline_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/win-loss", response_model=list[WinLossRow])
async def get_win_loss(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
    group_by: Annotated[str, Query(pattern="^(owner|source|lost_reason)$")] = "owner",
    pipeline_id: UUID | None = None,
    owner_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[WinLossRow]:
    return await reports_service.win_loss(
        db,
        group_by=group_by,
        pipeline_id=pipeline_id,
        owner_id=owner_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/forecast", response_model=list[ForecastMonthRow])
async def get_forecast(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
    pipeline_id: UUID | None = None,
    owner_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[ForecastMonthRow]:
    return await reports_service.forecast(
        db,
        pipeline_id=pipeline_id,
        owner_id=owner_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/quota", response_model=list[QuotaRow])
async def get_quota(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[QuotaRow]:
    return await reports_service.quota(db, date_from=date_from, date_to=date_to)


@router.get("/lead-volume", response_model=list[LeadVolumeRow])
async def get_lead_volume(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: Annotated[str, Query(pattern="^(source|campaign|week|month)$")] = "source",
) -> list[LeadVolumeRow]:
    return await reports_service.lead_volume(db, date_from=date_from, date_to=date_to, group_by=group_by)


@router.get("/lead-funnel", response_model=LeadFunnelResponse)
async def get_lead_funnel(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
) -> LeadFunnelResponse:
    return await reports_service.lead_funnel(db)


@router.get("/lead-response-time", response_model=list[LeadResponseTimeRow])
async def get_lead_response_time(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
) -> list[LeadResponseTimeRow]:
    return await reports_service.lead_response_time(db)


@router.get("/activity-volume", response_model=list[ActivityVolumeRow])
async def get_activity_volume(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[ActivityVolumeRow]:
    return await reports_service.activity_volume(db, date_from=date_from, date_to=date_to)


@router.get("/overdue-tasks", response_model=list[OverdueTaskRow])
async def get_overdue_tasks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
) -> list[OverdueTaskRow]:
    return await reports_service.overdue_tasks(db)


@router.get("/sequence-performance", response_model=list[SequencePerformanceRow])
async def get_sequence_performance(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
) -> list[SequencePerformanceRow]:
    return await reports_service.sequence_performance(db)


@router.get("/customer-health", response_model=list[CustomerHealthRow])
async def get_customer_health(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
) -> list[CustomerHealthRow]:
    return await reports_service.customer_health(db)


@router.get("/renewal-pipeline", response_model=list[RenewalPipelineRow])
async def get_renewal_pipeline(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
) -> list[RenewalPipelineRow]:
    return await reports_service.renewal_pipeline(db)


@router.post("/custom", response_model=CustomReportResponse)
async def build_custom_report(
    report_in: CustomReportRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
) -> CustomReportResponse:
    return await reports_service.custom_report(db, report_in)


@router.post("/custom/export/xlsx")
async def export_custom_xlsx(
    report_in: CustomReportRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
) -> Response:
    report = await reports_service.custom_report(db, report_in)
    content = reports_service.rows_to_xlsx(f"{report_in.entity}-custom-report", report.columns, report.rows)
    filename = f"{report_in.entity}-custom-report.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
) -> DashboardResponse:
    return await reports_service.dashboard(db)


@router.get("/export/csv")
async def export_csv(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
    report: str,
) -> Response:
    columns, rows = await reports_service.report_rows_for_export(db, report, _parse_export_params(request))
    content = reports_service.rows_to_csv(columns, rows)
    filename = f"{report.replace('/', '-')}.csv"
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/xlsx")
async def export_xlsx(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
    report: str,
) -> Response:
    columns, rows = await reports_service.report_rows_for_export(db, report, _parse_export_params(request))
    content = reports_service.rows_to_xlsx(report, columns, rows)
    filename = f"{report.replace('/', '-')}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/pdf")
async def export_pdf(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_report_db)],
    report: str,
) -> Response:
    columns, rows = await reports_service.report_rows_for_export(db, report, _parse_export_params(request))
    content = _build_pdf(report, columns, rows)
    filename = f"{report.replace('/', '-')}.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _parse_export_params(request: Request) -> dict:
    params: dict = {}
    for key, value in request.query_params.items():
        if key == "report":
            continue
        if key in {"pipeline_id", "owner_id"}:
            params[key] = UUID(value)
        elif key in {"date_from", "date_to"}:
            params[key] = date.fromisoformat(value)
        else:
            params[key] = value
    return params


def _build_pdf(report: str, columns: list[str], rows: list[list]) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import landscape, letter
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    except Exception:
        return _fallback_pdf(report, columns, rows)

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(letter), leftMargin=24, rightMargin=24, topMargin=28, bottomMargin=28)
    styles = getSampleStyleSheet()
    if not columns:
        columns = ["No Data"]
        rows = []
    cell_style = ParagraphStyle(
        "ReportCell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7,
        leading=8,
        wordWrap="CJK",
    )
    header_style = ParagraphStyle(
        "ReportHeader",
        parent=cell_style,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#111827"),
    )
    column_count = max(len(columns), 1)
    column_widths = [doc.width / column_count] * column_count

    def pdf_cell(value, style):
        return Paragraph(escape("" if value is None else str(value)), style)

    def row_cells(row):
        padded = list(row[:column_count]) + [""] * max(column_count - len(row), 0)
        return [pdf_cell(value, cell_style) for value in padded]

    table_data = [[pdf_cell(column, header_style) for column in columns]] + [row_cells(row) for row in rows]
    table = Table(table_data, colWidths=column_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    doc.build([Paragraph(report.replace("-", " ").title(), styles["Title"]), Spacer(1, 12), table])
    return buffer.getvalue()


def _fallback_pdf(report: str, columns: list[str], rows: list[list]) -> bytes:
    text = reports_service.rows_to_csv(columns, rows)
    stream = f"{report}\n{text}".replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content = f"BT /F1 10 Tf 40 760 Td ({stream[:3000]}) Tj ET"
    pdf = (
        "%PDF-1.4\n"
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        "3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> "
        f"/MediaBox [0 0 612 792] /Contents 5 0 R >> endobj\n"
        "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        f"5 0 obj << /Length {len(content)} >> stream\n{content}\nendstream endobj\n"
        "xref\n0 6\n0000000000 65535 f \n"
        "trailer << /Root 1 0 R /Size 6 >>\nstartxref\n0\n%%EOF"
    )
    return pdf.encode("utf-8")
