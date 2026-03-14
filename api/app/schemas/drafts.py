from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, model_validator


class DraftQueueItem(BaseModel):
    draft_generation_id: UUID
    ticket_id: UUID
    ticket_subject: str
    body: str  # truncated to 200 chars
    confidence: float
    approval_outcome: Optional[str] = None
    time_since_generation: float  # seconds
    created_at: datetime


class ApprovalRequest(BaseModel):
    action: Literal["approved", "edited_and_approved", "rejected", "escalated"]
    edited_body: Optional[str] = None
    reason: Optional[str] = None

    @model_validator(mode="after")
    def edited_body_required_for_edit_action(self) -> "ApprovalRequest":
        if self.action == "edited_and_approved" and not self.edited_body:
            raise ValueError("edited_body is required when action is 'edited_and_approved'")
        return self


class ApprovalResponse(BaseModel):
    id: UUID
    action: str
    acted_by: UUID
    reason: Optional[str] = None
    created_at: datetime
