"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronUp } from "lucide-react"

import { useCurrentUser } from "@/hooks/use-current-user"
import { useDashboardPreferences } from "@/hooks/use-dashboard"
import { useTicketFilters } from "@/hooks/use-ticket-filters"
import { useTickets } from "@/hooks/use-tickets"
import {
  DataTable,
  DataTableEmpty,
  DataTablePagination,
  DataTableSkeleton,
} from "@/components/ui/data-table"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { PageError } from "@/components/ui/page-error"
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/ui/status-badges"
import { DEFAULT_TICKETS_COLUMNS, getRangeBounds } from "@/lib/dashboard"
import { formatCategory, formatRelativeTime } from "@/lib/format"
import { ticketsQueryOptions } from "@/lib/queries/tickets"
import type { TicketListItem } from "@/types/api"

function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string
  field: string
  sortBy: string
  sortOrder: string
  onSort: (field: string) => void
}) {
  const isActive = sortBy === field

  return (
    <button
      onClick={() => onSort(field)}
      className="inline-flex cursor-pointer items-center gap-1 font-medium transition-colors duration-150 hover:text-foreground"
    >
      {label}
      {isActive ? (
        sortOrder === "asc" ? (
          <ChevronUp className="size-3.5 text-primary" />
        ) : (
          <ChevronDown className="size-3.5 text-primary" />
        )
      ) : (
        <ChevronDown className="size-3.5 opacity-30" />
      )}
    </button>
  )
}

