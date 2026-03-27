import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import OverviewPageClient from "@/app/(app)/overview/overview-page-client"
import { overviewCombinedQueryOptions } from "@/lib/actions/overview"
import {
  getAgeBucketRange,
  getDefaultRangePreset,
  getPreviousRangeBounds,
  getRangeBounds,
} from "@/lib/dashboard"
import { getQueryClient } from "@/lib/get-query-client"
import {
  dashboardPreferencesQueryOptions,
  dashboardSavedViewsQueryOptions,
} from "@/lib/queries/dashboard"
import { ticketsQueryOptions } from "@/lib/queries/tickets"
import { getRouteParamValue, type RouteSearchParams } from "@/lib/route-params"
import { serverApiClient } from "@/lib/server-api-client"
import { getServerAuthContext } from "@/lib/server-auth"

function maxDate(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

function minDate(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

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
    const range = getDefaultRangePreset(getRouteParamValue(resolvedSearchParams.range) ?? null)
    const from = getRouteParamValue(resolvedSearchParams.from) ?? null
    const to = getRouteParamValue(resolvedSearchParams.to) ?? null
    const team = getRouteParamValue(resolvedSearchParams.team) ?? null
    const assigneeId = getRouteParamValue(resolvedSearchParams.assignee_id) ?? null
    const selectedStatus = getRouteParamValue(resolvedSearchParams.status) ?? null
    const selectedPriority = getRouteParamValue(resolvedSearchParams.priority) ?? null
    const selectedAgeBucket = getRouteParamValue(resolvedSearchParams.age_bucket) ?? null
    const compareMode = getRouteParamValue(resolvedSearchParams.compare) === "1"
    const page = Math.max(1, Number(getRouteParamValue(resolvedSearchParams.page) ?? "1"))

    const rangeBounds = getRangeBounds(range, from, to)
    const comparisonBounds = compareMode
      ? getPreviousRangeBounds(rangeBounds.from, rangeBounds.to)
      : null
    const ageBounds = selectedAgeBucket
      ? getAgeBucketRange(selectedAgeBucket, rangeBounds.to)
      : { from: null, to: null }
    const createdFrom = maxDate(rangeBounds.from, ageBounds.from)
    const createdTo = minDate(rangeBounds.to, ageBounds.to)

    await Promise.all([
      queryClient.prefetchQuery(dashboardPreferencesQueryOptions(serverApiClient)),
      queryClient.prefetchQuery(dashboardSavedViewsQueryOptions("overview", serverApiClient)),
      queryClient.prefetchQuery(
        overviewCombinedQueryOptions(
          {
            params: {
              range,
              from: range === "custom" ? from : undefined,
              to: range === "custom" ? to : undefined,
              team,
              assignee_id: assigneeId,
            },
            comparisonParams: comparisonBounds
              ? {
                  range: "custom",
                  from: comparisonBounds.from,
                  to: comparisonBounds.to,
                  team,
                  assignee_id: assigneeId,
                }
              : null,
          },
          serverApiClient
        )
      ),
      queryClient.prefetchQuery(
        ticketsQueryOptions(
          {
            page,
            per_page: 10,
            status: selectedStatus,
            priority: selectedPriority,
            team,
            assignee_id: assigneeId,
            created_from: createdFrom,
            created_to: createdTo,
            sort_by: "created_at",
            sort_order: "desc",
          },
          serverApiClient
        )
      ),
    ])
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OverviewPageClient />
    </HydrationBoundary>
  )
}
