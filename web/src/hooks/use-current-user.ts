import { useQuery } from "@tanstack/react-query"

import { authClient } from "@/lib/auth-client"
import { currentUserQueryOptions } from "@/lib/queries/auth"

export function useCurrentUser() {
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const sessionUserId = session?.user?.id ?? null

  return useQuery({
    ...currentUserQueryOptions(),
    enabled: !sessionPending && sessionUserId !== null,
  })
}
