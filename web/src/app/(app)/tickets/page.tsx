"use client"

import { Suspense, useEffect, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/hooks/use-current-user"
import { useDashboardPreferences, useDashboardSavedViews, useCreateDashboardSavedView, useDeleteDashboardSavedView, useUpdateDashboardPreferences, useUpdateDashboardSavedView } from "@/hooks/use-dashboard"
import { useTickets } from "@/hooks/use-tickets"
import { useTicketFilters } from "@/hooks/use-ticket-filters"
import { useWorkspaceUsers } from "@/hooks/use-users"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { formatCategory, formatRelativeTime } from "@/lib/format"
import { PageError } from "@/components/ui/page-error"
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/ui/status-badges"
import { DataTable, DataTableSkeleton, DataTableEmpty, DataTablePagination } from "@/components/ui/data-table"
import { FilterBar } from "@/components/ui/filter-bar"
import { FilterSelect, type FilterOption } from "@/components/ui/filter-select"
import { AppPage, PageHeader } from "@/components/app-page"
import { DateRangeControls } from "@/components/dashboard/date-range-controls"
import { DashboardSettingsDrawer } from "@/components/dashboard/dashboard-settings-drawer"
import {
  DEFAULT_TICKETS_COLUMNS,
  TEAM_OPTIONS,
  TICKETS_ALLOWED_QUERY_KEYS,
  TICKETS_TABLE_COLUMNS,
  getRangeBounds,
  hrefFromState,
  serializeQueryState,
} from "@/lib/dashboard"
import type { TicketListItem } from "@/types/api"

const STATUS_OPTIONS: FilterOption[] = [
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "pending_customer", label: "Pending Customer" },
  { value: "pending_internal", label: "Pending Internal" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
]

const PRIORITY_OPTIONS: FilterOption[] = [
  { value: "high_critical", label: "High + Critical" },
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

function TicketsPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: user, isPending: userPending } = useCurrentUser()
  const isInternal = user?.role === "support_agent" || user?.role === "team_lead"
  const usersQuery = useWorkspaceUsers()
  const preferencesQuery = useDashboardPreferences({ enabled: isInternal })
  const viewsQuery = useDashboardSavedViews("tickets", { enabled: isInternal })
  const updatePreferences = useUpdateDashboardPreferences()
  const createSavedView = useCreateDashboardSavedView()
  const updateSavedView = useUpdateDashboardSavedView("tickets")
  const deleteSavedView = useDeleteDashboardSavedView("tickets")

  const {
    filters,
    setFilter,
    setRange,
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
  const savedViews = useMemo(() => viewsQuery.data ?? [], [viewsQuery.data])
  const visibleColumns = preferences?.tickets_visible_columns ?? DEFAULT_TICKETS_COLUMNS
  const density = preferences?.tickets_density ?? "comfortable"
  const autoRefreshSeconds = preferences?.tickets_auto_refresh_seconds ?? 0
  const defaultViewId = preferences?.tickets_default_view_id ?? null

  useEffect(() => {
    if (!isInternal) return
    if (!preferences || viewsQuery.isLoading) return
    if (searchParams.toString() !== "") return
    if (!defaultViewId) return
    const defaultView = savedViews.find((view) => view.id === defaultViewId)
    if (!defaultView) return
    router.replace(hrefFromState(pathname, defaultView.state))
  }, [
    defaultViewId,
    isInternal,
    pathname,
    preferences,
    router,
    savedViews,
    searchParams,
    viewsQuery.isLoading,
  ])

  const assigneeOptions = useMemo(() => {
    const baseOptions = [{ value: "unassigned", label: "Unassigned" }]
    if (!isInternal) return baseOptions
    const internalUsers = (usersQuery.data ?? []).filter(
      (workspaceUser) => workspaceUser.role !== "client_user"
    )
    return [
      ...baseOptions,
      ...internalUsers.map((workspaceUser) => ({
        value: workspaceUser.id,
        label: workspaceUser.full_name,
      })),
    ]
  }, [isInternal, usersQuery.data])

  const { data, isLoading, isError, refetch } = useTickets(
    {
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
    },
    {
      refetchInterval: isInternal && autoRefreshSeconds > 0 ? autoRefreshSeconds * 1000 : false,
    }
  )

  const tickets = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 1
  const headCellClass = density === "compact" ? "h-8 px-3 text-xs" : undefined
  const bodyCellClass = density === "compact" ? "px-3 py-2 text-xs" : undefined

  function handleRowClick(ticket: TicketListItem) {
    router.push(`/tickets/${ticket.id}`)
  }

  function currentState() {
    const state = serializeQueryState(searchParams, TICKETS_ALLOWED_QUERY_KEYS)
    if (!state.range) {
      state.range = filters.range
    }
    return state
  }

  function saveTicketPreferences(updates: {
    density: "comfortable" | "compact"
    visibleColumns: string[]
    autoRefreshSeconds: 0 | 30 | 60
  }) {
    updatePreferences.mutate(
      {
        tickets_density: updates.density,
        tickets_visible_columns: updates.visibleColumns,
        tickets_auto_refresh_seconds: updates.autoRefreshSeconds,
      },
      {
        onSuccess: () => toast.success("Ticket settings saved"),
        onError: (error) => toast.error((error as Error).message || "Failed to save settings"),
      }
    )
  }

  if (userPending || (isInternal && preferencesQuery.isLoading && searchParams.toString() === "")) {
    return null
  }

  if (isError) {
    return <PageError message="Failed to load tickets." onRetry={() => refetch()} />
  }

  return (
    <AppPage>
      <PageHeader
        title="Tickets"
        meta={
          <>
            <p aria-live="polite" className="min-h-5">
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
          </>
        }
      />

      <FilterBar
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
        actions={
          isInternal ? (
            <DashboardSettingsDrawer
              page="tickets"
              views={savedViews}
              defaultViewId={defaultViewId}
              density={density}
              availableColumns={TICKETS_TABLE_COLUMNS}
              visibleColumns={visibleColumns}
              autoRefreshSeconds={autoRefreshSeconds}
              onApplyView={(view) => router.push(hrefFromState(pathname, view.state))}
              onCreateView={(name) =>
                createSavedView.mutate(
                  { page: "tickets", name, state: currentState() },
                  {
                    onSuccess: () => toast.success("Saved ticket view"),
                    onError: (error) => toast.error((error as Error).message || "Failed to save view"),
                  }
                )
              }
              onOverwriteView={(viewId) =>
                updateSavedView.mutate(
                  { id: viewId, body: { state: currentState() } },
                  {
                    onSuccess: () => toast.success("View updated"),
                    onError: (error) => toast.error((error as Error).message || "Failed to update view"),
                  }
                )
              }
              onRenameView={(viewId, name) =>
                updateSavedView.mutate(
                  { id: viewId, body: { name } },
                  {
                    onSuccess: () => toast.success("View renamed"),
                    onError: (error) => toast.error((error as Error).message || "Failed to rename view"),
                  }
                )
              }
              onDeleteView={(viewId) =>
                deleteSavedView.mutate(viewId, {
                  onSuccess: () => toast.success("View deleted"),
                  onError: (error) => toast.error((error as Error).message || "Failed to delete view"),
                })
              }
              onSetDefaultView={(viewId) =>
                updatePreferences.mutate(
                  { tickets_default_view_id: viewId },
                  {
                    onSuccess: () => toast.success(viewId ? "Default ticket view updated" : "Default ticket view cleared"),
                    onError: (error) => toast.error((error as Error).message || "Failed to update default view"),
                  }
                )
              }
              onSavePreferences={saveTicketPreferences}
              preferencesPending={updatePreferences.isPending}
              viewsPending={createSavedView.isPending || updateSavedView.isPending || deleteSavedView.isPending}
            />
          ) : null
        }
      >
        <DateRangeControls
          range={filters.range}
          from={filters.from}
          to={filters.to}
          onRangeChange={setRange}
          onFromChange={(value) => setFilter("from", value)}
          onToChange={(value) => setFilter("to", value)}
        />
        <FilterSelect
          value={filters.status}
          onValueChange={(value) => setFilter("status", value || null)}
          placeholder="All statuses"
          options={STATUS_OPTIONS}
          className="w-40"
        />
        <FilterSelect
          value={filters.priority}
          onValueChange={(value) => setFilter("priority", value || null)}
          placeholder="All priorities"
          options={PRIORITY_OPTIONS}
          className="w-36"
        />
        <FilterSelect
          value={filters.category}
          onValueChange={(value) => setFilter("category", value || null)}
          placeholder="All categories"
          options={CATEGORY_OPTIONS}
          className="w-44"
        />
        <FilterSelect
          value={filters.team}
          onValueChange={(value) => setFilter("team", value || null)}
          placeholder="All teams"
          options={TEAM_OPTIONS}
          className="w-44"
        />
        {isInternal ? (
          <FilterSelect
            value={filters.assignee}
            onValueChange={(value) => setFilter("assignee", value || null)}
            placeholder="All assignees"
            options={assigneeOptions}
            className="w-44"
          />
        ) : null}
      </FilterBar>

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

      {!isLoading && (
        <DataTablePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </AppPage>
  )
}

export default function TicketsPage() {
  return (
    <Suspense>
      <TicketsPageContent />
    </Suspense>
  )
}
