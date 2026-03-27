"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { LayoutDashboard, Inbox, ClipboardCheck, BookOpen, FlaskConical, ChevronsUpDown, LogOut, MonitorIcon, MoonIcon, SunIcon, SunMoon } from "lucide-react"
import { useTheme } from "next-themes"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  sidebarMenuButtonVariants,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RoleBadge } from "@/components/ui/status-badges"
import { useCurrentUser } from "@/hooks/use-current-user"
import { authClient } from "@/lib/auth-client"
import { clearTokenCache } from "@/lib/api-client"
import { overviewCombinedQueryOptions } from "@/lib/actions/overview"
import { getRangeBounds } from "@/lib/dashboard"
import {
  dashboardPreferencesQueryOptions,
  dashboardSavedViewsQueryOptions,
} from "@/lib/queries/dashboard"
import {
  evalRunsQueryOptions,
  evalSetsQueryOptions,
  promptVersionsQueryOptions,
} from "@/lib/queries/evals"
import { knowledgeDocsQueryOptions } from "@/lib/queries/knowledge"
import { reviewQueueQueryOptions } from "@/lib/queries/reviews"
import { ticketsQueryOptions } from "@/lib/queries/tickets"
import { workspaceUsersQueryOptions } from "@/lib/queries/users"
import { cn } from "@/lib/utils"

const workspaceNav = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard, roles: ["support_agent", "team_lead"] },
  { label: "Tickets", href: "/tickets", icon: Inbox, roles: ["client_user", "support_agent", "team_lead"] },
  { label: "Review Queue", href: "/reviews", icon: ClipboardCheck, roles: ["support_agent", "team_lead"] },
  { label: "Knowledge", href: "/knowledge", icon: BookOpen, roles: ["support_agent", "team_lead"] },
]

const adminNav = [
  { label: "Eval Console", href: "/evals", icon: FlaskConical, roles: ["team_lead"] },
]

const themeOptions = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const

type ThemeChoice = (typeof themeOptions)[number]["value"]

type IdleCallbackHandle = number

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean
    effectiveType?: string
  }
}

function shouldSkipRouteWarmup() {
  const connection = (navigator as NavigatorWithConnection).connection

  if (connection?.saveData) {
    return true
  }

  return connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g" ||
    connection?.effectiveType === "3g"
}

function getLikelyNextRoutes(pathname: string) {
  if (pathname.startsWith("/overview")) return ["/tickets", "/reviews", "/knowledge"]
  if (pathname.startsWith("/tickets")) return ["/overview", "/reviews", "/knowledge"]
  if (pathname.startsWith("/reviews")) return ["/tickets", "/overview", "/knowledge"]
  if (pathname.startsWith("/knowledge")) return ["/overview", "/tickets", "/reviews"]
  if (pathname.startsWith("/evals")) return ["/overview", "/tickets", "/reviews"]
  return ["/overview", "/tickets", "/reviews"]
}

