from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection

from app.auth import CurrentUser, get_current_user
from app.deps import get_rls_db
from app.pipelines import (
    DraftPromptNotConfiguredError,
    DraftTicketNotFoundError,
    TriagePromptNotConfiguredError,
    TriageTicketNotFoundError,
    generate_draft,
    run_triage,
)
from app.providers import ProviderError
from app.queries import tickets as q
from app.schemas.common import PaginatedResponse
from app.schemas.tickets import (
    AssignRequest,
    DraftGenerationResponse,
    EvidenceChunk,
    MessageCreate,
    TicketAssignment,
    TicketDetail,
    TicketDraft,
    TicketListItem,
    TicketMessage,
    TicketPrediction,
    TicketPredictionRecord,
    TicketUpdate,
)

router = APIRouter()


def require_role(user: CurrentUser, allowed: list[str]) -> None:
    if user.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user.role}' cannot access this resource",
        )


def _build_detail(ticket: dict, conn: Connection) -> TicketDetail:
    ticket_id = str(ticket["id"])
    messages = q.get_ticket_messages(conn, ticket_id)
    prediction = q.get_latest_prediction(conn, ticket_id)
    draft = q.get_latest_draft(conn, ticket_id)
    assignments = q.get_ticket_assignments(conn, ticket_id)

    return TicketDetail(
        **ticket,
        messages=[TicketMessage.model_validate(m) for m in messages],
        latest_prediction=TicketPrediction.model_validate(prediction) if prediction else None,
        latest_draft=TicketDraft.model_validate(draft) if draft else None,
        assignments=[TicketAssignment.model_validate(a) for a in assignments],
    )


@router.get("", response_model=PaginatedResponse)
def list_tickets(
    db: Annotated[Connection, Depends(get_rls_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    assignee_id: Optional[UUID] = Query(None),
    category: Optional[str] = Query(None),
    team: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
):
    total, rows = q.list_tickets(
        conn=db,
        page=page,
        per_page=per_page,
        status=status,
        priority=priority,
        assignee_id=str(assignee_id) if assignee_id else None,
        category=category,
        team=team,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    items = [TicketListItem.model_validate(row) for row in rows]
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=(total + per_page - 1) // per_page,
    )


@router.get("/{ticket_id}", response_model=TicketDetail)
def get_ticket(
    ticket_id: UUID,
    db: Annotated[Connection, Depends(get_rls_db)],
):
    ticket = q.get_ticket(db, str(ticket_id))
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return _build_detail(dict(ticket), db)


@router.patch("/{ticket_id}", response_model=TicketDetail)
def update_ticket(
    ticket_id: UUID,
    body: TicketUpdate,
    db: Annotated[Connection, Depends(get_rls_db)],
):
    updates = body.model_dump(exclude_none=True)
    ticket = q.update_ticket(db, str(ticket_id), updates)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return _build_detail(dict(ticket), db)


@router.post(
    "/{ticket_id}/messages",
    response_model=TicketMessage,
    status_code=status.HTTP_201_CREATED,
)
def create_message(
    ticket_id: UUID,
    body: MessageCreate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    sender_type = "customer" if user.role == "client_user" else "agent"
    message = q.insert_message(
        conn=db,
        ticket_id=str(ticket_id),
        sender_id=user.user_id,
        sender_type=sender_type,
        body=body.body,
        is_internal=body.is_internal,
    )
    return TicketMessage.model_validate(message)


@router.post("/{ticket_id}/assign", response_model=TicketDetail)
def assign_ticket(
    ticket_id: UUID,
    body: AssignRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    ticket = q.assign_ticket(
        conn=db,
        ticket_id=str(ticket_id),
        assignee_id=str(body.assignee_id),
        assigned_by=user.user_id,
        team=body.team,
    )
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return _build_detail(dict(ticket), db)


@router.post(
    "/{ticket_id}/triage",
    response_model=TicketPredictionRecord,
    status_code=status.HTTP_201_CREATED,
)
def triage_ticket(
    ticket_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_role(user, ["support_agent", "team_lead"])

    try:
        prediction = run_triage(db, str(ticket_id))
    except TriageTicketNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    except TriagePromptNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    except ProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return TicketPredictionRecord.model_validate(prediction)


def _run_draft(ticket_id: UUID, user: CurrentUser, db: Connection) -> DraftGenerationResponse:
    require_role(user, ["support_agent", "team_lead"])
    try:
        result = generate_draft(db, str(ticket_id))
    except DraftTicketNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    except DraftPromptNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    except ProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    draft_data = dict(result["draft"])
    draft_data["evidence_chunks"] = [
        EvidenceChunk.model_validate(c) for c in result["evidence_chunks"]
    ]
    return DraftGenerationResponse.model_validate(draft_data)


@router.post(
    "/{ticket_id}/draft",
    response_model=DraftGenerationResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_ticket_draft(
    ticket_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    return _run_draft(ticket_id, user, db)


@router.post(
    "/{ticket_id}/redraft",
    response_model=DraftGenerationResponse,
    status_code=status.HTTP_201_CREATED,
)
def redraft_ticket(
    ticket_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    return _run_draft(ticket_id, user, db)
