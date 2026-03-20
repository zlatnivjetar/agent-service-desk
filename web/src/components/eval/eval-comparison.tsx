"use client"

import { CheckCircle2, XCircle } from "lucide-react"

import { useEvalComparison } from "@/hooks/use-evals"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { EvalRunDetail } from "@/types/api"

interface EvalComparisonProps {
  runAId: string
  runBId: string
}

function formatOutput(value: unknown): string {
  if (value == null) return "-"
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
    return entries.map(([k, v]) => `${k}: ${String(v)}`).join(", ")
  }
  return String(value)
}

function pct(value: number | null | undefined): string {
  if (value == null) return "-"
  return `${(value * 100).toFixed(1)}%`
}

function Delta({ a, b }: { a: number | null | undefined; b: number | null | undefined }) {
  if (a == null || b == null) return <span className="text-muted-foreground">-</span>
  const delta = b - a
  if (Math.abs(delta) < 0.0001) {
    return <span className="text-muted-foreground">+/-0%</span>
  }
  const sign = delta > 0 ? "+" : ""
  return (
    <span className={delta > 0 ? "text-success" : "text-destructive"}>
      {sign}
      {(delta * 100).toFixed(1)}%
    </span>
  )
}

function resultsDiffer(runA: EvalRunDetail, runB: EvalRunDetail, exampleId: string) {
  const rA = runA.results.find((r) => r.eval_example_id === exampleId)
  const rB = runB.results.find((r) => r.eval_example_id === exampleId)
  if (!rA || !rB) return false
  return rA.passed !== rB.passed
}

export function EvalComparisonView({ runAId, runBId }: EvalComparisonProps) {
  const { data, isLoading, isError } = useEvalComparison(runAId, runBId)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded" />
        <Skeleton className="h-64 w-full rounded" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <p className="py-10 text-center text-sm text-destructive">
        Failed to load comparison. Please try again.
      </p>
    )
  }

  const { run_a, run_b, metric_diff: md } = data

  const metricRows = [
    {
      label: "Classification Accuracy",
      a: md.accuracy_a,
      b: md.accuracy_b,
    },
    {
      label: "Routing Accuracy",
      a: md.routing_accuracy_a,
      b: md.routing_accuracy_b,
    },
    {
      label: "Citation Hit Rate",
      a: md.citation_hit_rate_a,
      b: md.citation_hit_rate_b,
    },
  ].filter((row) => row.a != null || row.b != null)

  // Build combined example list keyed by eval_example_id from run_a
  const exampleIds = run_a.results.map((r) => r.eval_example_id)

  return (
    <div className="space-y-6">
      {/* Run labels */}
      <div className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-4 text-center surface-shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Run A
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {run_a.eval_set_name} - {run_a.prompt_version_name}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Run B
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {run_b.eval_set_name} - {run_b.prompt_version_name}
          </p>
        </div>
      </div>

      {/* Metrics comparison panel */}
      {metricRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card surface-shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Run A</TableHead>
                <TableHead className="text-right">Run B</TableHead>
                <TableHead className="text-right">Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metricRows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right text-sm">{pct(row.a)}</TableCell>
                  <TableCell className="text-right text-sm">{pct(row.b)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    <Delta a={row.a} b={row.b} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Side-by-side example results */}
      {exampleIds.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card surface-shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">Input</TableHead>
                <TableHead className="text-center">Run A</TableHead>
                <TableHead className="text-center">Run B</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exampleIds.map((exId, idx) => {
                const rA = run_a.results.find((r) => r.eval_example_id === exId)
                const rB = run_b.results.find((r) => r.eval_example_id === exId)
                const differs = resultsDiffer(run_a, run_b, exId)

                return (
                  <TableRow
                    key={exId}
                    className={differs ? "bg-warning-soft" : undefined}
                  >
                    <TableCell className="max-w-[220px] truncate text-xs">
                      <span className="font-medium text-muted-foreground">
                        #{idx + 1}
                      </span>{" "}
                      <span className="font-mono text-foreground/70">
                        {formatOutput(rA?.expected_output ?? rB?.expected_output).slice(0, 50)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {rA ? (
                        <div className="flex flex-col items-center gap-1">
                          {rA.passed ? (
                            <CheckCircle2 className="size-4 text-success" />
                          ) : (
                            <XCircle className="size-4 text-destructive" />
                          )}
                          <span className="max-w-[140px] truncate font-mono text-xs text-muted-foreground">
                            {formatOutput(rA.model_output)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {rB ? (
                        <div className="flex flex-col items-center gap-1">
                          {rB.passed ? (
                            <CheckCircle2 className="size-4 text-success" />
                          ) : (
                            <XCircle className="size-4 text-destructive" />
                          )}
                          <span className="max-w-[140px] truncate font-mono text-xs text-muted-foreground">
                            {formatOutput(rB.model_output)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
