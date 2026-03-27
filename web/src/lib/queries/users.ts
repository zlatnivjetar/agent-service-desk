import { queryOptions } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import type { ApiGetClient } from "@/lib/queries/shared"
import type { UserListItem } from "@/types/api"

export const workspaceUsersQueryKey = ["users"] as const

export function fetchWorkspaceUsers(client: ApiGetClient = apiClient) {
  return client.get<UserListItem[]>("/users")
}

export function workspaceUsersQueryOptions(client: ApiGetClient = apiClient) {
  return queryOptions({
    queryKey: workspaceUsersQueryKey,
    queryFn: () => fetchWorkspaceUsers(client),
    staleTime: 5 * 60_000,
  })
}
