import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient, API_URL, getToken } from "@/lib/api-client"
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
}

export function useKnowledgeDocs(
  params: KnowledgeParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["knowledge-docs", params],
    enabled: options?.enabled !== false,
    queryFn: () => {
      const sp = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value != null) sp.set(key, String(value))
      })
      return apiClient.get<PaginatedResponse<KnowledgeDocListItem>>(
        `/knowledge/documents?${sp}`
      )
    },
    refetchInterval: (query) => {
      const items =
        (
          query.state.data as
            | PaginatedResponse<KnowledgeDocListItem>
            | undefined
        )?.items ?? []
      return items.some((d) => d.status === "processing") ? 5_000 : false
    },
  })
}

export function useKnowledgeDocDetail(docId: string) {
  return useQuery({
    queryKey: ["knowledge-doc", docId],
    queryFn: () =>
      apiClient.get<KnowledgeDocDetail>(`/knowledge/documents/${docId}`),
    enabled: !!docId,
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      title,
      visibility,
      file,
    }: {
      title: string
      visibility: string
      file: File
    }) => {
      const formData = new FormData()
      formData.append("title", title)
      formData.append("visibility", visibility)
      formData.append("file", file)

      const token = await getToken()
      const res = await fetch(`${API_URL}/knowledge/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) {
        const errorBody = await res
          .json()
          .catch(() => ({ detail: res.statusText }))
        throw Object.assign(
          new Error(errorBody.detail ?? "Upload failed"),
          { status: res.status, body: errorBody }
        )
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-docs"] })
    },
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (docId: string) =>
      apiClient.del(`/knowledge/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-docs"] })
    },
  })
}
