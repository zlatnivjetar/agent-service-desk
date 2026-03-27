import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { apiClient } from "@/lib/api-client"
import {
  buildSearchParams,
  type ApiGetClient,
  withQueryString,
} from "@/lib/queries/shared"
import type {
  KnowledgeDocDetail,
  KnowledgeDocListItem,
  PaginatedResponse,
} from "@/types/api"

export interface KnowledgeParams {
  page?: number
  per_page?: number
  status?: string | null
  visibility?: string | null
  stalled?: boolean | null
}

function serializeKnowledgeParams(params: KnowledgeParams) {
  return buildSearchParams(params)
}

export function knowledgeDocsQueryKey(params: KnowledgeParams) {
  return ["knowledge-docs", params] as const
}

export function fetchKnowledgeDocs(
  params: KnowledgeParams,
  client: ApiGetClient = apiClient
) {
  const query = serializeKnowledgeParams(params)

  return client.get<PaginatedResponse<KnowledgeDocListItem>>(
    withQueryString("/knowledge/documents", query)
  )
}

export function knowledgeDocsQueryOptions(
  params: KnowledgeParams,
  client: ApiGetClient = apiClient
) {
  return queryOptions({
    queryKey: knowledgeDocsQueryKey(params),
    queryFn: () => fetchKnowledgeDocs(params, client),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const items =
        (
          query.state.data as
            | PaginatedResponse<KnowledgeDocListItem>
            | undefined
        )?.items ?? []

      return items.some((document) => document.status === "processing")
        ? 5_000
        : false
    },
  })
}

export function knowledgeDocDetailQueryKey(docId: string) {
  return ["knowledge-doc", docId] as const
}

export function fetchKnowledgeDocDetail(
  docId: string,
  client: ApiGetClient = apiClient
) {
  return client.get<KnowledgeDocDetail>(`/knowledge/documents/${docId}`)
}

export function knowledgeDocDetailQueryOptions(
  docId: string,
  client: ApiGetClient = apiClient
) {
  return queryOptions({
    queryKey: knowledgeDocDetailQueryKey(docId),
    queryFn: () => fetchKnowledgeDocDetail(docId, client),
  })
}
