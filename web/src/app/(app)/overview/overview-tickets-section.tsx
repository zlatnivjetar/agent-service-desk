import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import { OverviewTicketsSectionClient } from "@/app/(app)/overview/overview-tickets-section-client"
import {
  getAgeBucketRange,
  getDefaultRangePreset,
  getRangeBounds,
} from "@/lib/dashboard"
import { getQueryClient } from "@/lib/get-query-client"
import { ticketsQueryOptions } from "@/lib/queries/tickets"
import { getRouteParamValue, type RouteSearchParams } from "@/lib/route-params"
import { serverApiClient } from "@/lib/server-api-client"

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

export async function OverviewTicketsSection({
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
  const selectedStatus = getRouteParamValue(searchParams.status) ?? null
  const selectedPriority = getRouteParamValue(searchParams.priority) ?? null
  const selectedAgeBucket = getRouteParamValue(searchParams.age_bucket) ?? null
  const page = Math.max(1, Number(getRouteParamValue(searchParams.page) ?? "1"))

  const rangeBounds = getRangeBounds(range, from, to)
  const ageBounds = selectedAgeBucket
    ? getAgeBucketRange(selectedAgeBucket, rangeBounds.to)
    : { from: null, to: null }
  const createdFrom = maxDate(rangeBounds.from, ageBounds.from)
  const createdTo = minDate(rangeBounds.to, ageBounds.to)

  await queryClient.prefetchQuery(
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
  )

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OverviewTicketsSectionClient />
    </HydrationBoundary>
  )
}
