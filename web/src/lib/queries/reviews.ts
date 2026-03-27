import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import {
  buildSearchParams,
  type ApiGetClient,
  withQueryString,
} from "@/lib/queries/shared"
import type { DraftQueueItem, PaginatedResponse } from "@/types/api"

export interface ReviewQueueParams {
  page: number
  per_page: number
  confidence_max?: number | null
  created_before?: string | null
  sort_by?: string
  sort_order?: string
}

function serializeReviewQueueParams(params: ReviewQueueParams) {
  return buildSearchParams(params)
}

export function reviewQueueQueryKey(params: ReviewQueueParams) {
  return ["reviews", params] as const
}

export function fetchReviewQueue(
  params: ReviewQueueParams,
  client: ApiGetClient = apiClient
) {
  const query = serializeReviewQueueParams(params)
  return client.get<PaginatedResponse<DraftQueueItem>>(
    withQueryString("/drafts/review-queue", query)
  )
}

export function reviewQueueQueryOptions(
  params: ReviewQueueParams,
  client: ApiGetClient = apiClient
) {
  return queryOptions({
    queryKey: reviewQueueQueryKey(params),
    queryFn: () => fetchReviewQueue(params, client),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
}
