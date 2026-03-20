"""
OpenAI provider module.

Three operations:
1. classify() - structured output, returns typed JSON
2. embed() - text -> 1536-dim vector
3. generate_with_tools() - generation with tool calling
"""

from __future__ import annotations

import inspect
import json
import logging
import re
import time
from collections.abc import Callable
from typing import Any

import httpx
from openai import APIError, APITimeoutError, OpenAI, RateLimitError
from openai.types.responses import Response, ResponseFunctionToolCall

from app.config import settings

logger = logging.getLogger(__name__)

CLASSIFICATION_MODEL = "gpt-5-mini"
GENERATION_MODEL = "gpt-5-mini"
EMBEDDING_MODEL = "text-embedding-3-small"

EMBEDDING_DIMENSIONS = 1536
MAX_RETRIES = 3
MAX_EMBED_BATCH_SIZE = 100
MAX_TOOL_ROUNDS = 3
REQUEST_TIMEOUT_SECONDS = 10.0
GENERATION_MAX_OUTPUT_TOKENS = 500
GENERATION_REASONING_EFFORT = "minimal"

# Verified against OpenAI official pricing on 2026-03-14.
_USD_PER_MILLION_TOKENS: dict[str, dict[str, float]] = {
    "gpt-5-mini": {"input": 0.25, "output": 2.0},
    "text-embedding-3-small": {"input": 0.02, "output": 0.0},
}

client = OpenAI(api_key=settings.openai_api_key)


class ProviderError(RuntimeError):
    """Raised when the provider cannot complete a request."""


def classify(system_prompt: str, user_input: str, response_schema: dict[str, Any]) -> dict[str, Any]:
    if settings.mock_ai:
        return _mock_classify()
    started_at = time.perf_counter()
    response = _call_with_retries(
        operation="classify",
        model=CLASSIFICATION_MODEL,
        prompt_length=len(system_prompt) + len(user_input),
        fn=lambda: client.responses.create(
            model=CLASSIFICATION_MODEL,
            instructions=system_prompt,
            input=user_input,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "triage",
                    "strict": True,
                    "schema": response_schema,
                }
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        ),
    )
    _raise_for_response_error(response, operation="classify")

    raw_output = response.output_text.strip()
    if not raw_output:
        raise ProviderError("OpenAI classify returned no JSON output")

    try:
        result = json.loads(raw_output)
    except json.JSONDecodeError as exc:
        raise ProviderError("OpenAI classify returned invalid JSON") from exc

    if not isinstance(result, dict):
        raise ProviderError("OpenAI classify returned JSON that was not an object")

    token_usage = _response_usage_dict(response)
    return {
        "result": result,
        "latency_ms": _latency_ms(started_at),
        "token_usage": token_usage,
        "estimated_cost_cents": _estimate_cost_cents(CLASSIFICATION_MODEL, token_usage),
    }


def embed(text: str) -> list[float]:
    vectors = embed_batch([text])
    return vectors[0]


def embed_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    if settings.mock_ai:
        return _mock_embed_batch(texts)

    vectors: list[list[float]] = []
    for index in range(0, len(texts), MAX_EMBED_BATCH_SIZE):
        batch = texts[index : index + MAX_EMBED_BATCH_SIZE]
        response = _call_with_retries(
            operation="embed_batch",
            model=EMBEDDING_MODEL,
            prompt_length=sum(len(text) for text in batch),
            fn=lambda batch=batch: client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=batch,
                dimensions=EMBEDDING_DIMENSIONS,
                encoding_format="float",
                timeout=REQUEST_TIMEOUT_SECONDS,
            ),
        )

        for item in response.data:
            embedding = list(item.embedding)
            if len(embedding) != EMBEDDING_DIMENSIONS:
                raise ProviderError(
                    f"Expected {EMBEDDING_DIMENSIONS} embedding dimensions, got {len(embedding)}"
                )
            vectors.append(embedding)

    return vectors


