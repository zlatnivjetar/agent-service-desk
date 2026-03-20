import json

import httpx
import pytest
from openai import OpenAI

from app.providers import openai as provider


def _require_api_key() -> None:
    if not provider.settings.openai_api_key:
        pytest.skip("OPENAI_API_KEY is required for OpenAI integration tests")


def _skip_on_unavailable_openai_account(exc: provider.ProviderError) -> None:
    if "insufficient_quota" in str(exc):
        pytest.skip("OpenAI account has no available quota for integration tests")
    raise exc


@pytest.mark.integration
def test_classify_returns_valid_triage_json() -> None:
    _require_api_key()

    triage_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "category": {"type": "string", "enum": ["billing", "technical", "account"]},
            "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
            "team": {"type": "string", "enum": ["support", "finance", "success"]},
            "escalation_suggested": {"type": "boolean"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": [
            "category",
            "priority",
            "team",
            "escalation_suggested",
            "confidence",
        ],
    }

    try:
        result = provider.classify(
            system_prompt=(
                "You triage support tickets for a B2B SaaS help desk. "
                "Return the best category, priority, owning team, escalation flag, and confidence."
            ),
            user_input="Invoice shows incorrect amount for our March renewal. Please fix this today.",
            response_schema=triage_schema,
        )
    except provider.ProviderError as exc:
        _skip_on_unavailable_openai_account(exc)

    assert result["result"]["category"] == "billing"
    assert result["result"]["team"] in {"finance", "support"}
    assert 0 <= result["result"]["confidence"] <= 1
    assert result["latency_ms"] > 0
    assert result["token_usage"]["total_tokens"] >= result["token_usage"]["prompt_tokens"]


@pytest.mark.integration
def test_embed_returns_1536_float_dimensions() -> None:
    _require_api_key()

    try:
        vector = provider.embed("Resetting two-factor authentication for a locked-out account")
    except provider.ProviderError as exc:
        _skip_on_unavailable_openai_account(exc)

    assert len(vector) == 1536
    assert all(isinstance(value, float) for value in vector)


@pytest.mark.integration
def test_generate_with_tools_completes_agentic_loop() -> None:
    _require_api_key()

    tools = [
        {
            "type": "function",
            "name": "search_knowledge",
            "description": "Search the knowledge base for relevant documentation",
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query for relevant knowledge",
                    }
                },
                "required": ["query"],
            },
        }
    ]

    def tool_executor(name: str, arguments: dict) -> dict:
        assert name == "search_knowledge"
        return {
            "results": [
                {
                    "title": "Refund policy",
                    "content": (
                        "Refunds for invoice discrepancies are handled by the finance team. "
                        "Agents should confirm the account ID and state that finance will review the invoice."
                    ),
                }
            ],
            "query": arguments["query"],
        }

    try:
        result = provider.generate_with_tools(
            system_prompt=(
                "You write concise, grounded support replies. "
                "You must call search_knowledge before answering."
            ),
            user_input="Customer says their invoice total looks wrong and wants to know next steps.",
            tools=tools,
            tool_executor=tool_executor,
        )
    except provider.ProviderError as exc:
        _skip_on_unavailable_openai_account(exc)

    assert result["content"]
    assert len(result["tool_calls_made"]) >= 1
    assert result["tool_calls_made"][0]["name"] == "search_knowledge"
    assert result["latency_ms"] > 0
    assert result["token_usage"]["total_tokens"] > 0


