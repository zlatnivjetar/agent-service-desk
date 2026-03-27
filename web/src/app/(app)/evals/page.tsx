import { Suspense } from "react"
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import EvalsPageClient from "@/app/(app)/evals/evals-page-client"
import { EvalRunsSection } from "@/app/(app)/evals/eval-runs-section"
import { DataTable, DataTableSkeleton } from "@/components/ui/data-table"
import { TableBody } from "@/components/ui/table"
import { getQueryClient } from "@/lib/get-query-client"
import {
  evalSetsQueryOptions,
  promptVersionsQueryOptions,
} from "@/lib/queries/evals"
import type { RouteSearchParams } from "@/lib/route-params"
import { serverApiClient } from "@/lib/server-api-client"
import { getServerAuthContext } from "@/lib/server-auth"

export default async function EvalsPage({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>
}) {
  const resolvedSearchParams = await searchParams
  const queryClient = getQueryClient()
  const authContext = await getServerAuthContext()
  const isTeamLead = authContext?.currentUser.role === "team_lead"

  if (isTeamLead) {
    await Promise.all([
      queryClient.prefetchQuery(evalSetsQueryOptions(serverApiClient)),
      queryClient.prefetchQuery(promptVersionsQueryOptions(serverApiClient)),
    ])
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <EvalsPageClient
        runsSection={
          isTeamLead ? (
            <Suspense fallback={<EvalRunsFallback />}>
              <EvalRunsSection searchParams={resolvedSearchParams} />
            </Suspense>
          ) : null
        }
      />
    </HydrationBoundary>
  )
}

function EvalRunsFallback() {
  return (
    <DataTable>
      <TableBody>
        <DataTableSkeleton
          columns={8}
          columnWidths={["w-20", "w-48", "w-40", "w-24", "w-20", "w-20", "w-24", "w-24"]}
        />
      </TableBody>
    </DataTable>
  )
}
