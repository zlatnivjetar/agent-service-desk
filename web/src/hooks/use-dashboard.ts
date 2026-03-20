import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import type {
  DashboardOverview,
  DashboardPage,
  DashboardPreferences,
  DashboardSavedView,
  DashboardWatchlistResponse,
} from "@/types/api"

export interface DashboardQueryParams {
  range?: string
  from?: string | null
  to?: string | null
  team?: string | null
  assignee_id?: string | null
}

function toSearchParams(params: Record<string, string | number | null | undefined>) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") {
      searchParams.set(key, String(value))
    }
  })
  return searchParams.toString()
}

export function useDashboardOverview(
  params: DashboardQueryParams,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  const query = toSearchParams(params as Record<string, string | number | null | undefined>)
  return useQuery({
    queryKey: ["dashboard-overview", params],
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval,
    queryFn: () => apiClient.get<DashboardOverview>(`/dashboard/overview?${query}`),
  })
}

export function useDashboardWatchlist(
  params: DashboardQueryParams,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  const query = toSearchParams(params as Record<string, string | number | null | undefined>)
  return useQuery({
    queryKey: ["dashboard-watchlist", params],
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval,
    queryFn: () =>
      apiClient.get<DashboardWatchlistResponse>(`/dashboard/watchlist?${query}`),
  })
}

export function useDashboardPreferences(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["dashboard-preferences"],
    enabled: options?.enabled !== false,
    queryFn: () => apiClient.get<DashboardPreferences>("/dashboard/preferences"),
  })
}

export function useUpdateDashboardPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<DashboardPreferences>) =>
      apiClient.patch<DashboardPreferences>("/dashboard/preferences", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-preferences"] })
    },
  })
}

export function useDashboardSavedViews(
  page: DashboardPage,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["dashboard-saved-views", page],
    enabled: options?.enabled !== false,
    queryFn: () =>
      apiClient.get<DashboardSavedView[]>(`/dashboard/views?page=${page}`),
  })
}

export function useCreateDashboardSavedView() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      page: DashboardPage
      name: string
      state: Record<string, unknown>
    }) => apiClient.post<DashboardSavedView>("/dashboard/views", body),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-saved-views", variables.page],
      })
    },
  })
}

export function useUpdateDashboardSavedView(page: DashboardPage) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: { name?: string; state?: Record<string, unknown> }
    }) => apiClient.patch<DashboardSavedView>(`/dashboard/views/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-saved-views", page] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-preferences"] })
    },
  })
}

export function useDeleteDashboardSavedView(page: DashboardPage) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/dashboard/views/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-saved-views", page] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-preferences"] })
    },
  })
}
