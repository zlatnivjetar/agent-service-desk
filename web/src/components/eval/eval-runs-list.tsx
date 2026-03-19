"use client"

import { useState } from "react"
import { CheckCircle2, ChevronDown, ChevronUp, XCircle } from "lucide-react"

import { useEvalRuns, useEvalRunDetail } from "@/hooks/use-evals"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { DataTable } from "@/components/ui/data-table"
import { EvalRunStatusBadge } from "@/components/ui/status-badges"

interface EvalRunsListProps {
  selectedRunIds: string[]
  onSelectionChange: (ids: string[]) => void
  onCompare: () => void
}

function formatOutput(value: unknown): string {
  if (value == null) return "—"
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
    return entries.map(([k, v]) => `${k}: ${String(v)}`).join(", ")
  }
  return String(value)
}

function pct(value: number | null | undefined): string {
  if (value == null) return "—"
  return `${(value * 100).toFixed(1)}%`
}

function RunDetailRow({ runId }: { runId: string }) {
  const { data: detail, isLoading } = useEvalRunDetail(runId)
  const [examplesOpen, setExamplesOpen] = useState(false)

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={8} className="bg-muted/30 px-6 py-4">
          <Skeleton className="h-4 w-48" />
        </TableCell>
      </TableRow>
    )
  }

  if (!detail) return null

  const metrics = detail.metrics ?? {}
  const hasAccuracy = metrics.accuracy != null
  const hasRouting = metrics.routing_accuracy != null
  const hasCitation = metrics.citation_hit_rate != null

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={8} className="px-6 py-4">
        {/* Metrics summary */}
        <div className="mb-3 flex flex-wrap gap-4">
          {hasAccuracy && (
            <div className="text-sm">
              <span className="font-medium text-foreground">Accuracy:</span>{" "}
              <span className="text-[#0D9488]">
                {pct(metrics.accuracy)}
              </span>
            </div>
          )}
          {hasRouting && (
            <div className="text-sm">
              <span className="font-medium text-foreground">Routing Accuracy:</span>{" "}
              <span className="text-[#0D9488]">
                {pct(metrics.routing_accuracy)}
              </span>
            </div>
          )}
          {hasCitation && (
            <div className="text-sm">
              <span className="font-medium text-foreground">Citation Hit Rate:</span>{" "}
              <span className="text-[#0D9488]">
                {pct(metrics.citation_hit_rate)}
              </span>
            </div>
          )}
          {!hasAccuracy && !hasRouting && !hasCitation && (
            <p className="text-sm text-muted-foreground">No metrics computed yet.</p>
          )}
        </div>

        {/* Per-example results */}
        {detail.results.length > 0 && (
          <Collapsible open={examplesOpen} onOpenChange={setExamplesOpen}>
            <CollapsibleTrigger className="mb-2 inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground">
              {examplesOpen ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {examplesOpen ? "Hide" : "Show"} {detail.results.length} examples
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="overflow-x-auto rounded border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">Input</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Expected</TableHead>
                      <TableHead>Model Output</TableHead>
                      <TableHead className="w-16 text-center">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.results.map((result, idx) => (
                      <TableRow
                        key={result.id}
                        className={
                          result.passed
                            ? "bg-success/5"
                            : "bg-destructive/5"
                        }
                      >
                        <TableCell className="max-w-[280px] truncate text-xs">
                          <span className="font-medium text-muted-foreground">
                            #{idx + 1}
                          </span>{" "}
                          <span className="font-mono text-foreground/70">
                            {formatOutput(result.expected_output).slice(0, 60)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          —
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate font-mono text-xs">
                          {formatOutput(result.expected_output)}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate font-mono text-xs">
                          {formatOutput(result.model_output)}
                        </TableCell>
                        <TableCell className="text-center">
                          {result.passed ? (
                            <CheckCircle2 className="mx-auto size-4 text-success" />
                          ) : (
                            <XCircle className="mx-auto size-4 text-destructive" />
                          )}
                          {result.notes && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {result.notes}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </TableCell>
    </TableRow>
  )
}

export function EvalRunsList({
  selectedRunIds,
  onSelectionChange,
  onCompare,
}: EvalRunsListProps) {
  const { data: runs, isLoading } = useEvalRuns()
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  function toggleSelection(runId: string, checked: boolean) {
    if (checked) {
      if (selectedRunIds.length < 2) {
        onSelectionChange([...selectedRunIds, runId])
      }
    } else {
      onSelectionChange(selectedRunIds.filter((id) => id !== runId))
    }
  }

  function toggleExpand(runId: string) {
    setExpandedRunId((prev) => (prev === runId ? null : runId))
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded" />
        ))}
      </div>
    )
  }

  if (!runs || runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-base font-medium text-foreground">No runs yet</p>
        <p className="text-sm text-muted-foreground">
          Start an evaluation from the &quot;Run Evaluation&quot; tab.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {selectedRunIds.length === 2 && (
        <div className="flex items-center justify-between rounded-lg border border-[#0D9488]/30 bg-teal-50 px-4 py-2">
          <p className="text-sm font-medium text-[#0D9488]">
            2 runs selected for comparison
          </p>
          <Button
            size="sm"
            onClick={onCompare}
            className="cursor-pointer bg-[#0D9488] text-white hover:bg-[#0C837A]"
          >
            Compare
          </Button>
        </div>
      )}

      <DataTable>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Eval Set</TableHead>
            <TableHead>Prompt Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Passed</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            <TableHead className="text-right">Accuracy</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => {
            const isExpanded = expandedRunId === run.id
            const isChecked = selectedRunIds.includes(run.id)
            const checkDisabled =
              !isChecked &&
              selectedRunIds.length >= 2

            return [
              <TableRow
                key={run.id}
                className="cursor-pointer"
                onClick={() => toggleExpand(run.id)}
              >
                <TableCell
                  onClick={(e) => e.stopPropagation()}
                  className="px-3"
                >
                  <Checkbox
                    checked={isChecked}
                    disabled={checkDisabled}
                    onCheckedChange={(checked) =>
                      toggleSelection(run.id, !!checked)
                    }
                    className="cursor-pointer"
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {run.eval_set_name}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {run.prompt_version_name}
                </TableCell>
                <TableCell>
                  <EvalRunStatusBadge status={run.status} />
                </TableCell>
                <TableCell className="text-right text-sm font-medium text-success">
                  {run.passed}
                </TableCell>
                <TableCell className="text-right text-sm font-medium text-destructive">
                  {run.failed}
                </TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {pct(run.metrics?.accuracy)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(run.created_at).toLocaleDateString()}
                </TableCell>
              </TableRow>,
              isExpanded && run.status === "completed" ? (
                <RunDetailRow key={`${run.id}-detail`} runId={run.id} />
              ) : null,
            ]
          })}
        </TableBody>
      </DataTable>
    </div>
  )
}
