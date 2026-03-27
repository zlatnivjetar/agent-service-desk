"use client"

import { useMemo, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock3,
  Settings2,
  TrendingUp,
} from "lucide-react"

import { useCurrentUser } from "@/hooks/use-current-user"
import { useDashboardPreferences } from "@/hooks/use-dashboard"
import { overviewCombinedQueryOptions } from "@/lib/actions/overview"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PageError } from "@/components/ui/page-error"
import {
  AgePriorityMatrix,
  BacklogByStatusChart,
  OverviewKpiCard,
  TicketsCreatedTrendChart,
  type KpiDelta,
} from "@/components/dashboard/overview-visuals"
import { BADGE_TONE_DOT_CLASSNAMES, getDashboardWatchlistStyle } from "@/lib/badge-styles"
import { formatDateTime } from "@/lib/format"
import {
  getDefaultRangePreset,
  getPreviousRangeBounds,
  getRangeBounds,
} from "@/lib/dashboard"
import { replaceUrl } from "@/lib/url-state"
import { cn } from "@/lib/utils"

function getCountDelta(
  current: number | undefined,
  previous: number | undefined,
  trend: "higher_is_worse" | "higher_is_better" = "higher_is_worse"
): KpiDelta | null {
  if (current == null || previous == null) return null
  const delta = current - previous
  if (delta === 0) return { label: "No change", tone: "neutral" }
  const improved = trend === "higher_is_better" ? delta > 0 : delta < 0
  return {
    label: `${delta > 0 ? "+" : "-"}${Math.abs(delta)} vs prev`,
    tone: improved ? "success" : "warning",
  }
}

function getAccuracyDelta(
  current: number | null | undefined,
  previous: number | null | undefined
): KpiDelta | null {
  if (current == null || previous == null) return null
  const delta = (current - previous) * 100
  if (Math.abs(delta) < 0.05) return { label: "No change", tone: "neutral" }
  return {
    label: `${delta > 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)} pts`,
    tone: delta > 0 ? "success" : "danger",
  }
}