def test_classify_retries_after_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    class DummyUsage:
        input_tokens = 11
        output_tokens = 7
        total_tokens = 18

    class DummyResponse:
        def __init__(self) -> None:
            self.error = None
            self.output_text = (
                '{"category":"billing","priority":"high","team":"finance",'
                '"escalation_suggested":false,"confidence":0.92}'
            )
            self.usage = DummyUsage()

    class DummyResponsesClient:
        def __init__(self) -> None:
            self.calls = 0

        def create(self, **_: object) -> DummyResponse:
            self.calls += 1
            if self.calls == 1:
                raise provider._timeout_error()
            return DummyResponse()

    class DummyClient:
        def __init__(self) -> None:
            self.responses = DummyResponsesClient()

    monkeypatch.setattr(provider, "client", DummyClient())
    monkeypatch.setattr(provider, "_sleep_for_retry", lambda attempt: None)

    result = provider.classify(
        system_prompt="Return triage output.",
        user_input="Invoice shows incorrect amount",
        response_schema={
            "type": "object",
            "properties": {
                "category": {"type": "string"},
                "priority": {"type": "string"},
                "team": {"type": "string"},
                "escalation_suggested": {"type": "boolean"},
                "confidence": {"type": "number"},
            },
            "required": [
                "category",
                "priority",
                "team",
                "escalation_suggested",
                "confidence",
            ],
            "additionalProperties": False,
        },
    )

    assert result["result"]["category"] == "billing"


def test_generate_with_tools_completes_mocked_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    class DummyUsage:
        def __init__(self, input_tokens: int, output_tokens: int) -> None:
            self.input_tokens = input_tokens
            self.output_tokens = output_tokens
            self.total_tokens = input_tokens + output_tokens

    class DummyFunctionCall:
        type = "function_call"

        def __init__(self) -> None:
            self.call_id = "call_123"
            self.name = "search_knowledge"
            self.arguments = '{"query":"invoice mismatch"}'

    class DummyMessage:
        type = "message"

    class DummyResponse:
        def __init__(self, response_id: str, output: list, output_text: str, usage: DummyUsage) -> None:
            self.id = response_id
            self.error = None
            self.output = output
            self.output_text = output_text
            self.usage = usage

    class DummyResponsesClient:
        def __init__(self) -> None:
            self.calls = 0

        def create(self, **kwargs: object) -> DummyResponse:
            self.calls += 1
            if self.calls == 1:
                assert kwargs["input"] == "Customer says their invoice total is wrong."
                return DummyResponse(
                    "resp_1",
                    [DummyFunctionCall()],
                    "",
                    DummyUsage(20, 10),
                )

            assert kwargs["previous_response_id"] == "resp_1"
            assert len(kwargs["input"]) == 1
            tool_output = kwargs["input"][0]
            assert tool_output["type"] == "function_call_output"
            assert tool_output["call_id"] == "call_123"
            assert json.loads(tool_output["output"]) == {"results": ["finance doc"]}
            return DummyResponse(
                "resp_2",
                [DummyMessage()],
                "Finance will review the invoice discrepancy and follow up.",
                DummyUsage(15, 12),
            )

    class DummyClient:
        def __init__(self) -> None:
            self.responses = DummyResponsesClient()

    monkeypatch.setattr(provider, "client", DummyClient())

    result = provider.generate_with_tools(
        system_prompt="Use tools before answering.",
        user_input="Customer says their invoice total is wrong.",
        tools=[
            {
                "type": "function",
                "name": "search_knowledge",
                "description": "Search docs",
                "parameters": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
                "strict": True,
            }
        ],
        tool_executor=lambda name, arguments: {"results": ["finance doc"]},
    )

    assert result["content"].startswith("Finance will review")
    assert result["tool_calls_made"] == [
        {
            "call_id": "call_123",
            "name": "search_knowledge",
            "arguments": {"query": "invoice mismatch"},
            "output": {"results": ["finance doc"]},
        }
    ]
    assert result["token_usage"] == {
        "prompt_tokens": 35,
        "completion_tokens": 22,
        "total_tokens": 57,
    }


# ---------------------------------------------------------------------------
# HTTP-level transport tests
# ---------------------------------------------------------------------------
# The SDK-level mocks above stub out provider.client entirely, so they can't
# catch mistakes in the request JSON shape or response attribute access.
# These tests wire the real OpenAI SDK to a fake httpx transport so the full
# SDK serialization / deserialization path runs — without any network I/O.


class _ReplayTransport(httpx.BaseTransport):
    """Returns pre-crafted httpx.Response objects in order and records requests."""

    def __init__(self, responses: list[httpx.Response]) -> None:
        self._queue = list(responses)
        self.requests: list[httpx.Request] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        assert self._queue, f"_ReplayTransport: no response queued for {request.url}"
        self.requests.append(request)
        return self._queue.pop(0)


