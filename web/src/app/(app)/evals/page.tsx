import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import EvalsPageClient from "@/app/(app)/evals/evals-page-client"
import { getQueryClient } from "@/lib/get-query-client"
import {
  evalRunsQueryOptions,
  evalSetsQueryOptions,
  promptVersionsQueryOptions,
} from "@/lib/queries/evals"
import { serverApiClient } from "@/lib/server-api-client"
import { getServerAuthContext } from "@/lib/server-auth"

export default async function EvalsPage() {
  const queryClient = getQueryClient()
  const authContext = await getServerAuthContext()

  if (authContext?.currentUser.role === "team_lead") {
    await Promise.all([
      queryClient.prefetchQuery(evalRunsQueryOptions(serverApiClient)),
      queryClient.prefetchQuery(evalSetsQueryOptions(serverApiClient)),
      queryClient.prefetchQuery(promptVersionsQueryOptions(serverApiClient)),
    ])
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EvalsPageClient />
    </HydrationBoundary>
  )
}
