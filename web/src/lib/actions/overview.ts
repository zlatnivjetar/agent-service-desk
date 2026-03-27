import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import {
  fetchDashboardOverview,
  fetchDashboardWatchlist,
  type DashboardQueryParams,
} from "@/lib/queries/dashboard"
import type { ApiGetClient } from "@/lib/queries/shared"
import type { DashboardOverview, DashboardWatchlistResponse } from "@/types/api"

export interface OverviewCombinedParams {
  params: DashboardQueryParams
  comparisonParams?: DashboardQueryParams | null
}

export interface OverviewCombinedData {
  overview: DashboardOverview
  comparisonOverview: DashboardOverview | null
  watchlist: DashboardWatchlistResponse
}

export async function getOverviewCombined(
  { params, comparisonParams }: OverviewCombinedParams,
  client: ApiGetClient = apiClient
): Promise<OverviewCombinedData> {
  const [overview, comparisonOverview, watchlist] = await Promise.all([
    fetchDashboardOverview(params, client),
    comparisonParams ? fetchDashboardOverview(comparisonParams, client) : Promise.resolve(null),
    fetchDashboardWatchlist(params, client),
  ])

  return {
    overview,
    comparisonOverview,
    watchlist,
  }
}

export function overviewCombinedQueryKey({
  params,
  comparisonParams,
}: OverviewCombinedParams) {
  return ["overview-combined", params, comparisonParams ?? null] as const
}

export function overviewCombinedQueryOptions(
  input: OverviewCombinedParams,
  client: ApiGetClient = apiClient
) {
  return queryOptions({
    queryKey: overviewCombinedQueryKey(input),
    queryFn: () => getOverviewCombined(input, client),
    placeholderData: keepPreviousData,
  })
}