def _mock_openai_client(transport: _ReplayTransport) -> OpenAI:
    return OpenAI(api_key="test-key", http_client=httpx.Client(transport=transport))


def _text_response_http(
    text: str,
    *,
    resp_id: str = "resp_t1",
    model: str = "gpt-5-mini",
    input_tok: int = 100,
    output_tok: int = 20,
) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": resp_id,
            "object": "response",
            "created_at": 1710000000,
            "status": "completed",
            "model": model,
            "output": [
                {
                    "type": "message",
                    "id": "msg_t1",
                    "status": "completed",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": text, "annotations": []}],
                }
            ],
            "usage": {
                "input_tokens": input_tok,
                "output_tokens": output_tok,
                "total_tokens": input_tok + output_tok,
            },
            "error": None,
        },
    )


def _function_call_response_http(
    call_id: str,
    name: str,
    arguments: str,
    *,
    resp_id: str = "resp_fc1",
    input_tok: int = 80,
    output_tok: int = 15,
) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": resp_id,
            "object": "response",
            "created_at": 1710000001,
            "status": "completed",
            "model": "gpt-5.4",
            "output": [
                {
                    "type": "function_call",
                    "id": f"fc_{call_id}",
                    "call_id": call_id,
                    "name": name,
                    "arguments": arguments,
                    "status": "completed",
                }
            ],
            "usage": {
                "input_tokens": input_tok,
                "output_tokens": output_tok,
                "total_tokens": input_tok + output_tok,
            },
            "error": None,
        },
    )


def _embedding_response_http(vectors: list[list[float]]) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "object": "list",
            "data": [
                {"object": "embedding", "index": i, "embedding": vec}
                for i, vec in enumerate(vectors)
            ],
            "model": "text-embedding-3-small",
            "usage": {"prompt_tokens": 8, "total_tokens": 8},
        },
    )


_SIMPLE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {"category": {"type": "string"}},
    "required": ["category"],
}


def test_classify_sends_correct_request_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    transport = _ReplayTransport([_text_response_http('{"category": "billing"}')])
    monkeypatch.setattr(provider, "client", _mock_openai_client(transport))

    provider.classify(
        system_prompt="Triage this ticket.",
        user_input="Invoice shows incorrect amount.",
        response_schema=_SIMPLE_SCHEMA,
    )

    assert len(transport.requests) == 1
    req = transport.requests[0]
    assert req.url.path == "/v1/responses"
    body = json.loads(req.content)
    assert body["model"] == "gpt-5-mini"
    assert body["instructions"] == "Triage this ticket."
    assert body["input"] == "Invoice shows incorrect amount."
    fmt = body["text"]["format"]
    assert fmt["type"] == "json_schema"
    assert fmt["name"] == "triage"
    assert fmt["strict"] is True


def test_classify_parses_token_usage_and_cost(monkeypatch: pytest.MonkeyPatch) -> None:
    transport = _ReplayTransport([_text_response_http('{"category": "billing"}', input_tok=500, output_tok=50)])
    monkeypatch.setattr(provider, "client", _mock_openai_client(transport))

    result = provider.classify("triage", "invoice wrong", _SIMPLE_SCHEMA)

    assert result["token_usage"] == {"prompt_tokens": 500, "completion_tokens": 50, "total_tokens": 550}
    assert result["latency_ms"] >= 0
    # gpt-5-mini: 500 input @ $0.25/M + 50 output @ $2.00/M → cents
    expected = round(((500 / 1_000_000) * 0.25 + (50 / 1_000_000) * 2.0) * 100, 6)
    assert result["estimated_cost_cents"] == pytest.approx(expected)


