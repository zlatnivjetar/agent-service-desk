import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { AppSidebar } from "@/components/app-sidebar"
import { PageBreadcrumb } from "@/components/page-breadcrumb"
import { ErrorBoundary } from "@/components/error-boundary"
import { Toaster } from "@/components/ui/sonner"
import { getQueryClient } from "@/lib/get-query-client"
import { currentUserQueryKey } from "@/lib/queries/auth"
import { workspaceUsersQueryOptions } from "@/lib/queries/users"
import { serverApiClient } from "@/lib/server-api-client"
import { getServerAuthContext } from "@/lib/server-auth"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()
  const authContext = await getServerAuthContext()

  if (authContext) {
    queryClient.setQueryData(currentUserQueryKey, authContext.currentUser)

    if (authContext.currentUser.role !== "client_user") {
      await queryClient.prefetchQuery(workspaceUsersQueryOptions(serverApiClient))
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 sm:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <PageBreadcrumb />
          </header>
          <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </HydrationBoundary>
  )
}
