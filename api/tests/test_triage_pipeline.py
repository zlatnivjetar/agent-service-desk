from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_current_user
from app.deps import get_rls_db
from app.pipelines import triage
from app.providers import ProviderError
from app.routers import tickets as tickets_router


@pytest.fixture
def tickets_client() -> TestClient:
    app = FastAPI()
    app.include_router(tickets_router.router, prefix="/tickets")
    client = TestClient(app)
    try:
        yield client
    finally:
        app.dependency_overrides.clear()
        client.close()


def test_run_triage_loads_prompt_classifies_and_inserts_prediction(monkeypatch: pytest.MonkeyPatch) -> None:
    ticket_id = str(uuid4())
    prompt_id = str(uuid4())
    created_at = datetime.now(UTC)
    captured: dict[str, object] = {}

    def fake_get_active_prompt_version(conn: object, prompt_type: str) -> dict[str, str]:
        captured["prompt_type"] = prompt_type
        return {"id": prompt_id, "content": "triage prompt"}

    def fake_get_ticket_triage_context(conn: object, requested_ticket_id: str) -> dict[str, str]:
        captured["ticket_id"] = requested_ticket_id
        return {
            "id": requested_ticket_id,
            "subject": "Invoice total is incorrect",
            "first_message_body": "We were charged twice for the same renewal.",
        }

    def fake_classify(
        *,
        system_prompt: str,
        user_input: str,
        response_schema: dict[str, object],
    ) -> dict[str, object]:
        captured["system_prompt"] = system_prompt
        captured["user_input"] = user_input
        captured["response_schema"] = response_schema
        return {
            "result": {
                "category": "billing",
                "urgency": "high",
                "suggested_team": "billing_team",
                "escalation_suggested": True,
                "escalation_reason": "Executive complaint",
                "confidence": 0.88,
            },
            "latency_ms": 612,
            "token_usage": {"prompt_tokens": 111, "completion_tokens": 22, "total_tokens": 133},
            "estimated_cost_cents": 0.004275,
        }

    def fake_insert_ticket_prediction(conn: object, **kwargs: object) -> dict[str, object]:
        captured["insert_kwargs"] = kwargs
        return {
            "id": str(uuid4()),
            "ticket_id": kwargs["ticket_id"],
            "prompt_version_id": kwargs["prompt_version_id"],
            "predicted_category": kwargs["predicted_category"],
            "predicted_priority": kwargs["predicted_priority"],
            "predicted_team": kwargs["predicted_team"],
            "escalation_suggested": kwargs["escalation_suggested"],
            "escalation_reason": kwargs["escalation_reason"],
            "confidence": kwargs["confidence"],
            "latency_ms": kwargs["latency_ms"],
            "token_usage": kwargs["token_usage"],
            "estimated_cost_cents": kwargs["estimated_cost_cents"],
            "created_at": created_at,
        }

    monkeypatch.setattr(triage.ticket_queries, "get_active_prompt_version", fake_get_active_prompt_version)
    monkeypatch.setattr(triage.ticket_queries, "get_ticket_triage_context", fake_get_ticket_triage_context)
    monkeypatch.setattr(triage.ticket_queries, "insert_ticket_prediction", fake_insert_ticket_prediction)
    monkeypatch.setattr(triage, "classify", fake_classify)

    result = triage.run_triage(conn=object(), ticket_id=ticket_id)

    assert captured["prompt_type"] == "triage"
    assert captured["ticket_id"] == ticket_id
    assert captured["system_prompt"] == "triage prompt"
    assert captured["user_input"] == (
        "Subject: Invoice total is incorrect\n\nBody: We were charged twice for the same renewal."
    )
    assert captured["response_schema"] == triage.TRIAGE_RESPONSE_SCHEMA
    assert captured["insert_kwargs"] == {
        "ticket_id": ticket_id,
        "prompt_version_id": prompt_id,
        "predicted_category": "billing",
        "predicted_priority": "high",
        "predicted_team": "billing_team",
        "escalation_suggested": True,
        "escalation_reason": "Executive complaint",
        "confidence": 0.88,
        "latency_ms": 612,
        "token_usage": {"prompt_tokens": 111, "completion_tokens": 22, "total_tokens": 133},
        "estimated_cost_cents": 0.004275,
    }
    assert result["predicted_category"] == "billing"
    assert result["latency_ms"] == 612


def test_run_triage_requires_active_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(triage.ticket_queries, "get_active_prompt_version", lambda *_: None)

    with pytest.raises(triage.TriagePromptNotConfiguredError):
        triage.run_triage(conn=object(), ticket_id=str(uuid4()))


def test_triage_endpoint_rejects_client_users(
    tickets_client: TestClient,
) -> None:
    app = tickets_client.app
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=str(uuid4()),
        org_id=str(uuid4()),
        workspace_id=str(uuid4()),
        role="client_user",
    )
    app.dependency_overrides[get_rls_db] = lambda: object()

    response = tickets_client.post(f"/tickets/{uuid4()}/triage")

    assert response.status_code == 403
    assert response.json() == {"detail": "Role 'client_user' cannot access this resource"}


def test_triage_endpoint_returns_prediction_record(
    tickets_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ticket_id = uuid4()
    prompt_id = uuid4()
    prediction_id = uuid4()

    app = tickets_client.app
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=str(uuid4()),
        org_id=str(uuid4()),
        workspace_id=str(uuid4()),
        role="support_agent",
    )
    app.dependency_overrides[get_rls_db] = lambda: object()

    monkeypatch.setattr(
        tickets_router,
        "run_triage",
        lambda conn, ticket_id: {
            "id": prediction_id,
            "ticket_id": ticket_id,
            "prompt_version_id": prompt_id,
            "predicted_category": "billing",
            "predicted_priority": "medium",
            "predicted_team": "billing_team",
            "escalation_suggested": False,
            "escalation_reason": None,
            "confidence": 0.77,
            "latency_ms": 420,
            "token_usage": {"prompt_tokens": 80, "completion_tokens": 10, "total_tokens": 90},
            "estimated_cost_cents": 0.0022,
            "created_at": datetime(2026, 3, 14, 10, 0, tzinfo=UTC),
        },
    )

    response = tickets_client.post(f"/tickets/{ticket_id}/triage")

    assert response.status_code == 201
    assert response.json() == {
        "id": str(prediction_id),
        "ticket_id": str(ticket_id),
        "prompt_version_id": str(prompt_id),
        "predicted_category": "billing",
        "predicted_priority": "medium",
        "predicted_team": "billing_team",
        "escalation_suggested": False,
        "escalation_reason": None,
        "confidence": 0.77,
        "latency_ms": 420,
        "token_usage": {"prompt_tokens": 80, "completion_tokens": 10, "total_tokens": 90},
        "estimated_cost_cents": 0.0022,
        "created_at": "2026-03-14T10:00:00Z",
    }


def test_triage_endpoint_maps_provider_failures_to_bad_gateway(
    tickets_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = tickets_client.app
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=str(uuid4()),
        org_id=str(uuid4()),
        workspace_id=str(uuid4()),
        role="team_lead",
    )
    app.dependency_overrides[get_rls_db] = lambda: object()

    def raise_provider_error(conn: object, ticket_id: str) -> dict[str, object]:
        raise ProviderError("OpenAI classify failed: upstream timeout")

    monkeypatch.setattr(tickets_router, "run_triage", raise_provider_error)

    response = tickets_client.post(f"/tickets/{uuid4()}/triage")

    assert response.status_code == 502
    assert response.json() == {"detail": "OpenAI classify failed: upstream timeout"}