export function TicketsTableSectionClient() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: user } = useCurrentUser()
  const isInternal = user?.role === "support_agent" || user?.role === "team_lead"
  const preferencesQuery = useDashboardPreferences({ enabled: isInternal })
  const {
    filters,
    clearFilters,
    hasActiveFilters,
    sortBy,
    sortOrder,
    setSorting,
    page,
    setPage,
    perPage,
  } = useTicketFilters()

  const rangeBounds = getRangeBounds(filters.range, filters.from, filters.to)
  const preferences = preferencesQuery.data
  const visibleColumns = preferences?.tickets_visible_columns ?? DEFAULT_TICKETS_COLUMNS
  const density = preferences?.tickets_density ?? "comfortable"
  const autoRefreshSeconds = preferences?.tickets_auto_refresh_seconds ?? 0
  const headCellClass = density === "compact" ? "h-8 px-3 text-xs" : undefined
  const bodyCellClass = density === "compact" ? "px-3 py-2 text-xs" : undefined

  const ticketQueryParams = useMemo(
    () => ({
      page,
      per_page: perPage,
      status: filters.status,
      priority: filters.priority,
      category: filters.category,
      team: filters.team,
      assignee: filters.assignee,
      created_from: rangeBounds.from,
      created_to: rangeBounds.to,
      updated_before: filters.updated_before,
      sort_by: sortBy,
      sort_order: sortOrder,
    }),
    [
      filters.assignee,
      filters.category,
      filters.priority,
      filters.status,
      filters.team,
      filters.updated_before,
      page,
      perPage,
      rangeBounds.from,
      rangeBounds.to,
      sortBy,
      sortOrder,
    ]
  )

  const { data, isLoading, isError, isPlaceholderData, refetch } = useTickets(
    ticketQueryParams,
    {
      refetchInterval: isInternal && autoRefreshSeconds > 0 ? autoRefreshSeconds * 1000 : false,
    }
  )

  useEffect(() => {
    if (!data) return
    if (data.page >= data.total_pages) return

    void queryClient.prefetchQuery(
      ticketsQueryOptions({
        ...ticketQueryParams,
        page: data.page + 1,
      })
    )
  }, [data, queryClient, ticketQueryParams])

  function handleRowClick(ticket: TicketListItem) {
    router.push(`/tickets/${ticket.id}`)
  }

  if (isError) {
    return <PageError message="Failed to load tickets." onRetry={() => refetch()} />
  }

  const tickets = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 1
  const isRefreshing = isPlaceholderData && tickets.length > 0

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
          {data
            ? `${total.toLocaleString()} ${total === 1 ? "ticket" : "tickets"}`
            : "\u00A0"}
        </p>
        {filters.updated_before ? (
          <p className="text-xs text-muted-foreground">
            Showing tickets updated before{" "}
            {filters.updated_before.replace("T", " ").replace("Z", " UTC")}
          </p>
        ) : null}
        <p className="min-h-4 text-xs text-muted-foreground">
          {isRefreshing ? "Updating results..." : "\u00A0"}
        </p>
      </div>

      <div className={isRefreshing ? "opacity-70 transition-opacity duration-200" : "transition-opacity duration-200"}>
        <DataTable>
          <TableHeader>
            <TableRow>
              {visibleColumns.includes("subject") ? (
                <TableHead className={`w-[35%] ${headCellClass ?? ""}`}>Subject</TableHead>
              ) : null}
              {visibleColumns.includes("status") ? (
                <TableHead className={headCellClass}>
                  <SortableHeader
                    label="Status"
                    field="status"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={setSorting}
                  />
                </TableHead>
              ) : null}
              {visibleColumns.includes("priority") ? (
                <TableHead className={headCellClass}>
                  <SortableHeader
                    label="Priority"
                    field="priority"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={setSorting}
                  />
                </TableHead>
              ) : null}
              {visibleColumns.includes("created") ? (
                <TableHead className={headCellClass}>
                  <SortableHeader
                    label="Created"
                    field="created_at"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={setSorting}
                  />
                </TableHead>
              ) : null}
              {visibleColumns.includes("assignee") ? (
                <TableHead className={headCellClass}>Assignee</TableHead>
              ) : null}
              {visibleColumns.includes("org") ? (
                <TableHead className={headCellClass}>Org</TableHead>
              ) : null}
              {visibleColumns.includes("category") ? (
                <TableHead className={headCellClass}>Category</TableHead>
              ) : null}
              {visibleColumns.includes("confidence") ? (
                <TableHead className={headCellClass}>Confidence</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <DataTableSkeleton
                columns={visibleColumns.length}
                columnWidths={visibleColumns.map((column) =>
                  column === "subject" ? "w-64" : "w-24"
                )}
              />
            ) : tickets.length === 0 ? (
              <DataTableEmpty
                colSpan={visibleColumns.length}
                message="No tickets match your filters"
                action={
                  hasActiveFilters ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearFilters}
                      className="cursor-pointer"
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              tickets.map((ticket) => (
                <TableRow
                  key={ticket.id}
                  onClick={() => handleRowClick(ticket)}
                  className="group cursor-pointer"
                >
                  {visibleColumns.includes("subject") ? (
                    <TableCell className={`font-medium max-w-0 ${bodyCellClass ?? ""}`}>
                      <span
                        className="block truncate text-foreground transition-colors duration-150 group-hover:text-primary group-hover:underline"
                        title={ticket.subject}
                      >
                        {ticket.subject.length > 60
                          ? `${ticket.subject.slice(0, 60)}...`
                          : ticket.subject}
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
                    <TableCell className={`text-sm text-muted-foreground ${bodyCellClass ?? ""}`}>
                      {formatRelativeTime(ticket.created_at)}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes("assignee") ? (
                    <TableCell className={`text-sm ${bodyCellClass ?? ""}`}>
                      {ticket.assignee_name ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes("org") ? (
                    <TableCell className={`text-sm text-muted-foreground ${bodyCellClass ?? ""}`}>
                      {ticket.org_name ?? "-"}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes("category") ? (
                    <TableCell className={`text-sm text-muted-foreground ${bodyCellClass ?? ""}`}>
                      {formatCategory(ticket.category)}
                    </TableCell>
                  ) : null}
                  {visibleColumns.includes("confidence") ? (
                    <TableCell className={`text-sm ${bodyCellClass ?? ""}`}>
                      {ticket.confidence != null ? (
                        `${Math.round(ticket.confidence * 100)}%`
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </DataTable>
      </div>

      {!isLoading ? (
        <DataTablePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  )
}
