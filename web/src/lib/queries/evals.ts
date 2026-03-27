import { queryOptions } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import type { ApiGetClient } from "@/lib/queries/shared"
import type {
  EvalComparison,
  EvalRunDetail,
  EvalRunListItem,
  EvalSetListItem,
  PromptVersion,
} from "@/types/api"

export const evalSetsQueryKey = ["eval-sets"] as const
export const evalRunsQueryKey = ["eval-runs"] as const
export const promptVersionsQueryKey = ["prompt-versions"] as const

export function fetchEvalSets(client: ApiGetClient = apiClient) {
  return client.get<EvalSetListItem[]>("/eval/sets")
}

export function evalSetsQueryOptions(client: ApiGetClient = apiClient) {
  return queryOptions({
    queryKey: evalSetsQueryKey,
    queryFn: () => fetchEvalSets(client),
  })
}

export function fetchEvalRuns(client: ApiGetClient = apiClient) {
  return client.get<EvalRunListItem[]>("/eval/runs")
}

export function evalRunsQueryOptions(client: ApiGetClient = apiClient) {
  return queryOptions({
    queryKey: evalRunsQueryKey,
    queryFn: () => fetchEvalRuns(client),
    refetchInterval: (query) => {
      const items = (query.state.data as EvalRunListItem[] | undefined) ?? []
      return items.some((run) => run.status === "pending" || run.status === "running")
        ? 5_000
        : false
    },
  })
}

export function evalRunDetailQueryKey(runId: string) {
  return ["eval-run", runId] as const
}

export function fetchEvalRunDetail(
  runId: string,
  client: ApiGetClient = apiClient
) {
  return client.get<EvalRunDetail>(`/eval/runs/${runId}`)
}

export function evalRunDetailQueryOptions(
  runId: string,
  client: ApiGetClient = apiClient
) {
  return queryOptions({
    queryKey: evalRunDetailQueryKey(runId),
    queryFn: () => fetchEvalRunDetail(runId, client),
  })
}

export function evalComparisonQueryKey(runAId: string, runBId: string) {
  return ["eval-comparison", runAId, runBId] as const
}

export function fetchEvalComparison(
  runAId: string,
  runBId: string,
  client: ApiGetClient = apiClient
) {
  return client.get<EvalComparison>(
    `/eval/runs/compare?run_a_id=${runAId}&run_b_id=${runBId}`
  )
}

export function evalComparisonQueryOptions(
  runAId: string,
  runBId: string,
  client: ApiGetClient = apiClient
) {
  return queryOptions({
    queryKey: evalComparisonQueryKey(runAId, runBId),
    queryFn: () => fetchEvalComparison(runAId, runBId, client),
  })
}

export function fetchPromptVersions(client: ApiGetClient = apiClient) {
  return client.get<PromptVersion[]>("/prompt-versions")
}

export function promptVersionsQueryOptions(client: ApiGetClient = apiClient) {
  return queryOptions({
    queryKey: promptVersionsQueryKey,
    queryFn: () => fetchPromptVersions(client),
  })
}