def test_embed_sends_correct_request_and_parses_dimensions(monkeypatch: pytest.MonkeyPatch) -> None:
    vector = [round(i * 0.001, 6) for i in range(1536)]
    transport = _ReplayTransport([_embedding_response_http([vector])])
    monkeypatch.setattr(provider, "client", _mock_openai_client(transport))

    result = provider.embed("reset two-factor authentication")

    assert len(result) == 1536
    assert result[0] == pytest.approx(vector[0])
    req = transport.requests[0]
    assert req.url.path == "/v1/embeddings"
    body = json.loads(req.content)
    assert body["model"] == "text-embedding-3-small"
    assert body["dimensions"] == 1536
    assert body["encoding_format"] == "float"


def test_embed_batch_splits_into_batches_of_100(monkeypatch: pytest.MonkeyPatch) -> None:
    single_vec = [0.01] * 1536
    transport = _ReplayTransport([
        _embedding_response_http([single_vec] * 100),
        _embedding_response_http([single_vec]),
    ])
    monkeypatch.setattr(provider, "client", _mock_openai_client(transport))

    results = provider.embed_batch(["text"] * 101)

    assert len(results) == 101
    assert len(transport.requests) == 2
    assert len(json.loads(transport.requests[0].content)["input"]) == 100
    assert len(json.loads(transport.requests[1].content)["input"]) == 1


def test_generate_with_tools_threads_previous_response_id(monkeypatch: pytest.MonkeyPatch) -> None:
    # Round 1: model calls a tool. Round 2: model returns final text.
    fc = _function_call_response_http(
        "call_001", "search_knowledge", '{"query": "invoice policy"}',
        resp_id="resp_round1", input_tok=80, output_tok=15,
    )
    final = _text_response_http(
        "Finance will review the discrepancy.",
        model="gpt-5.4", resp_id="resp_round2", input_tok=120, output_tok=30,
    )
    transport = _ReplayTransport([fc, final])
    monkeypatch.setattr(provider, "client", _mock_openai_client(transport))

    result = provider.generate_with_tools(
        system_prompt="Answer using knowledge base.",
        user_input="Invoice total is wrong.",
        tools=[{
            "type": "function",
            "name": "search_knowledge",
            "description": "Search docs",
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        }],
        tool_executor=lambda name, args: {"results": ["Refunds go through finance."]},
    )

    assert len(transport.requests) == 2
    round1_body = json.loads(transport.requests[0].content)
    round2_body = json.loads(transport.requests[1].content)
    assert round1_body["reasoning"] == {"effort": "minimal"}
    assert round1_body["parallel_tool_calls"] is False
    assert round1_body["max_output_tokens"] == 500
    # SDK must thread the previous response ID for multi-turn context
    assert round2_body["previous_response_id"] == "resp_round1"
    assert round2_body["reasoning"] == {"effort": "minimal"}
    assert round2_body["parallel_tool_calls"] is False
    assert round2_body["max_output_tokens"] == 500
    tool_out = round2_body["input"][0]
    assert tool_out["type"] == "function_call_output"
    assert tool_out["call_id"] == "call_001"
    assert json.loads(tool_out["output"]) == {"results": ["Refunds go through finance."]}

    assert result["content"] == "Finance will review the discrepancy."
    assert result["tool_calls_made"][0]["name"] == "search_knowledge"
    assert result["tool_calls_made"][0]["arguments"] == {"query": "invoice policy"}
    # Token usage is accumulated across both rounds: 80+120 in, 15+30 out
    assert result["token_usage"] == {"prompt_tokens": 200, "completion_tokens": 45, "total_tokens": 245}


def test_classify_raises_provider_error_when_response_contains_error(monkeypatch: pytest.MonkeyPatch) -> None:
    # A 200 response with a non-null error field (Responses API failure mode)
    transport = _ReplayTransport([
        httpx.Response(200, json={
            "id": "resp_err",
            "object": "response",
            "created_at": 1710000000,
            "status": "failed",
            "model": "gpt-5-mini",
            "output": [],
            "usage": {"input_tokens": 10, "output_tokens": 0, "total_tokens": 10},
            "error": {"code": "server_error", "message": "Internal server error"},
        })
    ])
    monkeypatch.setattr(provider, "client", _mock_openai_client(transport))

    with pytest.raises(provider.ProviderError, match="returned an error"):
        provider.classify("triage", "test input", _SIMPLE_SCHEMA)
