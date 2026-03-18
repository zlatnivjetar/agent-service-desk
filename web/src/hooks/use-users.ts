import { useQuery } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import type { UserListItem } from "@/types/api"

export function useWorkspaceUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => apiClient.get<UserListItem[]>("/users"),
    staleTime: 5 * 60 * 1000, // users list changes rarely
  })
}
