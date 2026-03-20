import { useQuery } from "@tanstack/react-query"

import { authClient } from "@/lib/auth-client"
import { apiClient } from "@/lib/api-client"
import type { CurrentUser } from "@/types/api"

export function useCurrentUser() {
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const sessionUserId = session?.user?.id ?? null

  return useQuery<CurrentUser>({
    queryKey: ["current-user", sessionUserId],
    enabled: !sessionPending && sessionUserId !== null,
    queryFn: () => apiClient.get<CurrentUser>("/auth/me"),
  })
}
