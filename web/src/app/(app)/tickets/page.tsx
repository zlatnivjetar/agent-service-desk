"use client"

import { Suspense } from "react"
import { useRouter } from "next/navigation"
import { ChevronUp, ChevronDown } from "lucide-react"
import { useTickets } from "@/hooks/use-tickets"
import { useTicketFilters } from "@/hooks/use-ticket-filters"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { formatRelativeTime, formatCategory } from "@/lib/format"
import { PageError } from "@/components/ui/page-error"
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/ui/status-badges"
import { DataTable, DataTableSkeleton, DataTableEmpty, DataTablePagination } from "@/components/ui/data-table"
import { FilterBar } from "@/components/ui/filter-bar"
import { FilterSelect, type FilterOption } from "@/components/ui/filter-select"
import type { TicketListItem } from "@/types/api"

// --- Filter options ---

const STATUS_OPTIONS: FilterOption[] = [
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "pending_customer", label: "Pending Customer" },
  { value: "pending_internal", label: "Pending Internal" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
]

const PRIORITY_OPTIONS: FilterOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
]

const CATEGORY_OPTIONS: FilterOption[] = [
  { value: "billing", label: "Billing" },
  { value: "bug_report", label: "Bug Report" },
  { value: "feature_request", label: "Feature Request" },
  { value: "account_access", label: "Account Access" },
  { value: "integration", label: "Integration" },
  { value: "api_issue", label: "API Issue" },
  { value: "onboarding", label: "Onboarding" },
  { value: "data_export", label: "Data Export" },
]

const TEAM_OPTIONS: FilterOption[] = [
  { value: "general_support", label: "General Support" },
  { value: "billing_team", label: "Billing Team" },
  { value: "engineering", label: "Engineering" },
  { value: "integrations", label: "Integrations" },
  { value: "onboarding", label: "Onboarding" },
  { value: "account_management", label: "Account Management" },
]

// --- Sort header ---

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
      className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors duration-150 font-medium"
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

// --- Main queue ---

function TicketQueueContent() {
  const router = useRouter()
  const {
    filters,
    setFilter,
    clearFilters,
    hasActiveFilters,
    sortBy,
    sortOrder,
    setSorting,
    page,
    setPage,
    perPage,
  } = useTicketFilters()

  const { data, isLoading, isError, refetch } = useTickets({
    page,
    per_page: perPage,
    status: filters.status,
    priority: filters.priority,
    category: filters.category,
    team: filters.team,
    sort_by: sortBy,
    sort_order: sortOrder,
  })

  const tickets = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 1

  function handleRowClick(ticket: TicketListItem) {
    router.push(`/tickets/${ticket.id}`)
  }

  if (isError) {
    return <PageError message="Failed to load tickets." onRetry={() => refetch()} />
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
        {data && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {total.toLocaleString()} {total === 1 ? "ticket" : "tickets"}
          </p>
        )}
      </div>

      {/* Filter bar */}
      <FilterBar onClear={clearFilters} hasActiveFilters={hasActiveFilters}>
        <FilterSelect
          value={filters.status}
          onValueChange={(v) => setFilter("status", v || null)}
          placeholder="All statuses"
          options={STATUS_OPTIONS}
          className="w-40"
        />
        <FilterSelect
          value={filters.priority}
          onValueChange={(v) => setFilter("priority", v || null)}
          placeholder="All priorities"
          options={PRIORITY_OPTIONS}
          className="w-36"
        />
        <FilterSelect
          value={filters.category}
          onValueChange={(v) => setFilter("category", v || null)}
          placeholder="All categories"
          options={CATEGORY_OPTIONS}
          className="w-44"
        />
        <FilterSelect
          value={filters.team}
          onValueChange={(v) => setFilter("team", v || null)}
          placeholder="All teams"
          options={TEAM_OPTIONS}
          className="w-44"
        />
      </FilterBar>

      {/* Table */}
      <DataTable>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[35%]">Subject</TableHead>
            <TableHead>
              <SortableHeader
                label="Status"
                field="status"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={setSorting}
              />
            </TableHead>
            <TableHead>
              <SortableHeader
                label="Priority"
                field="priority"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={setSorting}
              />
            </TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Org</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>
              <SortableHeader
                label="Created"
                field="created_at"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={setSorting}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <DataTableSkeleton
              columns={8}
              columnWidths={["w-64", "w-20", "w-16", "w-24", "w-28", "w-24", "w-10", "w-16"]}
            />
          ) : tickets.length === 0 ? (
            <DataTableEmpty
              colSpan={8}
              message="No tickets match your filters"
              action={
                hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="cursor-pointer">
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
                className="cursor-pointer"
              >
                <TableCell className="font-medium max-w-0">
                  <span
                    className="block truncate text-[#0D9488] hover:underline"
                    title={ticket.subject}
                  >
                    {ticket.subject.length > 60
                      ? ticket.subject.slice(0, 60) + "…"
                      : ticket.subject}
                  </span>
                </TableCell>
                <TableCell>
                  <TicketStatusBadge status={ticket.status} />
                </TableCell>
                <TableCell>
                  <TicketPriorityBadge priority={ticket.priority} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatCategory(ticket.category)}
                </TableCell>
                <TableCell className="text-sm">
                  {ticket.assignee_name ?? (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ticket.org_name ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {ticket.confidence != null ? (
                    `${Math.round(ticket.confidence * 100)}%`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatRelativeTime(ticket.created_at)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>

      {/* Pagination */}
      {!isLoading && (
        <DataTablePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}

export default function TicketsPage() {
  return (
    <Suspense>
      <TicketQueueContent />
    </Suspense>
  )
}
