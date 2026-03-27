import { Fragment } from "react"
import { CheckCircle2, XCircle } from "lucide-react"

import { EvalRunRowControls } from "@/app/(app)/evals/eval-run-row-controls"
import { DataTable } from "@/components/ui/data-table"
import { EvalRunStatusBadge } from "@/components/ui/status-badges"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  fetchEvalRunDetail,
  fetchEvalRuns,
} from "@/lib/queries/evals"
import {
  getRouteParamValue,
  type RouteSearchParams,
} from "@/lib/route-params"
import { serverApiClient } from "@/lib/server-api-client"

function formatOutput(value: unknown): string {
  if (value == null) return "-"
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
    return entries.map(([key, item]) => `${key}: ${String(item)}`).join(", ")
  }
  return String(value)
}

function pct(value: number | null | undefined): string {
  if (value == null) return "-"
  return `${(value * 100).toFixed(1)}%`
}

function parseSelectedRunIds(value: string | null | undefined) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((runId) => runId.trim())
        .filter(Boolean)
    )
  ).slice(0, 2)
}

export async function EvalRunsSection({
  searchParams,
}: {
  searchParams: RouteSearchParams
}) {
  const selectedRunIds = parseSelectedRunIds(
    getRouteParamValue(searchParams.selected)
  )
  const expandedRunId = getRouteParamValue(searchParams.expanded)
  const runs = await fetchEvalRuns(serverApiClient)
  const expandedRun =
    expandedRunId != null
      ? runs.find(
          (run) => run.id === expandedRunId && run.status === "completed"
        ) ?? null
      : null
  const expandedDetail = expandedRun
    ? await fetchEvalRunDetail(expandedRun.id, serverApiClient)
    : null

  if (runs.length === 0) {
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
    <DataTable>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16" />
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
          const isExpanded = expandedDetail?.id === run.id
          const isSelected = selectedRunIds.includes(run.id)
          const selectionDisabled = !isSelected && selectedRunIds.length >= 2

          return (
            <Fragment key={run.id}>
              <TableRow>
                <TableCell className="px-3">
                  <EvalRunRowControls
                    runId={run.id}
                    isSelected={isSelected}
                    selectionDisabled={selectionDisabled}
                    isExpanded={isExpanded}
                    isExpandable={run.status === "completed"}
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
              </TableRow>
              {isExpanded && expandedDetail ? (
                <EvalRunDetailRow detail={expandedDetail} />
              ) : null}
            </Fragment>
          )
        })}
      </TableBody>
    </DataTable>
  )
}

function EvalRunDetailRow({
  detail,
}: {
  detail: Awaited<ReturnType<typeof fetchEvalRunDetail>>
}) {
  const metrics = detail.metrics ?? {}
  const hasAccuracy = metrics.accuracy != null
  const hasRouting = metrics.routing_accuracy != null
  const hasCitation = metrics.citation_hit_rate != null

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={8} className="px-6 py-4">
        <div className="mb-3 flex flex-wrap gap-4">
          {hasAccuracy ? (
            <div className="text-sm">
              <span className="font-medium text-foreground">Accuracy:</span>{" "}
              <span className="text-primary">{pct(metrics.accuracy)}</span>
            </div>
          ) : null}
          {hasRouting ? (
            <div className="text-sm">
              <span className="font-medium text-foreground">
                Routing Accuracy:
              </span>{" "}
              <span className="text-primary">
                {pct(metrics.routing_accuracy)}
              </span>
            </div>
          ) : null}
          {hasCitation ? (
            <div className="text-sm">
              <span className="font-medium text-foreground">
                Citation Hit Rate:
              </span>{" "}
              <span className="text-primary">
                {pct(metrics.citation_hit_rate)}
              </span>
            </div>
          ) : null}
          {!hasAccuracy && !hasRouting && !hasCitation ? (
            <p className="text-sm text-muted-foreground">
              No metrics computed yet.
            </p>
          ) : null}
        </div>

        {detail.results.length > 0 ? (
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
                {detail.results.map((result, index) => (
                  <TableRow
                    key={result.id}
                    className={
                      result.passed ? "bg-success/5" : "bg-destructive/5"
                    }
                  >
                    <TableCell className="max-w-[280px] truncate text-xs">
                      <span className="font-medium text-muted-foreground">
                        #{index + 1}
                      </span>{" "}
                      <span className="font-mono text-foreground/70">
                        {formatOutput(result.expected_output).slice(0, 60)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      -
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
                      {result.notes ? (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {result.notes}
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  )
}
