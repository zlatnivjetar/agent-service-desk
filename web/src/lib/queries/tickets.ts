import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import {
  buildSearchParams,
  type ApiGetClient,
  withQueryString,
} from "@/lib/queries/shared"
import type { PaginatedResponse, TicketDetail, TicketListItem } from "@/types/api"

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

function serializeTicketParams(params: TicketParams) {
  return buildSearchParams(params)
}

export function ticketsQueryKey(params: TicketParams) {
  return ["tickets", params] as const
}

export function fetchTickets(
  params: TicketParams,
  client: ApiGetClient = apiClient
) {
  const query = serializeTicketParams(params)
  return client.get<PaginatedResponse<TicketListItem>>(withQueryString("/tickets", query))
}

export function ticketsQueryOptions(
  params: TicketParams,
  client: ApiGetClient = apiClient
) {
  return queryOptions({
    queryKey: ticketsQueryKey(params),
    queryFn: () => fetchTickets(params, client),
    placeholderData: keepPreviousData,
  })
}

export function ticketDetailQueryKey(ticketId: string) {
  return ["ticket", ticketId] as const
}

export function fetchTicketDetail(
  ticketId: string,
  client: ApiGetClient = apiClient
) {
  return client.get<TicketDetail>(`/tickets/${ticketId}`)
}

export function ticketDetailQueryOptions(
  ticketId: string,
  client: ApiGetClient = apiClient
) {
  return queryOptions({
    queryKey: ticketDetailQueryKey(ticketId),
    queryFn: () => fetchTicketDetail(ticketId, client),
  })
}
