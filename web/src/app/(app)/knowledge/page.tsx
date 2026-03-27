import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import KnowledgePageClient from "@/app/(app)/knowledge/knowledge-page-client"
import { getQueryClient } from "@/lib/get-query-client"
import { knowledgeDocsQueryOptions } from "@/lib/queries/knowledge"
import { getRouteParamValue, type RouteSearchParams } from "@/lib/route-params"
import { serverApiClient } from "@/lib/server-api-client"
import { getServerAuthContext } from "@/lib/server-auth"

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>
}) {
  const resolvedSearchParams = await searchParams
  const queryClient = getQueryClient()
  const authContext = await getServerAuthContext()

  if (authContext?.currentUser.role !== "client_user") {
    await queryClient.prefetchQuery(
      knowledgeDocsQueryOptions(
        {
          page: Math.max(1, Number(getRouteParamValue(resolvedSearchParams.page) ?? "1")),
          per_page: 20,
          status: getRouteParamValue(resolvedSearchParams.status) ?? null,
          visibility: getRouteParamValue(resolvedSearchParams.visibility) ?? null,
          stalled: getRouteParamValue(resolvedSearchParams.stalled) === "true" ? true : null,
        },
        serverApiClient
      )
    )
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <KnowledgePageClient />
    </HydrationBoundary>
  )
}
