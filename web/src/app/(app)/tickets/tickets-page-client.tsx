"use client"

import { useEffect, useMemo } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { toast } from "sonner"

import { useCurrentUser } from "@/hooks/use-current-user"
import { useDashboardPreferences, useDashboardSavedViews, useCreateDashboardSavedView, useDeleteDashboardSavedView, useUpdateDashboardPreferences, useUpdateDashboardSavedView } from "@/hooks/use-dashboard"
import { useTicketFilters } from "@/hooks/use-ticket-filters"
import { useWorkspaceUsers } from "@/hooks/use-users"
import { FilterBar } from "@/components/ui/filter-bar"
import { FilterSelect, type FilterOption } from "@/components/ui/filter-select"
import { AppPage, PageHeader } from "@/components/app-page"
import { DateRangeControls } from "@/components/dashboard/date-range-controls"
import {
  DEFAULT_TICKETS_COLUMNS,
  TEAM_OPTIONS,
  TICKETS_ALLOWED_QUERY_KEYS,
  TICKETS_TABLE_COLUMNS,
  hrefFromState,
  serializeQueryState,
} from "@/lib/dashboard"
import { replaceUrl } from "@/lib/url-state"
import type { ReactNode } from "react"

const DashboardSettingsDrawer = dynamic(
  () =>
    import("@/components/dashboard/dashboard-settings-drawer").then(
      (module) => module.DashboardSettingsDrawer
    ),
  { ssr: false }
)

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

function TicketsPageContent({ tableSection }: { tableSection: ReactNode }) {
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
  } = useTicketFilters()

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
    replaceUrl(hrefFromState(pathname, defaultView.state))
  }, [
    defaultViewId,
    isInternal,
    pathname,
    preferences,
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

  return (
    <AppPage>
      <PageHeader
        title="Tickets"
        meta={
          <div>
            <p className="text-sm text-muted-foreground">
              Filter, triage, and route incoming support work.
            </p>
            {filters.updated_before ? (
              <p className="text-xs text-muted-foreground">
                Showing tickets updated before{" "}
                {filters.updated_before.replace("T", " ").replace("Z", " UTC")}
              </p>
            ) : null}
          </div>
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
              onApplyView={(view) => replaceUrl(hrefFromState(pathname, view.state))}
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

      {tableSection}
    </AppPage>
  )
}

export default function TicketsPageClient({
  tableSection,
}: {
  tableSection: ReactNode
}) {
  return <TicketsPageContent tableSection={tableSection} />
}
