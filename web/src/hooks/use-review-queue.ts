import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import { ticketDetailQueryKey } from "@/hooks/use-ticket-detail"
import type { ApprovalRequest, ApprovalResponse, DraftQueueItem, PaginatedResponse } from "@/types/api"

export function useReviewQueue(
  params: {
    page: number
    per_page: number
    confidence_max?: number | null
    created_before?: string | null
    sort_by?: string
    sort_order?: string
  },
  options?: { enabled?: boolean }
) {
  const searchParams = new URLSearchParams()
  searchParams.set("page", String(params.page))
  searchParams.set("per_page", String(params.per_page))
  if (params.confidence_max != null) {
    searchParams.set("confidence_max", String(params.confidence_max))
  }
  if (params.created_before) {
    searchParams.set("created_before", params.created_before)
  }
  if (params.sort_by) {
    searchParams.set("sort_by", params.sort_by)
  }
  if (params.sort_order) {
    searchParams.set("sort_order", params.sort_order)
  }

  return useQuery({
    queryKey: ["reviews", params],
    enabled: options?.enabled !== false,
    queryFn: () =>
      apiClient.get<PaginatedResponse<DraftQueueItem>>(`/drafts/review-queue?${searchParams}`),
    refetchInterval: 30_000,
  })
}

export function useReviewDraftFromQueue(draftId: string, ticketId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: ApprovalRequest) =>
      apiClient.post<ApprovalResponse>(`/drafts/${draftId}/review`, body),
    onSuccess: async () => {
      const invalidations: Promise<void>[] = [
        queryClient.invalidateQueries({ queryKey: ["reviews"] }),
      ]
      if (ticketId) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: ticketDetailQueryKey(ticketId) })
        )
      }
      await Promise.all(invalidations)
    },
  })
}
