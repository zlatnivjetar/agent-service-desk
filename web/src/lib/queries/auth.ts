import { queryOptions } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import type { ApiGetClient } from "@/lib/queries/shared"
import type { CurrentUser } from "@/types/api"

export const currentUserQueryKey = ["current-user"] as const

export function fetchCurrentUser(client: ApiGetClient = apiClient) {
  return client.get<CurrentUser>("/auth/me")
}

export function currentUserQueryOptions(client: ApiGetClient = apiClient) {
  return queryOptions({
    queryKey: currentUserQueryKey,
    queryFn: () => fetchCurrentUser(client),
    staleTime: 60_000,
  })
}