def generate_with_tools(
    system_prompt: str,
    user_input: str,
    tools: list[dict[str, Any]],
    tool_executor: Callable[..., Any],
) -> dict[str, Any]:
    if settings.mock_ai:
        return _mock_generate_with_tools(tool_executor)
    started_at = time.perf_counter()
    usage_totals = _empty_usage()
    tool_calls_made: list[dict[str, Any]] = []

    response = _call_with_retries(
        operation="generate_with_tools",
        model=GENERATION_MODEL,
        prompt_length=len(system_prompt) + len(user_input),
        fn=lambda: client.responses.create(
            input=user_input,
            **_generation_request_kwargs(system_prompt, tools),
        ),
    )

    for round_index in range(MAX_TOOL_ROUNDS + 1):
        _raise_for_response_error(response, operation="generate_with_tools")
        usage_totals = _add_usage(usage_totals, _response_usage_dict(response))
        function_calls = _extract_function_calls(response)

        if not function_calls:
            content = response.output_text.strip()
            if not content:
                raise ProviderError("OpenAI generation completed without final content")
            return {
                "content": content,
                "tool_calls_made": tool_calls_made,
                "latency_ms": _latency_ms(started_at),
                "token_usage": usage_totals,
                "estimated_cost_cents": _estimate_cost_cents(GENERATION_MODEL, usage_totals),
            }

        if round_index >= MAX_TOOL_ROUNDS:
            raise ProviderError(
                f"OpenAI generation exceeded the {MAX_TOOL_ROUNDS} tool-round safety limit"
            )

        tool_outputs = []
        for function_call in function_calls:
            arguments = _parse_tool_arguments(function_call)
            output_value = _execute_tool_executor(tool_executor, function_call.name, arguments)
            normalized_output = _normalize_json_value(output_value)

            tool_calls_made.append(
                {
                    "call_id": function_call.call_id,
                    "name": function_call.name,
                    "arguments": arguments,
                    "output": normalized_output,
                }
            )
            tool_outputs.append(
                {
                    "type": "function_call_output",
                    "call_id": function_call.call_id,
                    "output": _tool_output_payload(normalized_output),
                }
            )

        previous_response_id = response.id
        response = _call_with_retries(
            operation="generate_with_tools",
            model=GENERATION_MODEL,
            prompt_length=sum(len(json.dumps(item, default=str)) for item in tool_outputs),
            fn=lambda tool_outputs=tool_outputs, previous_response_id=previous_response_id: client.responses.create(
                previous_response_id=previous_response_id,
                input=tool_outputs,
                **_generation_request_kwargs(system_prompt, tools),
            ),
        )

    raise ProviderError("OpenAI generation did not complete")


_CHUNK_ID_RE = re.compile(
    r"\[chunk:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]",
    re.IGNORECASE,
)


def _mock_classify() -> dict[str, Any]:
    return {
        "result": {
            "category": "billing",
            "urgency": "medium",
            "suggested_team": "billing_team",
            "escalation_suggested": False,
            "escalation_reason": None,
            "confidence": 0.87,
        },
        "latency_ms": 42,
        "token_usage": {"prompt_tokens": 120, "completion_tokens": 45, "total_tokens": 165},
        "estimated_cost_cents": 0.000041,
    }


def _mock_embed_batch(texts: list[str]) -> list[list[float]]:
    import numpy as np

    vectors = []
    for text in texts:
        seed = abs(hash(text)) % (2**31)
        rng = np.random.default_rng(seed)
        vectors.append(rng.random(EMBEDDING_DIMENSIONS).tolist())
    return vectors


def _mock_generate_with_tools(tool_executor: Callable[..., Any]) -> dict[str, Any]:
    # Call the real tool executor so retrieval is exercised end-to-end
    evidence_text = _execute_tool_executor(
        tool_executor, "search_knowledge", {"query": "billing refund policy"}
    )
    chunk_ids = _CHUNK_ID_RE.findall(evidence_text or "")

    mock_body = (
        "Thank you for reaching out. Based on our documentation, "
        "I can help clarify this for you."
    )
    if chunk_ids:
        mock_body += f" [chunk:{chunk_ids[0]}]"

    mock_content = json.dumps({
        "body": mock_body,
        "cited_evidence": chunk_ids[:3],
        "confidence": 0.82 if chunk_ids else 0.45,
        "unresolved_questions": [] if chunk_ids else ["No matching documentation found."],
        "send_ready": len(chunk_ids) > 0,
    })

    return {
        "content": mock_content,
        "tool_calls_made": [
            {
                "call_id": "mock-001",
                "name": "search_knowledge",
                "arguments": {"query": "billing refund policy"},
                "output": evidence_text,
            }
        ],
        "latency_ms": 210,
        "token_usage": {"prompt_tokens": 600, "completion_tokens": 180, "total_tokens": 780},
        "estimated_cost_cents": 0.031,
    }


def _generation_request_kwargs(
    system_prompt: str,
    tools: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "model": GENERATION_MODEL,
        "instructions": system_prompt,
        "tools": tools,
        # Tool-using GPT-5 requests default to medium reasoning, which is slow
        # enough to trip the 10s timeout in local draft generation.
        "reasoning": {"effort": GENERATION_REASONING_EFFORT},
        "parallel_tool_calls": False,
        "max_output_tokens": GENERATION_MAX_OUTPUT_TOKENS,
        "timeout": REQUEST_TIMEOUT_SECONDS,
    }


