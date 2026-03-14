"""
Grounded drafting pipeline.

generate_draft() runs an agentic tool-calling loop:
1. Loads ticket context (subject, messages, active draft prompt)
2. Calls OpenAI with a search_knowledge tool definition
3. Model searches the knowledge base as many times as needed (up to MAX_TOOL_ROUNDS)
4. Model generates a reply with [chunk:UUID] citation markers
5. Parses and stores a draft_generations record
"""

from __future__ import annotations

import json
import re
import uuid as uuid_lib
from typing import Any

from psycopg import Connection

from app.pipelines.retrieval import search_knowledge
from app.providers import ProviderError, generate_with_tools
from app.queries import tickets as ticket_queries

_CHUNK_UUID_RE = re.compile(
    r"\[chunk:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]",
    re.IGNORECASE,
)

_SEARCH_KNOWLEDGE_TOOL: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "search_knowledge",
        "description": (
            "Search the knowledge base for relevant documentation to help answer "
            "the customer's question. Use specific, targeted queries."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "Search query — be specific "
                        "(e.g., 'refund policy for annual plans' not just 'refund')"
                    ),
                }
            },
            "required": ["query"],
        },
    }
]


class DraftTicketNotFoundError(LookupError):
    """Raised when the requested ticket is not visible in the current RLS scope."""


class DraftPromptNotConfiguredError(RuntimeError):
    """Raised when no active draft prompt is configured."""


def generate_draft(conn: Connection, ticket_id: str) -> dict[str, Any]:
    # 1. Load ticket context
    ticket = conn.execute(
        """
        SELECT id, subject, status, priority, category, workspace_id
        FROM tickets
        WHERE id = %s
        """,
        [ticket_id],
    ).fetchone()
    if ticket is None:
        raise DraftTicketNotFoundError(f"Ticket '{ticket_id}' not found")

    workspace_id = str(ticket["workspace_id"])

    # 2. Load all messages ordered chronologically
    messages = conn.execute(
        """
        SELECT sender_type, body
        FROM ticket_messages
        WHERE ticket_id = %s
        ORDER BY created_at ASC
        """,
        [ticket_id],
    ).fetchall()

    # 3. Get active draft prompt
    prompt_version = ticket_queries.get_active_prompt_version(conn, "draft")
    if prompt_version is None:
        raise DraftPromptNotConfiguredError("No active draft prompt version configured")

    # 4. Build user input string
    conversation_lines = "\n".join(
        f"[{msg['sender_type']}] {msg['body']}" for msg in messages
    )
    user_input = (
        f"Ticket Subject: {ticket['subject']}\n"
        f"Category: {ticket['category'] or 'unknown'}\n"
        f"Priority: {ticket['priority']}\n\n"
        f"Conversation:\n{conversation_lines}"
    )

    # 5. Tool executor — accumulates every retrieved chunk (deduped)
    retrieved_chunks: list[dict[str, Any]] = []

    def tool_executor(tool_name: str, tool_args: dict[str, Any]) -> str:
        if tool_name == "search_knowledge":
            chunks = search_knowledge(conn, workspace_id, tool_args["query"], top_k=5)
            seen_ids = {c["chunk_id"] for c in retrieved_chunks}
            for chunk in chunks:
                if chunk["chunk_id"] not in seen_ids:
                    retrieved_chunks.append(chunk)
                    seen_ids.add(chunk["chunk_id"])
            evidence_text = ""
            for chunk in chunks:
                evidence_text += (
                    f"\n[chunk:{chunk['chunk_id']}] "
                    f"(from: {chunk['document_title']})\n"
                    f"{chunk['content']}\n"
                )
            return evidence_text
        return "Unknown tool"

    # 6. Call the model
    result = generate_with_tools(
        system_prompt=prompt_version["content"],
        user_input=user_input,
        tools=_SEARCH_KNOWLEDGE_TOOL,
        tool_executor=tool_executor,
    )

    raw_content = result["content"]

    # 7. Parse the model response (expects JSON; falls back to plain text)
    body: str
    cited_chunk_ids: list[str]
    confidence: float
    unresolved_questions: list[str]
    send_ready: bool

    try:
        parsed = json.loads(raw_content)
        body = str(parsed.get("body", raw_content))
        confidence = float(parsed.get("confidence", 0.5))
        unresolved_questions = list(parsed.get("unresolved_questions", []))

        raw_cited: list[Any] = parsed.get("cited_evidence", [])
        cited_chunk_ids = []
        for ref in raw_cited:
            if isinstance(ref, str):
                ref = ref.replace("chunk:", "").strip()
                try:
                    uuid_lib.UUID(ref)
                    cited_chunk_ids.append(ref)
                except ValueError:
                    pass

        # Also capture any [chunk:UUID] markers embedded in the body text
        for bid in _CHUNK_UUID_RE.findall(body):
            if bid not in cited_chunk_ids:
                cited_chunk_ids.append(bid)

        model_send_ready = parsed.get("send_ready")
        if model_send_ready is not None:
            send_ready = bool(model_send_ready)
        else:
            send_ready = confidence >= 0.7 and len(cited_chunk_ids) > 0

    except (json.JSONDecodeError, TypeError, ValueError):
        body = raw_content
        cited_chunk_ids = _CHUNK_UUID_RE.findall(raw_content)
        confidence = 0.5
        unresolved_questions = []
        send_ready = False

    # Enforce: no cited evidence → send_ready must be false
    if not cited_chunk_ids:
        send_ready = False

    # 8. Store the draft_generations record
    draft = ticket_queries.insert_draft(
        conn=conn,
        ticket_id=ticket_id,
        prompt_version_id=str(prompt_version["id"]),
        body=body,
        evidence_chunk_ids=[uuid_lib.UUID(cid) for cid in cited_chunk_ids],
        confidence=confidence,
        unresolved_questions=unresolved_questions,
        send_ready=send_ready,
        latency_ms=result["latency_ms"],
        token_usage=result["token_usage"],
        estimated_cost_cents=result["estimated_cost_cents"],
    )

    # 9. Return the full draft record plus only the cited evidence chunks
    cited_set = set(cited_chunk_ids)
    evidence_chunks = [c for c in retrieved_chunks if c["chunk_id"] in cited_set]

    return {
        "draft": dict(draft),
        "evidence_chunks": evidence_chunks,
    }