export function OverviewMetricsSectionClient() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: user } = useCurrentUser()
  const preferencesQuery = useDashboardPreferences()

  const autoRefreshSeconds = preferencesQuery.data?.overview_auto_refresh_seconds ?? 30
  const timeZone = preferencesQuery.data?.time_zone ?? "browser"

  const range = getDefaultRangePreset(searchParams.get("range"))
  const fromValue = searchParams.get("from")
  const toValue = searchParams.get("to")
  const team = searchParams.get("team")
  const assigneeId = searchParams.get("assignee_id")
  const selectedStatus = searchParams.get("status")
  const selectedPriority = searchParams.get("priority")
  const selectedAgeBucket = searchParams.get("age_bucket")
  const compareMode = searchParams.get("compare") === "1"

  const rangeBounds = getRangeBounds(range, fromValue, toValue)
  const comparisonBounds = compareMode
    ? getPreviousRangeBounds(rangeBounds.from, rangeBounds.to)
    : null

  const overviewParams = useMemo(
    () => ({
      range,
      from: range === "custom" ? fromValue : undefined,
      to: range === "custom" ? toValue : undefined,
      team,
      assignee_id: assigneeId,
    }),
    [assigneeId, fromValue, range, team, toValue]
  )
  const comparisonParams = useMemo(
    () =>
      comparisonBounds
        ? {
            range: "custom",
            from: comparisonBounds.from,
            to: comparisonBounds.to,
            team,
            assignee_id: assigneeId,
          }
        : null,
    [assigneeId, comparisonBounds, team]
  )

  const overviewCombinedQuery = useQuery({
    ...overviewCombinedQueryOptions({ params: overviewParams, comparisonParams }),
    refetchInterval: autoRefreshSeconds > 0 ? autoRefreshSeconds * 1000 : false,
  })

  const chartsReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === "") {
        next.delete(key)
      } else {
        next.set(key, value)
      }
    })
    next.delete("page")
    const query = next.toString()
    replaceUrl(query ? `${pathname}?${query}` : pathname)
  }

  if (overviewCombinedQuery.isError) {
    return (
      <PageError
        message="Failed to load dashboard overview."
        onRetry={() => overviewCombinedQuery.refetch()}
      />
    )
  }

  const overview = overviewCombinedQuery.data?.overview
  const watchlistItems = overviewCombinedQuery.data?.watchlist.watchlist_items ?? []
  const kpis = overview?.kpis
  const comparisonOverview = overviewCombinedQuery.data?.comparisonOverview ?? null
  const comparisonKpis = comparisonOverview?.kpis
  const isRefreshing =
    overviewCombinedQuery.isPlaceholderData && overviewCombinedQuery.data != null

  return (
    <div className={cn("space-y-6 transition-opacity duration-200", isRefreshing && "opacity-70")}>
      <div className="flex items-center justify-between gap-2">
        <div />
        <div className="flex items-center gap-2">
          <Badge className="px-2 text-[11px]" dotClassName="bg-primary">
            Updated {overview ? formatDateTime(overview.generated_at, timeZone) : "just now"}
          </Badge>
          {isRefreshing ? (
            <Badge variant="secondary" className="px-2 text-[11px]">
              Updating
            </Badge>
          ) : null}
        </div>
      </div>

      <div
        className={`grid gap-4 ${user?.role === "team_lead" ? "xl:grid-cols-5" : "md:grid-cols-2 xl:grid-cols-4"}`}
      >
        <OverviewKpiCard
          title="Open work queue"
          value={kpis?.open_work_queue_count ?? 0}
          description="Open tickets in new, open, and pending states"
          icon={<TrendingUp className="size-4 text-primary" />}
          delta={
            compareMode
              ? getCountDelta(kpis?.open_work_queue_count, comparisonKpis?.open_work_queue_count)
              : null
          }
        />
        <OverviewKpiCard
          title="Pending review"
          value={kpis?.pending_review_count ?? 0}
          description="Drafts waiting for a human decision"
          icon={<Clock3 className="size-4 text-warning" />}
          delta={
            compareMode
              ? getCountDelta(kpis?.pending_review_count, comparisonKpis?.pending_review_count)
              : null
          }
        />
        <OverviewKpiCard
          title="Unassigned high/critical"
          value={kpis?.unassigned_high_critical_count ?? 0}
          description="Work items with elevated urgency and no owner"
          icon={<AlertTriangle className="size-4 text-destructive" />}
          delta={
            compareMode
              ? getCountDelta(
                  kpis?.unassigned_high_critical_count,
                  comparisonKpis?.unassigned_high_critical_count
                )
              : null
          }
        />
        <OverviewKpiCard
          title="Knowledge issues"
          value={kpis?.knowledge_issue_count ?? 0}
          description="Failed or stalled document ingestion jobs"
          icon={<BarChart3 className="size-4 text-info" />}
          delta={
            compareMode
              ? getCountDelta(
                  kpis?.knowledge_issue_count,
                  comparisonKpis?.knowledge_issue_count
                )
              : null
          }
        />
        {user?.role === "team_lead" ? (
          <OverviewKpiCard
            title="Latest eval"
            value={
              kpis?.latest_eval_summary?.accuracy != null
                ? `${(kpis.latest_eval_summary.accuracy * 100).toFixed(1)}%`
                : kpis?.latest_eval_summary?.status ?? "-"
            }
            description={
              kpis?.latest_eval_summary
                ? `${kpis.latest_eval_summary.eval_set_name} - ${kpis.latest_eval_summary.prompt_version_name}`
                : "No eval runs yet"
            }
            icon={<Settings2 className="size-4 text-primary" />}
            delta={
              compareMode
                ? getAccuracyDelta(
                    kpis?.latest_eval_summary?.accuracy,
                    comparisonKpis?.latest_eval_summary?.accuracy
                  )
                : null
            }
          />
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Tickets created by day</CardTitle>
            <CardDescription>
              {compareMode
                ? "Current volume with the previous period overlaid for context."
                : "Volume trend over the selected range."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartsReady ? (
              <TicketsCreatedTrendChart
                currentSeries={overview?.charts.tickets_created_by_day ?? []}
                previousSeries={comparisonOverview?.charts.tickets_created_by_day}
                compareEnabled={compareMode}
                timeZone={timeZone}
              />
            ) : (
              <ChartPlaceholder />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backlog by status</CardTitle>
            <CardDescription>Click a bar to filter the detail table.</CardDescription>
          </CardHeader>
          <CardContent>
            {chartsReady ? (
              <BacklogByStatusChart
                data={overview?.charts.backlog_by_status ?? []}
                selectedStatus={selectedStatus}
                onSelect={(status) =>
                  updateParams({ status, priority: null, age_bucket: null })
                }
              />
            ) : (
              <ChartPlaceholder />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ticket age by priority</CardTitle>
          <CardDescription>
            Open work queue broken into fixed age buckets and priority bands.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartsReady ? (
            <AgePriorityMatrix
              data={overview?.charts.age_by_priority ?? []}
              selectedPriority={selectedPriority}
              selectedAgeBucket={selectedAgeBucket}
              onSelect={(priority, bucket) =>
                updateParams({ priority, age_bucket: bucket, status: null })
              }
            />
          ) : (
            <ChartPlaceholder />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action center</CardTitle>
          <CardDescription>Only items with immediate follow-up appear here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {watchlistItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/35 px-4 py-6 text-center text-sm text-muted-foreground">
              No active watchlist items.
            </div>
          ) : (
            watchlistItems.map((item) => {
              const style = getDashboardWatchlistStyle(item.severity)

              return (
                <div
                  key={item.key}
                  className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card px-4 py-4 surface-shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{item.title}</span>
                      <Badge
                        dotClassName={cn(
                          BADGE_TONE_DOT_CLASSNAMES[style.tone],
                          style.dotClassName
                        )}
                        dotStyle={
                          style.dotColorVar ? { backgroundColor: style.dotColorVar } : undefined
                        }
                      >
                        {item.count}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.reason}</p>
                  </div>
                  <Link
                    href={item.href}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "cursor-pointer"
                    )}
                  >
                    Open
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ChartPlaceholder() {
  return <div className="h-full w-full animate-pulse rounded-lg bg-muted/35" />
}
