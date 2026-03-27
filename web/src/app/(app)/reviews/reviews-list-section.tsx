import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import { ReviewsListSectionClient } from "@/app/(app)/reviews/reviews-list-section-client"
import { getQueryClient } from "@/lib/get-query-client"
import { reviewQueueQueryOptions } from "@/lib/queries/reviews"
import { getRouteParamValue, type RouteSearchParams } from "@/lib/route-params"
import { serverApiClient } from "@/lib/server-api-client"

export async function ReviewsListSection({
  searchParams,
}: {
  searchParams: RouteSearchParams
}) {
  const queryClient = getQueryClient()

  await queryClient.prefetchQuery(
    reviewQueueQueryOptions(
      {
        page: Math.max(1, Number(getRouteParamValue(searchParams.page) ?? "1")),
        per_page: 20,
        confidence_max: (() => {
          const value = getRouteParamValue(searchParams.confidence_max)
          return value ? Number(value) : null
        })(),
        created_before: getRouteParamValue(searchParams.created_before) ?? null,
        sort_by: getRouteParamValue(searchParams.sort_by) ?? "created_at",
        sort_order: getRouteParamValue(searchParams.sort_order) ?? "asc",
      },
      serverApiClient
    )
  )

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ReviewsListSectionClient />
    </HydrationBoundary>
  )
}
