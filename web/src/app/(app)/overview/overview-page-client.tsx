"use client"

import { useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { usePathname, useSearchParams } from "next/navigation"
import { type ReactNode } from "react"
import { BarChart3 } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/hooks/use-current-user"
import { useWorkspaceUsers } from "@/hooks/use-users"
import {
  useDashboardPreferences,
  useDashboardSavedViews,
  useCreateDashboardSavedView,
  useDeleteDashboardSavedView,
  useUpdateDashboardPreferences,
  useUpdateDashboardSavedView,
} from "@/hooks/use-dashboard"
import { FilterBar } from "@/components/ui/filter-bar"
import { FilterSelect } from "@/components/ui/filter-select"
import { PageLoading } from "@/components/ui/page-loading"
import { AppPage, PageHeader } from "@/components/app-page"
import { DateRangeControls } from "@/components/dashboard/date-range-controls"
import { ComparisonToggle } from "@/components/dashboard/overview-visuals"
import {
  DEFAULT_OVERVIEW_COLUMNS,
  OVERVIEW_ALLOWED_QUERY_KEYS,
  OVERVIEW_TABLE_COLUMNS,
  TEAM_OPTIONS,
  getDefaultRangePreset,
  getRangeBounds,
  hrefFromState,
  serializeQueryState,
} from "@/lib/dashboard"
import { replaceUrl } from "@/lib/url-state"

const DashboardSettingsDrawer = dynamic(
  () =>
    import("@/components/dashboard/dashboard-settings-drawer").then(
      (module) => module.DashboardSettingsDrawer
    ),
  { ssr: false }
)

export default function OverviewPageClient({
  metricsSection,
  ticketsSection,
}: {
  metricsSection: ReactNode
  ticketsSection: ReactNode
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: user, isPending: userPending } = useCurrentUser()
  const isInternal = user?.role === "support_agent" || user?.role === "team_lead"

  const preferencesQuery = useDashboardPreferences({ enabled: isInternal })
  const viewsQuery = useDashboardSavedViews("overview", { enabled: isInternal })
  const usersQuery = useWorkspaceUsers()

  const updatePreferences = useUpdateDashboardPreferences()
  const createSavedView = useCreateDashboardSavedView()
  const updateSavedView = useUpdateDashboardSavedView("overview")
  const deleteSavedView = useDeleteDashboardSavedView("overview")

  const range = getDefaultRangePreset(searchParams.get("range"))
  const fromValue = searchParams.get("from")
  const toValue = searchParams.get("to")
  const team = searchParams.get("team")
  const assigneeId = searchParams.get("assignee_id")
  const compareMode = searchParams.get("compare") === "1"

  const preferences = preferencesQuery.data
  const visibleColumns = preferences?.overview_visible_columns ?? DEFAULT_OVERVIEW_COLUMNS
  const density = preferences?.overview_density ?? "comfortable"
  const autoRefreshSeconds = preferences?.overview_auto_refresh_seconds ?? 30
  const defaultViewId = preferences?.overview_default_view_id ?? null
  const savedViews = useMemo(() => viewsQuery.data ?? [], [viewsQuery.data])

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
    const internalUsers = (usersQuery.data ?? []).filter(
      (workspaceUser) => workspaceUser.role !== "client_user"
    )
    return internalUsers.map((workspaceUser) => ({
      value: workspaceUser.id,
      label: workspaceUser.full_name,
    }))
  }, [usersQuery.data])

  function pushParams(next: URLSearchParams) {
    const query = next.toString()
    replaceUrl(query ? `${pathname}?${query}` : pathname)
  }

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
    pushParams(next)
  }

  function setParam(key: string, value: string | null) {
    updateParams({ [key]: value })
  }

  function setRange(value: "7d" | "30d" | "90d" | "custom") {
    const next = new URLSearchParams(searchParams.toString())
    next.set("range", value)
    if (value === "custom") {
      const seededRange = getRangeBounds(range, fromValue, toValue)
      next.set("from", fromValue ?? seededRange.from)
      next.set("to", toValue ?? seededRange.to)
    } else {
      next.delete("from")
      next.delete("to")
    }
    next.delete("page")
    pushParams(next)
  }

  function setCompareMode(enabled: boolean) {
    updateParams({ compare: enabled ? "1" : null })
  }

  function clearFilters() {
    replaceUrl(`${pathname}?range=30d`)
  }

  function applySavedView(state: Record<string, unknown>) {
    replaceUrl(hrefFromState(pathname, state))
  }

  function currentState() {
    const state = serializeQueryState(searchParams, OVERVIEW_ALLOWED_QUERY_KEYS)
    if (!state.range) {
      state.range = range
    }
    if (range === "custom" && fromValue && toValue) {
      state.from = fromValue
      state.to = toValue
    }
    return state
  }

  function updateOverviewPreferences(updates: {
    density: "comfortable" | "compact"
    visibleColumns: string[]
    autoRefreshSeconds: 0 | 30 | 60
  }) {
    updatePreferences.mutate(
      {
        overview_density: updates.density,
        overview_visible_columns: updates.visibleColumns,
        overview_auto_refresh_seconds: updates.autoRefreshSeconds,
      },
      {
        onSuccess: () => toast.success("Overview settings saved"),
        onError: (error) => toast.error((error as Error).message || "Failed to save settings"),
      }
    )
  }

  const hasActiveFilters =
    range !== "30d" ||
    compareMode ||
    !!team ||
    !!assigneeId ||
    !!searchParams.get("status") ||
    !!searchParams.get("priority") ||
    !!searchParams.get("age_bucket")

  if (
    userPending ||
    (isInternal && (preferencesQuery.isLoading || viewsQuery.isLoading) && searchParams.toString() === "")
  ) {
    return <PageLoading />
  }

  if (user?.role === "client_user") {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <BarChart3 className="size-10 text-muted-foreground" />
        <p className="text-base font-medium text-foreground">Access restricted</p>
        <p className="text-sm text-muted-foreground">
          The operations overview is available to support agents and team leads only.
        </p>
      </div>
    )
  }

  if (!isInternal) {
    return <PageLoading />
  }

  return (
    <AppPage>
      <PageHeader
        title="Operations Overview"
        meta={<p>Queue health, current risks, and ticket drill-down from one page.</p>}
      />

      <FilterBar
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
        actions={
          <DashboardSettingsDrawer
            page="overview"
            views={savedViews}
            defaultViewId={defaultViewId}
            density={density}
            availableColumns={OVERVIEW_TABLE_COLUMNS}
            visibleColumns={visibleColumns}
            autoRefreshSeconds={autoRefreshSeconds}
            onApplyView={(view) => applySavedView(view.state)}
            onCreateView={(name) =>
              createSavedView.mutate(
                { page: "overview", name, state: currentState() },
                {
                  onSuccess: () => toast.success("Saved overview view"),
                  onError: (error) =>
                    toast.error((error as Error).message || "Failed to save view"),
                }
              )
            }
            onOverwriteView={(viewId) =>
              updateSavedView.mutate(
                { id: viewId, body: { state: currentState() } },
                {
                  onSuccess: () => toast.success("View updated"),
                  onError: (error) =>
                    toast.error((error as Error).message || "Failed to update view"),
                }
              )
            }
            onRenameView={(viewId, name) =>
              updateSavedView.mutate(
                { id: viewId, body: { name } },
                {
                  onSuccess: () => toast.success("View renamed"),
                  onError: (error) =>
                    toast.error((error as Error).message || "Failed to rename view"),
                }
              )
            }
            onDeleteView={(viewId) =>
              deleteSavedView.mutate(viewId, {
                onSuccess: () => toast.success("View deleted"),
                onError: (error) =>
                  toast.error((error as Error).message || "Failed to delete view"),
              })
            }
            onSetDefaultView={(viewId) =>
              updatePreferences.mutate(
                { overview_default_view_id: viewId },
                {
                  onSuccess: () =>
                    toast.success(viewId ? "Default view updated" : "Default view cleared"),
                  onError: (error) =>
                    toast.error((error as Error).message || "Failed to update default view"),
                }
              )
            }
            onSavePreferences={updateOverviewPreferences}
            preferencesPending={updatePreferences.isPending}
            viewsPending={
              createSavedView.isPending || updateSavedView.isPending || deleteSavedView.isPending
            }
          />
        }
      >
        <DateRangeControls
          range={range}
          from={fromValue}
          to={toValue}
          onRangeChange={setRange}
          onFromChange={(value) => setParam("from", value)}
          onToChange={(value) => setParam("to", value)}
        />
        <ComparisonToggle enabled={compareMode} onToggle={setCompareMode} />
        <FilterSelect
          value={team}
          onValueChange={(value) => setParam("team", value || null)}
          placeholder="All teams"
          options={TEAM_OPTIONS}
          className="w-44"
        />
        <FilterSelect
          value={assigneeId}
          onValueChange={(value) => setParam("assignee_id", value || null)}
          placeholder="All assignees"
          options={assigneeOptions}
          className="w-44"
        />
      </FilterBar>

      <div className="space-y-6">
        {metricsSection}
        {ticketsSection}
      </div>
    </AppPage>
  )
}
