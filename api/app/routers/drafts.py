from datetime import datetime
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection

from app.auth import CurrentUser, get_current_user
from app.deps import get_rls_db
from app.queries import drafts as q
from app.schemas.common import PaginatedResponse
from app.schemas.drafts import ApprovalRequest, ApprovalResponse, DraftQueueItem

router = APIRouter()


def require_role(user: CurrentUser, allowed: list[str]) -> None:
    if user.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user.role}' cannot access this resource",
        )


@router.get("/review-queue", response_model=PaginatedResponse)
def get_review_queue(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    confidence_max: Optional[float] = Query(None, ge=0, le=1),
    created_before: Optional[datetime] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("asc"),
):
    require_role(user, ["support_agent", "team_lead"])
    total, rows = q.list_pending_drafts(
        db,
        page,
        per_page,
        confidence_max=confidence_max,
        created_before=created_before,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    items = [DraftQueueItem.model_validate(row) for row in rows]
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=(total + per_page - 1) // per_page,
    )


@router.post(
    "/{draft_id}/review",
    response_model=ApprovalResponse,
    status_code=status.HTTP_201_CREATED,
)
def review_draft(
    draft_id: UUID,
    body: ApprovalRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Connection, Depends(get_rls_db)],
):
    require_role(user, ["support_agent", "team_lead"])

    draft = q.get_draft(db, str(draft_id))
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")

    action_row = q.insert_approval_action(
        conn=db,
        draft_id=str(draft_id),
        acted_by=user.user_id,
        action=body.action,
        edited_body=body.edited_body,
        reason=body.reason,
    )

    q.update_draft_outcome(db, str(draft_id), body.action)

    if body.action in ("approved", "edited_and_approved"):
        q.update_ticket_status(db, str(draft["ticket_id"]), "pending_customer")

    return ApprovalResponse.model_validate(action_row)
