"use client"

import { useMemo, useState } from "react"
import { Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import type {
  DashboardDensity,
  DashboardPage,
  DashboardSavedView,
} from "@/types/api"

const DENSITY_OPTIONS: Array<{
  value: DashboardDensity
  label: string
}> = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
]

const AUTO_REFRESH_OPTIONS: Array<{
  value: 0 | 30 | 60
  label: string
}> = [
  { value: 0, label: "Off" },
  { value: 30, label: "Every 30s" },
  { value: 60, label: "Every 60s" },
]

type ColumnOption = {
  id: string
  label: string
}

interface DashboardSettingsDrawerProps {
  page: DashboardPage
  views: DashboardSavedView[]
  defaultViewId?: string | null
  triggerLabel?: string
  density: DashboardDensity
  availableColumns: ColumnOption[]
  visibleColumns: string[]
  autoRefreshSeconds: 0 | 30 | 60
  onApplyView: (view: DashboardSavedView) => void
  onCreateView: (name: string) => void
  onOverwriteView: (viewId: string) => void
  onRenameView: (viewId: string, name: string) => void
  onDeleteView: (viewId: string) => void
  onSetDefaultView: (viewId: string | null) => void
  onSavePreferences: (updates: {
    density: DashboardDensity
    visibleColumns: string[]
    autoRefreshSeconds: 0 | 30 | 60
  }) => void
  preferencesPending?: boolean
  viewsPending?: boolean
}

export function DashboardSettingsDrawer({
  page,
  views,
  defaultViewId,
  triggerLabel = "View settings",
  density,
  availableColumns,
  visibleColumns,
  autoRefreshSeconds,
  onApplyView,
  onCreateView,
  onOverwriteView,
  onRenameView,
  onDeleteView,
  onSetDefaultView,
  onSavePreferences,
  preferencesPending = false,
  viewsPending = false,
}: DashboardSettingsDrawerProps) {
  const [open, setOpen] = useState(false)
  const [newViewName, setNewViewName] = useState("")
  const [draftDensity, setDraftDensity] = useState<DashboardDensity>(density)
  const [draftColumns, setDraftColumns] = useState<string[]>(visibleColumns)
  const [draftAutoRefresh, setDraftAutoRefresh] = useState<0 | 30 | 60>(autoRefreshSeconds)
  const [draftNames, setDraftNames] = useState<Record<string, string>>({})

  const pageLabel = page === "overview" ? "Overview" : "Tickets"
  const canSavePreferences = useMemo(() => {
    if (draftDensity !== density) return true
    if (draftAutoRefresh !== autoRefreshSeconds) return true
    if (draftColumns.length !== visibleColumns.length) return true
    return draftColumns.some((column) => !visibleColumns.includes(column))
  }, [
    autoRefreshSeconds,
    density,
    draftAutoRefresh,
    draftColumns,
    draftDensity,
    visibleColumns,
  ])

  function toggleColumn(columnId: string, checked: boolean) {
    setDraftColumns((current) => {
      if (checked) {
        return current.includes(columnId) ? current : [...current, columnId]
      }
      return current.filter((column) => column !== columnId)
    })
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraftDensity(density)
      setDraftColumns(visibleColumns)
      setDraftAutoRefresh(autoRefreshSeconds)
      setDraftNames(Object.fromEntries(views.map((view) => [view.id, view.name])))
    }
    setOpen(nextOpen)
  }

  const densityLabel =
    DENSITY_OPTIONS.find((option) => option.value === draftDensity)?.label ?? "Select density"
  const autoRefreshLabel =
    AUTO_REFRESH_OPTIONS.find((option) => option.value === draftAutoRefresh)?.label ??
    "Select refresh"

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="cursor-pointer" />
        }
      >
        <Settings2 className="mr-1.5 size-4" />
        {triggerLabel}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader className="border-b border-border/70 px-5 py-4">
          <SheetTitle>{pageLabel} Settings</SheetTitle>
          <SheetDescription>
            Saved views, display options, and refresh cadence.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">Saved views</h3>
              <p className="text-xs text-muted-foreground">
                Create personal views from the current URL state and reuse them later.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={newViewName}
                onChange={(event) => setNewViewName(event.target.value)}
                placeholder={`Save current ${pageLabel.toLowerCase()} view`}
              />
              <Button
                size="sm"
                onClick={() => {
                  const trimmed = newViewName.trim()
                  if (!trimmed) return
                  onCreateView(trimmed)
                  setNewViewName("")
                }}
                disabled={!newViewName.trim() || viewsPending}
                className="cursor-pointer"
              >
                Save
              </Button>
            </div>

            <div className="space-y-3">
              {views.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
                  No saved views yet.
                </div>
              ) : (
                views.map((view) => {
                  const draftName = draftNames[view.id] ?? view.name
                  return (
                    <div
                      key={view.id}
                      className="rounded-xl border border-border/70 bg-card px-4 py-3 surface-shadow-sm"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {view.name}
                          </span>
                          {defaultViewId === view.id ? (
                            <Badge className="px-2 text-[11px]">Default</Badge>
                          ) : null}
                        </div>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onApplyView(view)}
                          className="cursor-pointer"
                        >
                          Apply
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <Input
                          value={draftName}
                          onChange={(event) =>
                            setDraftNames((current) => ({
                              ...current,
                              [view.id]: event.target.value,
                            }))
                          }
                          placeholder="View name"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => onOverwriteView(view.id)}
                            className="cursor-pointer"
                          >
                            Overwrite
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => onRenameView(view.id, draftName.trim())}
                            disabled={!draftName.trim() || draftName.trim() === view.name}
                            className="cursor-pointer"
                          >
                            Rename
                          </Button>
                          <Button
                            variant={defaultViewId === view.id ? "secondary" : "outline"}
                            size="xs"
                            onClick={() =>
                              onSetDefaultView(defaultViewId === view.id ? null : view.id)
                            }
                            className="cursor-pointer"
                          >
                            {defaultViewId === view.id ? "Unset default" : "Set default"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="xs"
                            onClick={() => onDeleteView(view.id)}
                            className="cursor-pointer"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">Display</h3>
              <p className="text-xs text-muted-foreground">
                Control density and visible columns for this page.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Density
                </label>
                <Select
                  value={draftDensity}
                  onValueChange={(value) =>
                    setDraftDensity(value as DashboardDensity)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{densityLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {DENSITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {availableColumns.map((column) => (
                <label
                  key={column.id}
                  className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={draftColumns.includes(column.id)}
                    onCheckedChange={(checked) =>
                      toggleColumn(column.id, !!checked)
                    }
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">Refresh</h3>
              <p className="text-xs text-muted-foreground">
                Choose how often this page should refresh automatically.
              </p>
            </div>

            <Select
              value={String(draftAutoRefresh)}
              onValueChange={(value) =>
                setDraftAutoRefresh(Number(value) as 0 | 30 | 60)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue>{autoRefreshLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {AUTO_REFRESH_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

        </div>

        <SheetFooter className="border-t border-border/70 px-5 py-4">
          <Button
            onClick={() =>
              onSavePreferences({
                density: draftDensity,
                visibleColumns: draftColumns,
                autoRefreshSeconds: draftAutoRefresh,
              })
            }
            disabled={!canSavePreferences || preferencesPending || draftColumns.length === 0}
            className="cursor-pointer"
          >
            Save settings
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
