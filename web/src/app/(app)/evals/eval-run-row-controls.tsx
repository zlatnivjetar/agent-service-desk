"use client"

import { ChevronDown, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { replaceUrl } from "@/lib/url-state"

function parseSelectedRunIds(value: string | null) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((runId) => runId.trim())
        .filter(Boolean)
    )
  ).slice(0, 2)
}

function nextHref(params: URLSearchParams) {
  const query = params.toString()
  return query ? `/evals?${query}` : "/evals"
}

export function EvalRunRowControls({
  runId,
  isSelected,
  selectionDisabled,
  isExpanded,
  isExpandable,
}: {
  runId: string
  isSelected: boolean
  selectionDisabled: boolean
  isExpanded: boolean
  isExpandable: boolean
}) {
  function updateSelection(checked: boolean) {
    const params = new URLSearchParams(window.location.search)
    const selectedRunIds = parseSelectedRunIds(params.get("selected"))
    const nextSelectedRunIds = checked
      ? Array.from(new Set([...selectedRunIds, runId])).slice(0, 2)
      : selectedRunIds.filter((selectedRunId) => selectedRunId !== runId)

    if (nextSelectedRunIds.length > 0) {
      params.set("selected", nextSelectedRunIds.join(","))
    } else {
      params.delete("selected")
    }

    replaceUrl(nextHref(params))
  }

  function toggleExpanded() {
    const params = new URLSearchParams(window.location.search)

    if (isExpanded) {
      params.delete("expanded")
    } else {
      params.set("expanded", runId)
      if (!params.has("tab")) {
        params.set("tab", "runs")
      }
    }

    replaceUrl(nextHref(params))
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleExpanded}
        disabled={!isExpandable}
        className="size-8 cursor-pointer"
        aria-label={isExpanded ? "Collapse run details" : "Expand run details"}
      >
        {isExpanded ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
      </Button>
      <Checkbox
        checked={isSelected}
        disabled={selectionDisabled}
        onCheckedChange={(checked) => updateSelection(Boolean(checked))}
        className="cursor-pointer"
      />
    </div>
  )
}