def _call_with_retries(
    *,
    operation: str,
    model: str,
    prompt_length: int,
    fn: Callable[[], Any],
) -> Any:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fn()
        except (RateLimitError, APITimeoutError, APIError) as exc:
            if not _should_retry(exc) or attempt == MAX_RETRIES:
                _log_provider_error(
                    operation=operation,
                    model=model,
                    prompt_length=prompt_length,
                    error=exc,
                    attempt=attempt,
                )
                raise ProviderError(f"OpenAI {operation} failed: {exc}") from exc

            _log_provider_error(
                operation=operation,
                model=model,
                prompt_length=prompt_length,
                error=exc,
                attempt=attempt,
                retrying=True,
            )
            _sleep_for_retry(attempt)


def _should_retry(exc: Exception) -> bool:
    if isinstance(exc, APITimeoutError):
        return True
    if isinstance(exc, RateLimitError):
        return _extract_error_code(exc) != "insufficient_quota"
    if isinstance(exc, APIError):
        status_code = getattr(exc, "status_code", None)
        return status_code in (None, 429) or status_code >= 500
    return False


def _sleep_for_retry(attempt: int) -> None:
    time.sleep(0.5 * (2 ** (attempt - 1)))


def _log_provider_error(
    *,
    operation: str,
    model: str,
    prompt_length: int,
    error: Exception,
    attempt: int,
    retrying: bool = False,
) -> None:
    logger.warning(
        "OpenAI provider error",
        extra={
            "operation": operation,
            "model": model,
            "prompt_length": prompt_length,
            "attempt": attempt,
            "retrying": retrying,
            "error_type": error.__class__.__name__,
            "error_message": str(error),
        },
    )


def _raise_for_response_error(response: Response, *, operation: str) -> None:
    if response.error is not None:
        raise ProviderError(f"OpenAI {operation} returned an error: {response.error.message}")


def _response_usage_dict(response: Response) -> dict[str, int]:
    if response.usage is None:
        return _empty_usage()
    return {
        "prompt_tokens": response.usage.input_tokens,
        "completion_tokens": response.usage.output_tokens,
        "total_tokens": response.usage.total_tokens,
    }


def _empty_usage() -> dict[str, int]:
    return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def _add_usage(left: dict[str, int], right: dict[str, int]) -> dict[str, int]:
    return {
        "prompt_tokens": left["prompt_tokens"] + right["prompt_tokens"],
        "completion_tokens": left["completion_tokens"] + right["completion_tokens"],
        "total_tokens": left["total_tokens"] + right["total_tokens"],
    }


def _estimate_cost_cents(model: str, token_usage: dict[str, int]) -> float:
    pricing = _USD_PER_MILLION_TOKENS.get(model)
    if pricing is None:
        return 0.0

    input_cost_usd = (token_usage["prompt_tokens"] / 1_000_000) * pricing["input"]
    output_cost_usd = (token_usage["completion_tokens"] / 1_000_000) * pricing["output"]
    return round((input_cost_usd + output_cost_usd) * 100, 6)


def _extract_function_calls(response: Response) -> list[ResponseFunctionToolCall]:
    return [item for item in response.output if item.type == "function_call"]


def _parse_tool_arguments(function_call: ResponseFunctionToolCall) -> dict[str, Any]:
    if not function_call.arguments:
        return {}

    try:
        parsed = json.loads(function_call.arguments)
    except json.JSONDecodeError as exc:
        raise ProviderError(
            f"OpenAI tool call {function_call.name} returned invalid JSON arguments"
        ) from exc

    if not isinstance(parsed, dict):
        raise ProviderError(
            f"OpenAI tool call {function_call.name} returned non-object arguments"
        )
    return parsed


def _execute_tool_executor(
    tool_executor: Callable[..., Any],
    name: str,
    arguments: dict[str, Any],
) -> Any:
    signature = inspect.signature(tool_executor)
    positional_params = [
        parameter
        for parameter in signature.parameters.values()
        if parameter.kind in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)
    ]
    has_varargs = any(
        parameter.kind == inspect.Parameter.VAR_POSITIONAL
        for parameter in signature.parameters.values()
    )

    if has_varargs or len(positional_params) >= 2:
        return tool_executor(name, arguments)
    return tool_executor({"name": name, "arguments": arguments})


def _normalize_json_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value

    if isinstance(value, list):
        return [_normalize_json_value(item) for item in value]

    if isinstance(value, dict):
        return {str(key): _normalize_json_value(item) for key, item in value.items()}

    return str(value)


def _tool_output_payload(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, default=str)


def _extract_error_code(error: Exception) -> str | None:
    code = getattr(error, "code", None)
    if isinstance(code, str):
        return code

    body = getattr(error, "body", None)
    if isinstance(body, dict):
        error_body = body.get("error")
        if isinstance(error_body, dict):
            nested_code = error_body.get("code")
            if isinstance(nested_code, str):
                return nested_code
    return None


def _latency_ms(started_at: float) -> int:
    return int((time.perf_counter() - started_at) * 1000)


def _timeout_error() -> APITimeoutError:
    return APITimeoutError(httpx.Request("POST", "https://api.openai.com/v1/responses"))
