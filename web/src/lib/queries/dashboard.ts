import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import {
  buildSearchParams,
  type ApiGetClient,
  withQueryString,
} from "@/lib/queries/shared"
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

function serializeDashboardParams(params: DashboardQueryParams) {
  return buildSearchParams(params)
}

export function dashboardOverviewQueryKey(params: DashboardQueryParams) {
  return ["dashboard-overview", params] as const
}

export function fetchDashboardOverview(
  params: DashboardQueryParams,
  client: ApiGetClient = apiClient
) {
  const query = serializeDashboardParams(params)
  return client.get<DashboardOverview>(withQueryString("/dashboard/overview", query))
}

export function dashboardOverviewQueryOptions(
  params: DashboardQueryParams,
  client: ApiGetClient = apiClient
) {
  return queryOptions({
    queryKey: dashboardOverviewQueryKey(params),
    queryFn: () => fetchDashboardOverview(params, client),
    placeholderData: keepPreviousData,
  })
}

export function dashboardWatchlistQueryKey(params: DashboardQueryParams) {
  return ["dashboard-watchlist", params] as const
}

export function fetchDashboardWatchlist(
  params: DashboardQueryParams,
  client: ApiGetClient = apiClient
) {
  const query = serializeDashboardParams(params)
  return client.get<DashboardWatchlistResponse>(withQueryString("/dashboard/watchlist", query))
}

export function dashboardWatchlistQueryOptions(
  params: DashboardQueryParams,
  client: ApiGetClient = apiClient
) {
  return queryOptions({
    queryKey: dashboardWatchlistQueryKey(params),
    queryFn: () => fetchDashboardWatchlist(params, client),
    placeholderData: keepPreviousData,
  })
}

export const dashboardPreferencesQueryKey = ["dashboard-preferences"] as const

export function fetchDashboardPreferences(client: ApiGetClient = apiClient) {
  return client.get<DashboardPreferences>("/dashboard/preferences")
}

export function dashboardPreferencesQueryOptions(client: ApiGetClient = apiClient) {
  return queryOptions({
    queryKey: dashboardPreferencesQueryKey,
    queryFn: () => fetchDashboardPreferences(client),
    staleTime: 60_000,
  })
}

export function dashboardSavedViewsQueryKey(page: DashboardPage) {
  return ["dashboard-saved-views", page] as const
}

export function fetchDashboardSavedViews(
  page: DashboardPage,
  client: ApiGetClient = apiClient
) {
  return client.get<DashboardSavedView[]>(`/dashboard/views?page=${page}`)
}

export function dashboardSavedViewsQueryOptions(
  page: DashboardPage,
  client: ApiGetClient = apiClient
) {
  return queryOptions({
    queryKey: dashboardSavedViewsQueryKey(page),
    queryFn: () => fetchDashboardSavedViews(page, client),
    staleTime: 60_000,
  })
}
