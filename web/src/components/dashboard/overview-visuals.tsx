"use client"

import type { ReactNode } from "react"
import { useMemo } from "react"
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Minus } from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { TicketPriorityBadge } from "@/components/ui/status-badges"
import {
  BADGE_TONE_DOT_CLASSNAMES,
  getTicketPriorityStyle,
  getTicketStatusStyle,
  type BadgeTone,
} from "@/lib/badge-styles"
import { formatAgeBucketLabel } from "@/lib/dashboard"
import { formatCategory, formatShortDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type {
  AgeByPriorityPoint,
  BacklogByStatusPoint,
  TicketPriority,
  TicketsCreatedPoint,
} from "@/types/api"

export type KpiDelta = {
  label: string
  tone: BadgeTone
}

type TrendChartPoint = {
  label: string
  currentDate: string
  currentCount: number
  previousDate?: string
  previousCount?: number
}

type BacklogChartPoint = BacklogByStatusPoint & {
  label: string
  fill: string
}

const PRIORITY_ROW_ORDER: TicketPriority[] = ["critical", "high", "medium", "low"]

function getTrendChartData(
  currentSeries: TicketsCreatedPoint[],
  previousSeries?: TicketsCreatedPoint[] | null,
  timeZone: "browser" | "UTC" = "browser"
) {
  return currentSeries.map((point, index) => ({
    label: formatShortDate(point.date, timeZone),
    currentDate: point.date,
    currentCount: point.count,
    previousDate: previousSeries?.[index]?.date,
    previousCount: previousSeries?.[index]?.count,
  }))
}

function getTrendSummary(series: TicketsCreatedPoint[]) {
  const total = series.reduce((sum, point) => sum + point.count, 0)
  const average = series.length > 0 ? total / series.length : 0
  const peak = series.reduce<TicketsCreatedPoint | null>((highest, point) => {
    if (!highest || point.count > highest.count) {
      return point
    }
    return highest
  }, null)

  return { total, average, peak }
}

function getMatrixIntensity(count: number, maxCount: number) {
  if (count <= 0 || maxCount <= 0) return 0
  return Math.min(0.7, 0.16 + (count / maxCount) * 0.48)
}

function formatAverage(value: number) {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(1)
}

function DeltaIcon({ tone, label }: KpiDelta) {
  if (label.startsWith("+")) {
    return (
      <ArrowUpRight
        aria-hidden="true"
        className={cn("size-3.5", BADGE_TONE_DOT_CLASSNAMES[tone].replace("bg-", "text-"))}
      />
    )
  }

  if (label.startsWith("-")) {
    return (
      <ArrowDownRight
        aria-hidden="true"
        className={cn("size-3.5", BADGE_TONE_DOT_CLASSNAMES[tone].replace("bg-", "text-"))}
      />
    )
  }

  return <Minus aria-hidden="true" className="size-3.5 text-muted-foreground" />
}

function DeltaBadge({ delta }: { delta: KpiDelta }) {
  return (
    <Badge
      className="h-7 gap-1.5 px-2.5 text-[11px]"
      dotClassName={BADGE_TONE_DOT_CLASSNAMES[delta.tone]}
    >
      <DeltaIcon {...delta} />
      {delta.label}
    </Badge>
  )
}

export function ComparisonToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean
  onToggle: (enabled: boolean) => void
}) {
  return (
    <Button
      type="button"
      variant={enabled ? "secondary" : "outline"}
      size="sm"
      aria-pressed={enabled}
      onClick={() => onToggle(!enabled)}
      className="cursor-pointer"
    >
      <ArrowLeftRight className="size-3.5" />
      Compare to previous
    </Button>
  )
}

