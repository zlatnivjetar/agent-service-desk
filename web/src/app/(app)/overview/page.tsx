import { Suspense } from "react"
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

import OverviewPageClient from "@/app/(app)/overview/overview-page-client"
import { OverviewMetricsSection } from "@/app/(app)/overview/overview-metrics-section"
import { OverviewTicketsSection } from "@/app/(app)/overview/overview-tickets-section"
import { getQueryClient } from "@/lib/get-query-client"
import {
  dashboardPreferencesQueryOptions,
  dashboardSavedViewsQueryOptions,
} from "@/lib/queries/dashboard"
import { type RouteSearchParams } from "@/lib/route-params"
import { serverApiClient } from "@/lib/server-api-client"
import { getServerAuthContext } from "@/lib/server-auth"

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>
}) {
  const resolvedSearchParams = await searchParams
  const queryClient = getQueryClient()
  const authContext = await getServerAuthContext()
  const isInternal =
    authContext?.currentUser.role === "support_agent" ||
    authContext?.currentUser.role === "team_lead"

  if (isInternal) {
    await Promise.all([
      queryClient.prefetchQuery(dashboardPreferencesQueryOptions(serverApiClient)),
      queryClient.prefetchQuery(dashboardSavedViewsQueryOptions("overview", serverApiClient)),
    ])
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OverviewPageClient
        metricsSection={
          isInternal ? (
            <Suspense fallback={<OverviewMetricsFallback />}>
              <OverviewMetricsSection searchParams={resolvedSearchParams} />
            </Suspense>
          ) : null
        }
        ticketsSection={
          isInternal ? (
            <Suspense fallback={<OverviewTicketsFallback />}>
              <OverviewTicketsSection searchParams={resolvedSearchParams} />
            </Suspense>
          ) : null
        }
      />
    </HydrationBoundary>
  )
}

function OverviewMetricsFallback() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="mb-2 h-4 w-32" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[200px] w-full rounded-lg" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[200px] w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function OverviewTicketsFallback() {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}
