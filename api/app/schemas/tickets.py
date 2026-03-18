from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class TicketListItem(BaseModel):
    id: UUID
    subject: str
    status: str
    priority: str
    category: Optional[str] = None
    team: Optional[str] = None
    assignee_id: Optional[UUID] = None
    assignee_name: Optional[str] = None
    org_name: Optional[str] = None
    confidence: Optional[float] = None
    sla_policy_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TicketMessage(BaseModel):
    id: UUID
    sender_id: Optional[UUID] = None
    sender_name: Optional[str] = None
    sender_type: str
    body: str
    is_internal: bool
    created_at: datetime


class TicketPrediction(BaseModel):
    id: UUID
    predicted_category: Optional[str] = None
    predicted_priority: Optional[str] = None
    predicted_team: Optional[str] = None
    escalation_suggested: bool
    escalation_reason: Optional[str] = None
    confidence: float
    created_at: datetime


class TicketPredictionRecord(TicketPrediction):
    ticket_id: UUID
    prompt_version_id: UUID
    latency_ms: Optional[int] = None
    token_usage: Optional[dict[str, int]] = None
    estimated_cost_cents: Optional[float] = None


class EvidenceChunk(BaseModel):
    chunk_id: UUID
    document_id: UUID
    document_title: str
    content: str
    similarity: float
    chunk_index: int


class TicketDraft(BaseModel):
    id: UUID
    body: str
    evidence_chunk_ids: list[UUID]
    confidence: float
    unresolved_questions: Optional[list[str]] = None
    send_ready: bool
    approval_outcome: Optional[str] = None
    created_at: datetime


class DraftGenerationResponse(BaseModel):
    id: UUID
    ticket_id: UUID
    prompt_version_id: UUID
    body: str
    evidence_chunk_ids: list[UUID]
    confidence: float
    unresolved_questions: Optional[list[str]] = None
    send_ready: bool
    approval_outcome: Optional[str] = None
    latency_ms: Optional[int] = None
    token_usage: Optional[dict] = None
    estimated_cost_cents: Optional[float] = None
    created_at: datetime
    evidence_chunks: list[EvidenceChunk] = []


class TicketAssignment(BaseModel):
    id: UUID
    assigned_to: UUID
    assigned_by: Optional[UUID] = None
    team: Optional[str] = None
    created_at: datetime


class TicketDetail(TicketListItem):
    messages: list[TicketMessage] = []
    latest_prediction: Optional[TicketPrediction] = None
    latest_draft: Optional[TicketDraft] = None
    assignments: list[TicketAssignment] = []


class TicketUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[UUID] = None
    category: Optional[str] = None
    team: Optional[str] = None


class MessageCreate(BaseModel):
    body: str
    is_internal: bool = False


class AssignRequest(BaseModel):
    assignee_id: UUID
    team: Optional[str] = None


class TicketStats(BaseModel):
    total: int
    by_status: dict[str, int]
    by_priority: dict[str, int]