export function OverviewKpiCard({
  title,
  value,
  description,
  icon,
  delta,
}: {
  title: string
  value: number | string
  description: string
  icon: ReactNode
  delta?: KpiDelta | null
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {delta ? <DeltaBadge delta={delta} /> : null}
          </div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-full border border-border/70 bg-muted/40 p-2.5">
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}

export function TicketsCreatedTrendChart({
  currentSeries,
  previousSeries,
  compareEnabled,
  timeZone = "browser",
}: {
  currentSeries: TicketsCreatedPoint[]
  previousSeries?: TicketsCreatedPoint[] | null
  compareEnabled: boolean
  timeZone?: "browser" | "UTC"
}) {
  const chartData = useMemo(
    () => getTrendChartData(currentSeries, previousSeries, timeZone),
    [currentSeries, previousSeries, timeZone]
  )
  const summary = useMemo(() => getTrendSummary(currentSeries), [currentSeries])
  const lastPoint = chartData.at(-1)

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-muted/25 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Total
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/25 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Avg / day
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {formatAverage(summary.average)}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/25 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Peak day
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {summary.peak ? `${summary.peak.count} on ${formatShortDate(summary.peak.date, timeZone)}` : "-"}
          </p>
        </div>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={chartData} margin={{ top: 18, right: 20, left: -18, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
              labelFormatter={(_, payload) => {
                const point = payload?.[0]?.payload as TrendChartPoint | undefined
                if (!point) return ""
                return formatShortDate(point.currentDate, timeZone)
              }}
              formatter={(value, name, props) => {
                const point = props.payload as TrendChartPoint
                const label =
                  name === "previousCount" && point.previousDate
                    ? `Previous (${formatShortDate(point.previousDate, timeZone)})`
                    : "Current"
                return [Number(value ?? 0), label] as [number, string]
              }}
            />
            <Area
              type="monotone"
              dataKey="currentCount"
              stroke="var(--primary)"
              fill="var(--primary)"
              fillOpacity={0.12}
              strokeWidth={2.5}
              activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
            />
            {compareEnabled && previousSeries?.length ? (
              <Line
                type="monotone"
                dataKey="previousCount"
                stroke="var(--neutral)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
              />
            ) : null}
            {lastPoint ? (
              <ReferenceDot
                x={lastPoint.label}
                y={lastPoint.currentCount}
                r={4}
                fill="var(--primary)"
                stroke="var(--card)"
                strokeWidth={2}
                label={{
                  value: lastPoint.currentCount,
                  position: "top",
                  fill: "var(--foreground)",
                  fontSize: 12,
                }}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function BacklogByStatusChart({
  data,
  selectedStatus,
  onSelect,
}: {
  data: BacklogByStatusPoint[]
  selectedStatus: string | null
  onSelect: (status: string) => void
}) {
  const chartData = useMemo<BacklogChartPoint[]>(
    () =>
      data.map((point) => {
        const style = getTicketStatusStyle(point.status)
        return {
          ...point,
          label: style.label,
          fill: style.colorVar ?? "var(--neutral)",
        }
      }),
    [data]
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Click a bar to focus the detail table.</span>
        {selectedStatus ? (
          <Badge className="h-7 px-2.5 text-[11px]">
            Focused: {formatCategory(selectedStatus)}
          </Badge>
        ) : null}
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 30, left: 18, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              horizontal={false}
            />
            <XAxis
              type="number"
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              width={122}
              tick={{ fill: "var(--foreground)", fontSize: 12 }}
            />
            <Tooltip
              formatter={(value) => [Number(value ?? 0), "Tickets"] as [number, string]}
              labelFormatter={(value) => String(value)}
            />
            <Bar
              dataKey="count"
              radius={[0, 10, 10, 0]}
              barSize={30}
              onClick={(entry) => {
                const datum = (entry as { payload?: BacklogByStatusPoint } | undefined)?.payload
                if (datum?.status) {
                  onSelect(datum.status)
                }
              }}
            >
              {chartData.map((point) => {
                const isSelected = selectedStatus === point.status
                const isDimmed = Boolean(selectedStatus) && !isSelected

                return (
                  <Cell
                    key={point.status}
                    fill={point.fill}
                    fillOpacity={isDimmed ? 0.28 : 0.92}
                    stroke={isSelected ? point.fill : "transparent"}
                    strokeWidth={isSelected ? 2 : 0}
                    cursor="pointer"
                  />
                )
              })}
              <LabelList
                dataKey="count"
                position="right"
                offset={8}
                className="fill-foreground text-xs font-medium"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function AgePriorityMatrix({
  data,
  selectedPriority,
  selectedAgeBucket,
  onSelect,
}: {
  data: AgeByPriorityPoint[]
  selectedPriority: string | null
  selectedAgeBucket: string | null
  onSelect: (priority: TicketPriority, bucket: AgeByPriorityPoint["bucket"]) => void
}) {
  const maxCount = useMemo(() => {
    return data.reduce((highest, bucket) => {
      return Math.max(
        highest,
        bucket.low,
        bucket.medium,
        bucket.high,
        bucket.critical
      )
    }, 0)
  }, [data])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
        <div className="grid grid-cols-[96px_repeat(5,minmax(0,1fr))] gap-2">
          <div />
          {data.map((bucket) => (
            <div
              key={bucket.bucket}
              className="flex items-center justify-center rounded-xl border border-border/60 bg-card/80 px-2 py-2 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
            >
              {formatAgeBucketLabel(bucket.bucket)}
            </div>
          ))}

          {PRIORITY_ROW_ORDER.map((priority) => {
            const priorityStyle = getTicketPriorityStyle(priority)

            return (
              <div key={priority} className="contents">
                <div className="flex items-center justify-start pr-1">
                  <TicketPriorityBadge priority={priority} />
                </div>
                {data.map((bucket) => {
                  const count = bucket[priority]
                  const isSelected =
                    selectedPriority === priority && selectedAgeBucket === bucket.bucket

                  return (
                    <button
                      key={`${priority}-${bucket.bucket}`}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${priorityStyle.label}, ${formatAgeBucketLabel(bucket.bucket)}, ${count} tickets`}
                      onClick={() => onSelect(priority, bucket.bucket)}
                      className={cn(
                        "group relative min-h-20 overflow-hidden rounded-xl border border-border/70 bg-card px-3 py-3 text-left transition-shadow",
                        "hover:surface-shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected && "border-foreground/20 ring-2 ring-primary/40"
                      )}
                    >
                      {count > 0 ? (
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 rounded-xl"
                          style={{
                            backgroundColor: priorityStyle.colorVar ?? "var(--neutral)",
                            opacity: getMatrixIntensity(count, maxCount),
                          }}
                        />
                      ) : null}
                      <div className="relative flex h-full flex-col justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          {priorityStyle.label}
                        </span>
                        <span className="text-2xl font-semibold tracking-tight text-foreground">
                          {count}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">Count intensity</span>
          {[0.2, 0.38, 0.58].map((opacity) => (
            <span
              key={opacity}
              aria-hidden="true"
              className="size-4 rounded-sm border border-border/60"
              style={{ backgroundColor: "var(--neutral)", opacity }}
            />
          ))}
          <span>lighter to darker = fewer to more tickets</span>
        </div>
        {selectedPriority && selectedAgeBucket ? (
          <Badge className="h-7 px-2.5 text-[11px]">
            Focused: {formatCategory(selectedPriority)} / {formatAgeBucketLabel(selectedAgeBucket)}
          </Badge>
        ) : null}
      </div>
    </div>
  )
}
