import { useQuery } from "@tanstack/react-query"
import { ticketsQueryOptions } from "@/lib/queries/tickets"

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
    ...ticketsQueryOptions(params),
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval,
  })
}
