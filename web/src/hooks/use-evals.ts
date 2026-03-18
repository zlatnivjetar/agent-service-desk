import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type {
  EvalComparison,
  EvalRunDetail,
  EvalRunListItem,
  EvalSetListItem,
  PromptVersion,
} from "@/types/api"

export function useEvalSets() {
  return useQuery({
    queryKey: ["eval-sets"],
    queryFn: () => apiClient.get<EvalSetListItem[]>("/eval/sets"),
  })
}

export function useEvalRuns() {
  return useQuery({
    queryKey: ["eval-runs"],
    queryFn: () => apiClient.get<EvalRunListItem[]>("/eval/runs"),
    refetchInterval: (query) => {
      const items = (query.state.data as EvalRunListItem[] | undefined) ?? []
      return items.some((r) => r.status === "pending" || r.status === "running")
        ? 5_000
        : false
    },
  })
}

export function useEvalRunDetail(runId: string) {
  return useQuery({
    queryKey: ["eval-run", runId],
    queryFn: () => apiClient.get<EvalRunDetail>(`/eval/runs/${runId}`),
    enabled: !!runId,
  })
}

export function useEvalComparison(runAId: string, runBId: string) {
  return useQuery({
    queryKey: ["eval-comparison", runAId, runBId],
    queryFn: () =>
      apiClient.get<EvalComparison>(
        `/eval/runs/compare?run_a_id=${runAId}&run_b_id=${runBId}`
      ),
    enabled: !!runAId && !!runBId,
  })
}

export function usePromptVersions() {
  return useQuery({
    queryKey: ["prompt-versions"],
    queryFn: () => apiClient.get<PromptVersion[]>("/prompt-versions"),
  })
}

export function useCreateEvalRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { eval_set_id: string; prompt_version_id: string }) =>
      apiClient.post<EvalRunListItem>("/eval/runs", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eval-runs"] })
    },
  })
}
