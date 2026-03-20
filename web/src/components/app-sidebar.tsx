"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
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
import { GlobalSettingsDrawer } from "@/components/global-settings-drawer"
import { authClient } from "@/lib/auth-client"
import { clearTokenCache } from "@/lib/api-client"
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
