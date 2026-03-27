import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import { OverviewMetricsSectionClient } from "@/app/(app)/overview/overview-metrics-section-client"
import { overviewCombinedQueryOptions } from "@/lib/actions/overview"
import {
  getDefaultRangePreset,
  getPreviousRangeBounds,
  getRangeBounds,
} from "@/lib/dashboard"
import { getQueryClient } from "@/lib/get-query-client"
import { getRouteParamValue, type RouteSearchParams } from "@/lib/route-params"
import { serverApiClient } from "@/lib/server-api-client"

export async function OverviewMetricsSection({
  searchParams,
}: {
  searchParams: RouteSearchParams
}) {
  const queryClient = getQueryClient()

  const range = getDefaultRangePreset(getRouteParamValue(searchParams.range) ?? null)
  const from = getRouteParamValue(searchParams.from) ?? null
  const to = getRouteParamValue(searchParams.to) ?? null
  const team = getRouteParamValue(searchParams.team) ?? null
  const assigneeId = getRouteParamValue(searchParams.assignee_id) ?? null
  const compareMode = getRouteParamValue(searchParams.compare) === "1"

  const rangeBounds = getRangeBounds(range, from, to)
  const comparisonBounds = compareMode
    ? getPreviousRangeBounds(rangeBounds.from, rangeBounds.to)
    : null

  await queryClient.prefetchQuery(
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
  )

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OverviewMetricsSectionClient />
    </HydrationBoundary>
  )
}