const GlobalSettingsDrawer = dynamic(
  () =>
    import("@/components/global-settings-drawer").then(
      (module) => module.GlobalSettingsDrawer
    ),
  { ssr: false }
)

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: user, isPending } = useCurrentUser()
  const { theme, setTheme } = useTheme()
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const warmedRoutesRef = useRef(new Set<string>())

  const ready = hydrated && !isPending
  const role = ready ? user?.role ?? "" : ""
  const selectedTheme = hydrated ? ((theme as ThemeChoice | undefined) ?? "system") : "system"

  const visibleWorkspace = workspaceNav.filter((item) => item.roles.includes(role))
  const visibleAdmin = adminNav.filter((item) => item.roles.includes(role))
  const navItemClassName =
    "relative before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary before:opacity-0 before:transition-opacity"

  async function handleSignOut() {
    clearTokenCache()
    queryClient.clear()
    await authClient.signOut()
    router.replace("/login")
  }

  const warmRouteData = useCallback(async (href: string) => {
    if (!ready || shouldSkipRouteWarmup()) return
    if (warmedRoutesRef.current.has(href)) return

    warmedRoutesRef.current.add(href)
    router.prefetch(href)

    const defaultRange = getRangeBounds("30d")

    if (role !== "client_user") {
      void queryClient.prefetchQuery(workspaceUsersQueryOptions())
    }

    switch (href) {
      case "/overview":
        if (role === "client_user") return

        await Promise.all([
          queryClient.prefetchQuery(dashboardPreferencesQueryOptions()),
          queryClient.prefetchQuery(dashboardSavedViewsQueryOptions("overview")),
          queryClient.prefetchQuery(
            overviewCombinedQueryOptions({
              params: { range: "30d" },
              comparisonParams: null,
            })
          ),
          queryClient.prefetchQuery(
            ticketsQueryOptions({
              page: 1,
              per_page: 10,
              created_from: defaultRange.from,
              created_to: defaultRange.to,
              sort_by: "created_at",
              sort_order: "desc",
            })
          ),
        ])
        return

      case "/tickets":
        await Promise.all([
          role !== "client_user"
            ? queryClient.prefetchQuery(dashboardPreferencesQueryOptions())
            : Promise.resolve(),
          role !== "client_user"
            ? queryClient.prefetchQuery(dashboardSavedViewsQueryOptions("tickets"))
            : Promise.resolve(),
          queryClient.prefetchQuery(
            ticketsQueryOptions({
              page: 1,
              per_page: 25,
              created_from: defaultRange.from,
              created_to: defaultRange.to,
              sort_by: "created_at",
              sort_order: "desc",
            })
          ),
        ])
        return

      case "/reviews":
        if (role === "client_user") return

        await queryClient.prefetchQuery(
          reviewQueueQueryOptions({
            page: 1,
            per_page: 20,
            sort_by: "created_at",
            sort_order: "asc",
          })
        )
        return

      case "/knowledge":
        if (role === "client_user") return

        await queryClient.prefetchQuery(
          knowledgeDocsQueryOptions({
            page: 1,
            per_page: 20,
          })
        )
        return

      case "/evals":
        if (role !== "team_lead") return

        await Promise.all([
          queryClient.prefetchQuery(evalRunsQueryOptions()),
          queryClient.prefetchQuery(evalSetsQueryOptions()),
          queryClient.prefetchQuery(promptVersionsQueryOptions()),
        ])
        return
    }
  }, [queryClient, ready, role, router])

  useEffect(() => {
    if (!ready || shouldSkipRouteWarmup()) return

    const visibleHrefs = [...visibleWorkspace, ...visibleAdmin].map((item) => item.href)
    const likelyNextRoutes = getLikelyNextRoutes(pathname)
      .filter((href) => href !== pathname)
      .filter((href) => visibleHrefs.includes(href))
      .slice(0, 3)

    if (likelyNextRoutes.length === 0) return

    const idleCallback = window.requestIdleCallback
    let handle: IdleCallbackHandle

    const runWarmup = () => {
      likelyNextRoutes.forEach((href) => {
        void warmRouteData(href)
      })
    }

    if (typeof idleCallback === "function") {
      handle = idleCallback(runWarmup)
      return () => window.cancelIdleCallback(handle)
    }

    handle = window.setTimeout(runWarmup, 750)
    return () => window.clearTimeout(handle)
  }, [pathname, ready, role, visibleAdmin, visibleWorkspace, warmRouteData])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
            SD
          </div>
          <span className="font-semibold text-sm truncate">Agent Service Desk</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {!ready ? (
                [1, 2, 3].map((i) => (
                  <SidebarMenuItem key={i}>
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </SidebarMenuItem>
                ))
              ) : (
                visibleWorkspace.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                  return (
                    <SidebarMenuItem
                      key={item.href}
                      className={cn(navItemClassName, isActive && "before:opacity-100")}
                    >
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive}
                        tooltip={item.label}
                        onMouseEnter={() => void warmRouteData(item.href)}
                        onFocus={() => void warmRouteData(item.href)}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {ready && visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                  return (
                    <SidebarMenuItem
                      key={item.href}
                      className={cn(navItemClassName, isActive && "before:opacity-100")}
                    >
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive}
                        tooltip={item.label}
                        onMouseEnter={() => void warmRouteData(item.href)}
                        onFocus={() => void warmRouteData(item.href)}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <GlobalSettingsDrawer />
          </SidebarMenuItem>

          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    tooltip="Appearance"
                    className="cursor-pointer data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
                  />
                }
              >
                <SunMoon />
                <span>Appearance</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-48 rounded-lg"
                side="top"
                align="start"
                sideOffset={6}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Theme</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={selectedTheme}
                    onValueChange={(value) => setTheme(value)}
                  >
                    {themeOptions.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        className="cursor-pointer"
                      >
                        <option.icon className="text-muted-foreground" />
                        <span>{option.label}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator />

        <SidebarMenu>
          <SidebarMenuItem>
            {ready ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<button />}
                  type="button"
                  data-slot="sidebar-menu-button"
                  data-sidebar="menu-button"
                  data-size="lg"
                  className={cn(
                    sidebarMenuButtonVariants({ size: "lg" }),
                    "cursor-pointer data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
                  )}
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                      {user?.name
                        ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                        : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 gap-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold text-xs">{user?.name || user?.user_id}</span>
                    {role && <RoleBadge role={role} />}
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-56 rounded-lg"
                  side="top"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div
                data-slot="sidebar-menu-button"
                data-sidebar="menu-button"
                data-size="lg"
                className={cn(sidebarMenuButtonVariants({ size: "lg" }))}
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                    ?
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 gap-1 text-left text-sm leading-tight">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
