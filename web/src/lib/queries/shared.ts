import { apiClient } from "@/lib/api-client"

export type QueryValue = string | number | boolean | null | undefined
export type ApiGetClient = Pick<typeof apiClient, "get">

export function buildSearchParams<T extends object>(params: T) {
  const searchParams = new URLSearchParams()

  Object.entries(params as Record<string, QueryValue>).forEach(([key, value]) => {
    if (value != null && value !== "") {
      searchParams.set(key, String(value))
    }
  })

  return searchParams.toString()
}

export function withQueryString(path: string, query: string) {
  return query ? `${path}?${query}` : path
}
