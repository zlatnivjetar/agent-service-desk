"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { useDashboardPreferences } from "@/hooks/use-dashboard"
import { useTickets } from "@/hooks/use-tickets"
import { DataTable, DataTableEmpty, DataTablePagination } from "@/components/ui/data-table"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/ui/status-badges"
import { formatCategory, formatRelativeTime } from "@/lib/format"
import {
  DEFAULT_OVERVIEW_COLUMNS,
  getAgeBucketRange,
  getDefaultRangePreset,
  getRangeBounds,
} from "@/lib/dashboard"
import { replaceUrl } from "@/lib/url-state"

function maxDate(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

function minDate(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

export function OverviewTicketsSectionClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const preferencesQuery = useDashboardPreferences()

  const visibleColumns = preferencesQuery.data?.overview_visible_columns ?? DEFAULT_OVERVIEW_COLUMNS
  const density = preferencesQuery.data?.overview_density ?? "comfortable"
  const autoRefreshSeconds = preferencesQuery.data?.overview_auto_refresh_seconds ?? 30

  const range = getDefaultRangePreset(searchParams.get("range"))
  const fromValue = searchParams.get("from")
  const toValue = searchParams.get("to")
  const team = searchParams.get("team")
  const assigneeId = searchParams.get("assignee_id")
  const selectedStatus = searchParams.get("status")
  const selectedPriority = searchParams.get("priority")
  const selectedAgeBucket = searchParams.get("age_bucket")
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))

  const rangeBounds = getRangeBounds(range, fromValue, toValue)
  const ageBounds = selectedAgeBucket
    ? getAgeBucketRange(selectedAgeBucket, rangeBounds.to)
    : { from: null, to: null }
  const createdFrom = maxDate(rangeBounds.from, ageBounds.from)
  const createdTo = minDate(rangeBounds.to, ageBounds.to)

  const ticketsQuery = useTickets(
    {
      page,
      per_page: 10,
      status: selectedStatus,
      priority: selectedPriority,
      team,
      assignee_id: assigneeId,
      created_from: createdFrom,
      created_to: createdTo,
      sort_by: "created_at",
      sort_order: "desc",
    },
    { refetchInterval: autoRefreshSeconds > 0 ? autoRefreshSeconds * 1000 : false }
  )

  const tickets = ticketsQuery.data?.items ?? []
  const totalPages = ticketsQuery.data?.total_pages ?? 1

  const headCellClass = density === "compact" ? "h-8 px-3 text-xs" : undefined
  const bodyCellClass = density === "compact" ? "px-3 py-2 text-xs" : undefined

  function setPage(newPage: number) {
    const next = new URLSearchParams(searchParams.toString())
    next.set("page", String(newPage))
    replaceUrl(`${pathname}?${next.toString()}`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filtered ticket details</CardTitle>
        <CardDescription>
          Queue rows update from the overview filters and chart selections.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DataTable>
          <TableHeader>
            <TableRow>
              {visibleColumns.includes("subject") ? (
                <TableHead className={headCellClass}>Subject</TableHead>
              ) : null}
              {visibleColumns.includes("status") ? (
                <TableHead className={headCellClass}>Status</TableHead>
              ) : null}
              {visibleColumns.includes("priority") ? (
                <TableHead className={headCellClass}>Priority</TableHead>
              ) : null}
              {visibleColumns.includes("created") ? (
                <TableHead className={headCellClass}>Created</TableHead>
              ) : null}
              {visibleColumns.includes("assignee") ? (
                <TableHead className={headCellClass}>Assignee</TableHead>
              ) : null}
              {visibleColumns.includes("category") ? (
                <TableHead className={headCellClass}>Category</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.length === 0 ? (
              <DataTableEmpty
                colSpan={visibleColumns.length}
                message="No tickets match the current overview filters"
              />
            ) : (
              tickets.map((ticket) => (
                <TableRow
                  key={ticket.id}
                  className="group cursor-pointer"
                  onClick={() => router.push(`/tickets/${ticket.id}`)}
                >
                  {visibleColumns.includes("subject") ? (
                    <TableCell className={bodyCellClass}>
                      <span
                        className="block max-w-[34rem] truncate font-medium transition-colors duration-150 group-hover:text-primary"
                        title={ticket.subject}
                      >
                        {ticket.subject}
                      </span>
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes("status") ? (
                    <TableCell className={bodyCellClass}>
                      <TicketStatusBadge status={ticket.status} />
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes("priority") ? (
                    <TableCell className={bodyCellClass}>
                      <TicketPriorityBadge priority={ticket.priority} />
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes("created") ? (
                    <TableCell className={bodyCellClass}>
                      <span className="text-muted-foreground">
                        {formatRelativeTime(ticket.created_at)}
                      </span>
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes("assignee") ? (
                    <TableCell className={bodyCellClass}>
                      {ticket.assignee_name ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes("category") ? (
                    <TableCell className={bodyCellClass}>
                      <span className="text-muted-foreground">
                        {formatCategory(ticket.category)}
                      </span>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </DataTable>

        <DataTablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </CardContent>
    </Card>
  )
}
