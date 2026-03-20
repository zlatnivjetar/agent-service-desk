from app.pipelines.drafting import _SEARCH_KNOWLEDGE_TOOL, _parse_draft_response


def test_search_knowledge_tool_uses_strict_schema() -> None:
    tool = _SEARCH_KNOWLEDGE_TOOL[0]

    assert tool["type"] == "function"
    assert tool["name"] == "search_knowledge"
    assert tool["strict"] is True
    assert tool["parameters"]["type"] == "object"
    assert tool["parameters"]["additionalProperties"] is False
    assert tool["parameters"]["required"] == ["query"]


def test_parse_draft_response_salvages_truncated_json_body() -> None:
    raw_content = (
        '{\n'
        '  "body": "Answer: I can investigate why the invoice shows an incorrect charge, '
        'but I need a few specific details from you to locate the invoice and reproduce the discrepancy.\\n\\n'
        'What I need from you (next steps):\\n'
        '- The invoice number or invoice PDF\\n'
        '- The organization or account ID\\n\\n'
        'If this demo ticket does not contain real production data, let me know and I\\u2019ll run the same'
    )

    parsed = _parse_draft_response(raw_content)

    assert parsed["body"].startswith("I can investigate why the invoice shows an incorrect charge")
    assert "What I need from you (next steps):" in parsed["body"]
    assert "I’ll run the same" in parsed["body"]
    assert not parsed["body"].startswith("Answer:")
    assert parsed["confidence"] == 0.5
    assert parsed["send_ready"] is False


def test_parse_draft_response_cleans_valid_body_prefix() -> None:
    parsed = _parse_draft_response(
        '{"body":"Short answer: Thanks for flagging this.\\n\\nPlease send the invoice number.",'
        '"cited_evidence":[],"confidence":0.72,"unresolved_questions":[],"send_ready":false}'
    )

    assert parsed["body"] == "Thanks for flagging this.\n\nPlease send the invoice number."
    assert parsed["confidence"] == 0.72
