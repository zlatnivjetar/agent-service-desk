"use client"

import { useSearchParams } from "next/navigation"
import { useCallback } from "react"

import { getDefaultRangePreset, getRangeBounds } from "@/lib/dashboard"
import { replaceUrl } from "@/lib/url-state"

export interface TicketFilters {
  status: string | null
  priority: string | null
  category: string | null
  team: string | null
  assignee: string | null
  range: "7d" | "30d" | "90d" | "custom"
  from: string | null
  to: string | null
  updated_before: string | null
}

export function useTicketFilters() {
  const searchParams = useSearchParams()

  const filters: TicketFilters = {
    status: searchParams.get("status"),
    priority: searchParams.get("priority"),
    category: searchParams.get("category"),
    team: searchParams.get("team"),
    assignee: searchParams.get("assignee"),
    range: getDefaultRangePreset(searchParams.get("range")),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    updated_before: searchParams.get("updated_before"),
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
      replaceUrl(`?${next.toString()}`)
    },
    [searchParams],
  )

  const setRange = useCallback(
    (range: TicketFilters["range"]) => {
      const next = new URLSearchParams(searchParams.toString())
      next.set("range", range)
      if (range === "custom") {
        const currentRange = getDefaultRangePreset(searchParams.get("range"))
        const seededRange = getRangeBounds(
          currentRange,
          searchParams.get("from"),
          searchParams.get("to"),
        )
        next.set("from", searchParams.get("from") ?? seededRange.from)
        next.set("to", searchParams.get("to") ?? seededRange.to)
      } else {
        next.delete("from")
        next.delete("to")
      }
      next.set("page", "1")
      replaceUrl(`?${next.toString()}`)
    },
    [searchParams],
  )

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams()
    const sb = searchParams.get("sort_by")
    const so = searchParams.get("sort_order")
    if (sb) next.set("sort_by", sb)
    if (so) next.set("sort_order", so)
    next.set("range", "30d")
    replaceUrl(`?${next.toString()}`)
  }, [searchParams])

  const setSorting = useCallback(
    (by: string) => {
      const currentBy = searchParams.get("sort_by") ?? "created_at"
      const currentOrder = searchParams.get("sort_order") ?? "desc"
      const newOrder = currentBy === by && currentOrder === "asc" ? "desc" : "asc"
      const next = new URLSearchParams(searchParams.toString())
      next.set("sort_by", by)
      next.set("sort_order", newOrder)
      next.set("page", "1")
      replaceUrl(`?${next.toString()}`)
    },
    [searchParams],
  )

  const setPage = useCallback(
    (newPage: number) => {
      const next = new URLSearchParams(searchParams.toString())
      next.set("page", String(newPage))
      replaceUrl(`?${next.toString()}`)
    },
    [searchParams],
  )

  const hasActiveFilters =
    filters.range !== "30d" ||
    !!filters.status ||
    !!filters.priority ||
    !!filters.category ||
    !!filters.team ||
    !!filters.assignee ||
    !!filters.from ||
    !!filters.to ||
    !!filters.updated_before

  return {
    filters,
    setFilter,
    setRange,
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
