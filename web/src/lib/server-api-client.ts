import { redirect } from "next/navigation"

import { API_URL } from "@/lib/api-client"
import { getServerAuthContext } from "@/lib/server-auth"

type ErrorBody = {
  detail?: string
  error?: string
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const authContext = await getServerAuthContext()

  if (!authContext) {
    redirect("/login")
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authContext.token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    if (response.status === 401) {
      redirect("/login")
    }

    const errorBody = await response
      .json()
      .catch<ErrorBody>(() => ({ detail: response.statusText }))

    throw Object.assign(
      new Error(errorBody.detail ?? errorBody.error ?? "Request failed"),
      {
        status: response.status,
        body: errorBody,
      }
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const serverApiClient = {
  get<T>(path: string): Promise<T> {
    return request<T>("GET", path)
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("POST", path, body)
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("PATCH", path, body)
  },
  del(path: string): Promise<void> {
    return request<void>("DELETE", path)
  },
}
