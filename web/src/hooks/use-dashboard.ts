import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import {
  dashboardOverviewQueryOptions,
  dashboardPreferencesQueryKey,
  dashboardPreferencesQueryOptions,
  dashboardSavedViewsQueryKey,
  dashboardSavedViewsQueryOptions,
  dashboardWatchlistQueryOptions,
} from "@/lib/queries/dashboard"
import type {
  DashboardPage,
  DashboardPreferences,
  DashboardSavedView,
} from "@/types/api"

export interface DashboardQueryParams {
  range?: string
  from?: string | null
  to?: string | null
  team?: string | null
  assignee_id?: string | null
}

export function useDashboardOverview(
  params: DashboardQueryParams,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery({
    ...dashboardOverviewQueryOptions(params),
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval,
  })
}

export function useDashboardWatchlist(
  params: DashboardQueryParams,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery({
    ...dashboardWatchlistQueryOptions(params),
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval,
  })
}

export function useDashboardPreferences(options?: { enabled?: boolean }) {
  return useQuery({
    ...dashboardPreferencesQueryOptions(),
    enabled: options?.enabled !== false,
  })
}

export function useUpdateDashboardPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<DashboardPreferences>) =>
      apiClient.patch<DashboardPreferences>("/dashboard/preferences", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardPreferencesQueryKey })
    },
  })
}

export function useDashboardSavedViews(
  page: DashboardPage,
  options?: { enabled?: boolean }
) {
  return useQuery({
    ...dashboardSavedViewsQueryOptions(page),
    enabled: options?.enabled !== false,
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
        queryKey: dashboardSavedViewsQueryKey(variables.page),
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
      queryClient.invalidateQueries({ queryKey: dashboardSavedViewsQueryKey(page) })
      queryClient.invalidateQueries({ queryKey: dashboardPreferencesQueryKey })
    },
  })
}

export function useDeleteDashboardSavedView(page: DashboardPage) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/dashboard/views/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardSavedViewsQueryKey(page) })
      queryClient.invalidateQueries({ queryKey: dashboardPreferencesQueryKey })
    },
  })
}
