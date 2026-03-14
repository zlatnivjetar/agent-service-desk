from __future__ import annotations

from typing import Any

from psycopg import Connection

from app.providers import classify
from app.queries import tickets as ticket_queries

TRIAGE_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "enum": [
                "billing",
                "bug_report",
                "feature_request",
                "account_access",
                "integration",
                "api_issue",
                "onboarding",
                "data_export",
            ],
        },
        "urgency": {
            "type": "string",
            "enum": ["low", "medium", "high", "critical"],
        },
        "suggested_team": {
            "type": "string",
            "enum": [
                "general_support",
                "billing_team",
                "engineering",
                "integrations",
                "onboarding",
                "account_management",
            ],
        },
        "escalation_suggested": {"type": "boolean"},
        "escalation_reason": {"type": ["string", "null"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
    "required": [
        "category",
        "urgency",
        "suggested_team",
        "escalation_suggested",
        "confidence",
    ],
    "additionalProperties": False,
}


class TriageTicketNotFoundError(LookupError):
    """Raised when the requested ticket is not visible in the current RLS scope."""


class TriagePromptNotConfiguredError(RuntimeError):
    """Raised when no active triage prompt is configured."""


def run_triage(conn: Connection, ticket_id: str) -> dict[str, Any]:
    prompt = ticket_queries.get_active_prompt_version(conn, "triage")
    if prompt is None:
        raise TriagePromptNotConfiguredError("Active triage prompt is not configured")

    ticket_context = ticket_queries.get_ticket_triage_context(conn, ticket_id)
    if ticket_context is None:
        raise TriageTicketNotFoundError(f"Ticket '{ticket_id}' not found")

    subject = ticket_context["subject"]
    body = ticket_context["first_message_body"] or ""

    provider_response = classify(
        system_prompt=prompt["content"],
        user_input=f"Subject: {subject}\n\nBody: {body}",
        response_schema=TRIAGE_RESPONSE_SCHEMA,
    )

    prediction = provider_response["result"]
    return ticket_queries.insert_ticket_prediction(
        conn=conn,
        ticket_id=ticket_id,
        prompt_version_id=str(prompt["id"]),
        predicted_category=prediction["category"],
        predicted_priority=prediction["urgency"],
        predicted_team=prediction["suggested_team"],
        escalation_suggested=prediction["escalation_suggested"],
        escalation_reason=prediction.get("escalation_reason"),
        confidence=float(prediction["confidence"]),
        latency_ms=provider_response["latency_ms"],
        token_usage=provider_response["token_usage"],
        estimated_cost_cents=provider_response["estimated_cost_cents"],
    )
