"use client"

import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { Inbox, ClipboardCheck, BookOpen, FlaskConical, ChevronsUpDown, LogOut } from "lucide-react"
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
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RoleBadge } from "@/components/ui/status-badges"
import { useCurrentUser } from "@/hooks/use-current-user"
import { authClient } from "@/lib/auth-client"
import { clearTokenCache } from "@/lib/api-client"

const workspaceNav = [
  { label: "Tickets", href: "/tickets", icon: Inbox, roles: ["client_user", "support_agent", "team_lead"] },
  { label: "Review Queue", href: "/reviews", icon: ClipboardCheck, roles: ["support_agent", "team_lead"] },
  { label: "Knowledge", href: "/knowledge", icon: BookOpen, roles: ["support_agent", "team_lead"] },
]

const adminNav = [
  { label: "Eval Console", href: "/evals", icon: FlaskConical, roles: ["team_lead"] },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: user, isPending } = useCurrentUser()
  const role = user?.role ?? ""

  const visibleWorkspace = workspaceNav.filter((item) => item.roles.includes(role))
  const visibleAdmin = adminNav.filter((item) => item.roles.includes(role))

  async function handleSignOut() {
    clearTokenCache()
    await authClient.signOut()
    router.push("/login")
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0D9488] text-white text-xs font-semibold flex-shrink-0">
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
              {isPending ? (
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
                    <SidebarMenuItem key={item.href}>
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

        {!isPending && visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                  return (
                    <SidebarMenuItem key={item.href}>
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
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer"
                  />
                }
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-[#0D9488] text-white text-xs">
                    {user?.name ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "…"}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight gap-1">
                  {isPending ? (
                    <>
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-14" />
                    </>
                  ) : (
                    <>
                      <span className="truncate font-semibold text-xs">{user?.name || user?.user_id}</span>
                      {role && <RoleBadge role={role} />}
                    </>
                  )}
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
