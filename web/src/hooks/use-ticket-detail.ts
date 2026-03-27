import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import {
  ticketDetailQueryKey,
  ticketDetailQueryOptions,
} from "@/lib/queries/tickets"
import type {
  ApprovalRequest,
  ApprovalResponse,
  DraftGenerationResponse,
  TicketDetail,
  TicketPredictionRecord,
} from "@/types/api"

export function useTicketDetail(ticketId: string) {
  return useQuery({
    ...ticketDetailQueryOptions(ticketId),
    enabled: Boolean(ticketId),
  })
}

export function useUpdateTicket(ticketId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (
      body: Partial<
        Pick<TicketDetail, "status" | "priority" | "assignee_id" | "category" | "team">
      >
    ) => apiClient.patch<TicketDetail>(`/tickets/${ticketId}`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ticketDetailQueryKey(ticketId) })
    },
  })
}

export function useAddMessage(ticketId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: { body: string; is_internal: boolean }) =>
      apiClient.post(`/tickets/${ticketId}/messages`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ticketDetailQueryKey(ticketId) })
    },
  })
}

export function useAssignTicket(ticketId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: { assignee_id: string; team?: string | null }) =>
      apiClient.post<TicketDetail>(`/tickets/${ticketId}/assign`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ticketDetailQueryKey(ticketId) })
    },
  })
}

export function useTriageTicket(ticketId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiClient.post<TicketPredictionRecord>(`/tickets/${ticketId}/triage`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ticketDetailQueryKey(ticketId) })
    },
  })
}

export function useGenerateDraft(ticketId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiClient.post<DraftGenerationResponse>(`/tickets/${ticketId}/draft`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ticketDetailQueryKey(ticketId) })
    },
  })
}

export function useRedraft(ticketId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiClient.post<DraftGenerationResponse>(`/tickets/${ticketId}/redraft`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ticketDetailQueryKey(ticketId) })
    },
  })
}

export function useReviewDraft(ticketId: string, draftId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: ApprovalRequest) => {
      if (!draftId) {
        throw new Error("Draft is unavailable")
      }

      return apiClient.post<ApprovalResponse>(`/drafts/${draftId}/review`, body)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ticketDetailQueryKey(ticketId) }),
        queryClient.invalidateQueries({ queryKey: ["reviews"] }),
      ])
    },
  })
}
