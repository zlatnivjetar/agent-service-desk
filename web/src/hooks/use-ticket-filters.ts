"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

export interface TicketFilters {
  status: string | null
  priority: string | null
  category: string | null
  team: string | null
}

export function useTicketFilters() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const filters: TicketFilters = {
    status: searchParams.get("status"),
    priority: searchParams.get("priority"),
    category: searchParams.get("category"),
    team: searchParams.get("team"),
  }

  const page = Number(searchParams.get("page") ?? 1)
  const sortBy = searchParams.get("sort_by") ?? "created_at"
  const sortOrder = searchParams.get("sort_order") ?? "desc"

  const setFilter = useCallback(
    (key: keyof TicketFilters, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (value == null) {
        next.delete(key)
      } else {
        next.set(key, value)
      }
      next.set("page", "1")
      router.push(`?${next.toString()}`)
    },
    [searchParams, router],
  )

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams()
    const sb = searchParams.get("sort_by")
    const so = searchParams.get("sort_order")
    if (sb) next.set("sort_by", sb)
    if (so) next.set("sort_order", so)
    router.push(`?${next.toString()}`)
  }, [searchParams, router])

  const setSorting = useCallback(
    (by: string) => {
      const currentBy = searchParams.get("sort_by") ?? "created_at"
      const currentOrder = searchParams.get("sort_order") ?? "desc"
      const newOrder = currentBy === by && currentOrder === "asc" ? "desc" : "asc"
      const next = new URLSearchParams(searchParams.toString())
      next.set("sort_by", by)
      next.set("sort_order", newOrder)
      next.set("page", "1")
      router.push(`?${next.toString()}`)
    },
    [searchParams, router],
  )

  const setPage = useCallback(
    (newPage: number) => {
      const next = new URLSearchParams(searchParams.toString())
      next.set("page", String(newPage))
      router.push(`?${next.toString()}`)
    },
    [searchParams, router],
  )

  const hasActiveFilters = Object.values(filters).some((v) => v !== null)

  return {
    filters,
    setFilter,
    clearFilters,
    hasActiveFilters,
    sortBy,
    sortOrder,
    setSorting,
    page,
    setPage,
    perPage: 25,
  }
}
