import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { PaginatedResponse, TicketListItem } from "@/types/api"

export interface TicketParams {
  page?: number
  per_page?: number
  status?: string | null
  priority?: string | null
  assignee?: string | null
  assignee_id?: string | null
  category?: string | null
  team?: string | null
  created_from?: string | null
  created_to?: string | null
  updated_before?: string | null
  sort_by?: string
  sort_order?: string
}

export function useTickets(
  params: TicketParams,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: ["tickets", params],
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval,
    queryFn: () => {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value != null) searchParams.set(key, String(value))
      })
      return apiClient.get<PaginatedResponse<TicketListItem>>(`/tickets?${searchParams}`)
    },
  })
}
