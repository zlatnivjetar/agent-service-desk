"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { MonitorIcon, MoonIcon, PanelLeftIcon, Settings2, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { useCurrentUser } from "@/hooks/use-current-user"
import { useDashboardPreferences, useUpdateDashboardPreferences } from "@/hooks/use-dashboard"
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
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

const themeOptions = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const

const landingPageOptions = [
  { value: "overview", label: "Overview" },
  { value: "tickets", label: "Tickets" },
] as const

const timeZoneOptions = [
  { value: "browser", label: "Browser local" },
  { value: "UTC", label: "UTC" },
] as const

const navigationOptions = [
  { value: "expanded", label: "Expanded" },
  { value: "collapsed", label: "Collapsed" },
] as const

type ThemeChoice = (typeof themeOptions)[number]["value"]
type LandingPageChoice = (typeof landingPageOptions)[number]["value"]
type TimeZoneChoice = (typeof timeZoneOptions)[number]["value"]
type NavigationChoice = (typeof navigationOptions)[number]["value"]

export function GlobalSettingsDrawer() {
  const { data: user, isPending: userPending } = useCurrentUser()
  const isInternal = user?.role === "support_agent" || user?.role === "team_lead"
  const preferencesQuery = useDashboardPreferences({ enabled: isInternal })
  const updatePreferences = useUpdateDashboardPreferences()
  const { open, setOpen } = useSidebar()
  const { theme, setTheme } = useTheme()
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const [sheetOpen, setSheetOpen] = useState(false)
  const [draftTheme, setDraftTheme] = useState<ThemeChoice>("system")
  const [draftLandingPage, setDraftLandingPage] = useState<LandingPageChoice>("overview")
  const [draftTimeZone, setDraftTimeZone] = useState<TimeZoneChoice>("browser")
  const [draftNavigation, setDraftNavigation] = useState<NavigationChoice>("expanded")

  const selectedTheme = hydrated ? ((theme as ThemeChoice | undefined) ?? "system") : "system"
  const landingPage = preferencesQuery.data?.landing_page ?? "overview"
  const timeZone = preferencesQuery.data?.time_zone ?? "browser"
  const navigationState: NavigationChoice = open ? "expanded" : "collapsed"

  const canSave = useMemo(() => {
    if (draftTheme !== selectedTheme) return true
    if (draftNavigation !== navigationState) return true
    if (!isInternal) return false
    if (draftLandingPage !== landingPage) return true
    if (draftTimeZone !== timeZone) return true
    return false
  }, [
    draftLandingPage,
    draftNavigation,
    draftTheme,
    draftTimeZone,
    isInternal,
    landingPage,
    navigationState,
    selectedTheme,
    timeZone,
  ])

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraftTheme(selectedTheme)
      setDraftLandingPage(landingPage)
      setDraftTimeZone(timeZone)
      setDraftNavigation(navigationState)
    }
    setSheetOpen(nextOpen)
  }

  function applyLocalPreferences() {
    if (draftTheme !== selectedTheme) {
      setTheme(draftTheme)
    }
    const nextSidebarOpen = draftNavigation === "expanded"
    if (nextSidebarOpen !== open) {
      setOpen(nextSidebarOpen)
    }
  }

  function handleSave() {
    const updates = isInternal
      ? {
          landing_page: draftLandingPage !== landingPage ? draftLandingPage : undefined,
          time_zone: draftTimeZone !== timeZone ? draftTimeZone : undefined,
        }
      : {}

    const hasServerUpdates = Object.values(updates).some((value) => value !== undefined)

    if (hasServerUpdates) {
      updatePreferences.mutate(updates, {
        onSuccess: () => {
          applyLocalPreferences()
          toast.success("Global settings saved")
          setSheetOpen(false)
        },
        onError: (error) => {
          toast.error((error as Error).message || "Failed to save global settings")
        },
      })
      return
    }

    applyLocalPreferences()
    toast.success("Global settings saved")
    setSheetOpen(false)
  }

  return (
    <Sheet open={sheetOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <SidebarMenuButton
            tooltip="Settings"
            className="cursor-pointer"
          />
        }
      >
        <Settings2 />
        <span>Settings</span>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader className="border-b border-border/70 px-5 py-4">
          <SheetTitle>Global settings</SheetTitle>
          <SheetDescription>
            Personal defaults that apply across the workspace, not just one page.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">Appearance</h3>
              <p className="text-xs text-muted-foreground">
                Choose the color theme used across the app shell.
              </p>
            </div>

            <Select value={draftTheme} onValueChange={(value) => setDraftTheme(value as ThemeChoice)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {themeOptions.find((option) => option.value === draftTheme)?.label ?? "Select theme"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <option.icon className="text-muted-foreground" />
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {isInternal ? (
            <>
              <section className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-foreground">Start page</h3>
                  <p className="text-xs text-muted-foreground">
                    Decide where internal users land after opening the app root.
                  </p>
                </div>

                <Select
                  value={draftLandingPage}
                  onValueChange={(value) => setDraftLandingPage(value as LandingPageChoice)}
                  disabled={preferencesQuery.isLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {landingPageOptions.find((option) => option.value === draftLandingPage)?.label ?? "Select page"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {landingPageOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>

              <section className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-foreground">Time zone</h3>
                  <p className="text-xs text-muted-foreground">
                    Keep timestamps and dashboard summaries aligned across internal views.
                  </p>
                </div>

                <Select
                  value={draftTimeZone}
                  onValueChange={(value) => setDraftTimeZone(value as TimeZoneChoice)}
                  disabled={preferencesQuery.isLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {timeZoneOptions.find((option) => option.value === draftTimeZone)?.label ?? "Select time zone"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {timeZoneOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>
            </>
          ) : null}

          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">Navigation</h3>
              <p className="text-xs text-muted-foreground">
                Set how the sidebar should open by default on desktop.
              </p>
            </div>

            <Select
              value={draftNavigation}
              onValueChange={(value) => setDraftNavigation(value as NavigationChoice)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {navigationOptions.find((option) => option.value === draftNavigation)?.label ?? "Select navigation mode"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {navigationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <PanelLeftIcon className="text-muted-foreground" />
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {!userPending && !isInternal ? (
            <div className="rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
              Workspace defaults like landing page and time zone are only available to internal staff roles.
            </div>
          ) : null}
        </div>

        <SheetFooter className="border-t border-border/70 px-5 py-4">
          <Button
            onClick={handleSave}
            disabled={!canSave || updatePreferences.isPending || (isInternal && preferencesQuery.isLoading)}
            className="cursor-pointer"
          >
            Save settings
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
