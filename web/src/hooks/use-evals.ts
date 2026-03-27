import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import {
  evalComparisonQueryOptions,
  evalRunDetailQueryOptions,
  evalRunsQueryKey,
  evalRunsQueryOptions,
  evalSetsQueryOptions,
  promptVersionsQueryOptions,
} from "@/lib/queries/evals"
import type { EvalRunListItem } from "@/types/api"

export function useEvalSets() {
  return useQuery(evalSetsQueryOptions())
}

export function useEvalRuns() {
  return useQuery(evalRunsQueryOptions())
}

export function useEvalRunDetail(runId: string) {
  return useQuery({
    ...evalRunDetailQueryOptions(runId),
    enabled: !!runId,
  })
}

export function useEvalComparison(runAId: string, runBId: string) {
  return useQuery({
    ...evalComparisonQueryOptions(runAId, runBId),
    enabled: !!runAId && !!runBId,
  })
}

export function usePromptVersions() {
  return useQuery(promptVersionsQueryOptions())
}

export function useCreateEvalRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { eval_set_id: string; prompt_version_id: string }) =>
      apiClient.post<EvalRunListItem>("/eval/runs", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: evalRunsQueryKey })
    },
  })
}
