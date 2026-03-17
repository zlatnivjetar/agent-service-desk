import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { CurrentUser } from "@/types/api"

export function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: ["current-user"],
    queryFn: () => apiClient.get<CurrentUser>("/auth/me"),
  })
}
