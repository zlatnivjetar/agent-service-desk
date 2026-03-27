import { useQuery } from "@tanstack/react-query"

import { workspaceUsersQueryOptions } from "@/lib/queries/users"

export function useWorkspaceUsers() {
  return useQuery(workspaceUsersQueryOptions())
}
