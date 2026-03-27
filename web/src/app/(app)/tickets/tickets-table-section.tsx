import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import { TicketsTableSectionClient } from "@/app/(app)/tickets/tickets-table-section-client"
import { getDefaultRangePreset, getRangeBounds } from "@/lib/dashboard"
import { getQueryClient } from "@/lib/get-query-client"
import { ticketsQueryOptions } from "@/lib/queries/tickets"
import { getRouteParamValue, type RouteSearchParams } from "@/lib/route-params"
import { serverApiClient } from "@/lib/server-api-client"

export async function TicketsTableSection({
  searchParams,
}: {
  searchParams: RouteSearchParams
}) {
  const queryClient = getQueryClient()
  const range = getDefaultRangePreset(getRouteParamValue(searchParams.range) ?? null)
  const from = getRouteParamValue(searchParams.from) ?? null
  const to = getRouteParamValue(searchParams.to) ?? null
  const bounds = getRangeBounds(range, from, to)
  const page = Math.max(1, Number(getRouteParamValue(searchParams.page) ?? "1"))

  await queryClient.prefetchQuery(
    ticketsQueryOptions(
      {
        page,
        per_page: 25,
        status: getRouteParamValue(searchParams.status) ?? null,
        priority: getRouteParamValue(searchParams.priority) ?? null,
        category: getRouteParamValue(searchParams.category) ?? null,
        team: getRouteParamValue(searchParams.team) ?? null,
        assignee: getRouteParamValue(searchParams.assignee) ?? null,
        created_from: bounds.from,
        created_to: bounds.to,
        updated_before: getRouteParamValue(searchParams.updated_before) ?? null,
        sort_by: getRouteParamValue(searchParams.sort_by) ?? "created_at",
        sort_order: getRouteParamValue(searchParams.sort_order) ?? "desc",
      },
      serverApiClient
    )
  )

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TicketsTableSectionClient />
    </HydrationBoundary>
  )
}
