import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import { KnowledgeListSectionClient } from "@/app/(app)/knowledge/knowledge-list-section-client"
import { getQueryClient } from "@/lib/get-query-client"
import { knowledgeDocsQueryOptions } from "@/lib/queries/knowledge"
import { getRouteParamValue, type RouteSearchParams } from "@/lib/route-params"
import { serverApiClient } from "@/lib/server-api-client"

export async function KnowledgeListSection({
  searchParams,
}: {
  searchParams: RouteSearchParams
}) {
  const queryClient = getQueryClient()

  await queryClient.prefetchQuery(
    knowledgeDocsQueryOptions(
      {
        page: Math.max(1, Number(getRouteParamValue(searchParams.page) ?? "1")),
        per_page: 20,
        status: getRouteParamValue(searchParams.status) ?? null,
        visibility: getRouteParamValue(searchParams.visibility) ?? null,
        stalled: getRouteParamValue(searchParams.stalled) === "true" ? true : null,
      },
      serverApiClient
    )
  )

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <KnowledgeListSectionClient />
    </HydrationBoundary>
  )
}
