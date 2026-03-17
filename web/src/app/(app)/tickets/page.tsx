"use client"

import { Suspense } from "react"
import { useRouter } from "next/navigation"
import { ChevronUp, ChevronDown } from "lucide-react"
import { useTickets } from "@/hooks/use-tickets"
import { useTicketFilters } from "@/hooks/use-ticket-filters"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRelativeTime, formatCategory } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { TicketListItem } from "@/types/api"

// --- Badge helpers ---

const STATUS_CLASSES: Record<string, string> = {
  new: "bg-primary text-primary-foreground",
  open: "bg-blue-100 text-blue-800 border-blue-200",
  pending_customer: "border-border text-foreground",
  pending_internal: "border-border text-foreground",
  resolved: "bg-success/10 text-success border-success/20",
  closed: "bg-muted text-muted-foreground border-transparent",
}

const PRIORITY_CLASSES: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-transparent",
  medium: "bg-secondary text-secondary-foreground border-transparent",
  high: "bg-warning/10 text-warning border-warning/20",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("capitalize", STATUS_CLASSES[status] ?? "border-border text-foreground")}>
      {status.replace(/_/g, " ")}
    </Badge>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge className={cn("capitalize", PRIORITY_CLASSES[priority] ?? "border-border text-foreground")}>
      {priority}
    </Badge>
  )
}

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

// --- Skeleton rows ---

function TableSkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-64" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-10" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        </TableRow>
      ))}
    </>
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

  const { data, isLoading } = useTickets({
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

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[#0F172A]">Tickets</h1>
        {data && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {total.toLocaleString()} {total === 1 ? "ticket" : "tickets"}
          </p>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.status ?? ""}
          onValueChange={(v) => setFilter("status", v || null)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending_customer">Pending Customer</SelectItem>
            <SelectItem value="pending_internal">Pending Internal</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.priority ?? ""}
          onValueChange={(v) => setFilter("priority", v || null)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.category ?? ""}
          onValueChange={(v) => setFilter("category", v || null)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="billing">Billing</SelectItem>
            <SelectItem value="bug_report">Bug Report</SelectItem>
            <SelectItem value="feature_request">Feature Request</SelectItem>
            <SelectItem value="account_access">Account Access</SelectItem>
            <SelectItem value="integration">Integration</SelectItem>
            <SelectItem value="api_issue">API Issue</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="data_export">Data Export</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.team ?? ""}
          onValueChange={(v) => setFilter("team", v || null)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general_support">General Support</SelectItem>
            <SelectItem value="billing_team">Billing Team</SelectItem>
            <SelectItem value="engineering">Engineering</SelectItem>
            <SelectItem value="integrations">Integrations</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="account_management">Account Management</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="cursor-pointer">
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
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
              <TableSkeletonRows />
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground">No tickets match your filters</p>
                    {hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={clearFilters} className="cursor-pointer">
                        Clear filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket) => (
                <TableRow
                  key={ticket.id}
                  onClick={() => handleRowClick(ticket)}
                  className="cursor-pointer hover:bg-muted/50 transition-colors duration-150"
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
                    <StatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={ticket.priority} />
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
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(ticket.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="cursor-pointer"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className="cursor-pointer"
            >
              Next
            </Button>
          </div>
        </div>
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
