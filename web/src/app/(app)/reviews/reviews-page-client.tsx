"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { type ReactNode } from "react"
import { CheckCircle2 } from "lucide-react"

import { useCurrentUser } from "@/hooks/use-current-user"
import { FilterBar } from "@/components/ui/filter-bar"
import { FilterSelect, type FilterOption } from "@/components/ui/filter-select"
import { AppPage, PageHeader } from "@/components/app-page"
import { replaceUrl } from "@/lib/url-state"

const CONFIDENCE_OPTIONS: FilterOption[] = [
  { value: "0.5", label: "50% or lower" },
  { value: "0.7", label: "70% or lower" },
  { value: "0.9", label: "90% or lower" },
]

const SORT_OPTIONS: FilterOption[] = [
  { value: "created_at.asc", label: "Oldest first" },
  { value: "created_at.desc", label: "Newest first" },
  { value: "confidence.asc", label: "Lowest confidence" },
  { value: "confidence.desc", label: "Highest confidence" },
]

function ReviewQueueContent({ listSection }: { listSection: ReactNode }) {
  const searchParams = useSearchParams()
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))
  const confidenceMax = searchParams.get("confidence_max")
  const createdBefore = searchParams.get("created_before")
  const sortBy = searchParams.get("sort_by") ?? "created_at"
  const sortOrder = searchParams.get("sort_order") ?? "asc"
  const selectedSort = `${sortBy}.${sortOrder}`

  const { data: user, isPending: userPending } = useCurrentUser()

  if (userPending) return null

  if (user?.role === "client_user") {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center p-6">
        <p className="text-base font-medium text-foreground">Access denied</p>
        <p className="text-sm text-muted-foreground">
          The review queue is available to agents and team leads only.
        </p>
      </div>
    )
  }

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value == null || value === "") {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.set("page", "1")
    replaceUrl(`?${params}`)
  }

  function clearFilters() {
    replaceUrl("?")
  }

  function setSorting(by: string, order: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("sort_by", by)
    params.set("sort_order", order)
    params.set("page", "1")
    replaceUrl(`?${params}`)
  }

  const hasActiveFilters = !!(confidenceMax || createdBefore || searchParams.get("sort_by") || searchParams.get("sort_order"))

  return (
    <AppPage>
      <PageHeader
        title="Review Queue"
        meta={<p>Review low-confidence drafts before they reach customers.</p>}
      />

      <FilterBar onClear={clearFilters} hasActiveFilters={hasActiveFilters}>
        <FilterSelect
          value={confidenceMax}
          onValueChange={(value) => setParam("confidence_max", value || null)}
          placeholder="All confidence"
          options={CONFIDENCE_OPTIONS}
          className="w-44"
        />
        <FilterSelect
          value={selectedSort}
          onValueChange={(value) => {
            const [by, order] = (value || "created_at.asc").split(".")
            setSorting(by, order ?? "asc")
          }}
          placeholder="Sort"
          options={SORT_OPTIONS}
          className="w-44"
        />
      </FilterBar>

      {listSection}
    </AppPage>
  )
}

export default function ReviewsPageClient({
  listSection,
}: {
  listSection: ReactNode
}) {
  return <ReviewQueueContent listSection={listSection} />
}
