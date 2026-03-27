import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import { ticketDetailQueryKey } from "@/lib/queries/tickets"
import { reviewQueueQueryOptions } from "@/lib/queries/reviews"
import type { ApprovalRequest, ApprovalResponse } from "@/types/api"

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
  return useQuery({
    ...reviewQueueQueryOptions(params),
    enabled: options?.enabled !== false,
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
