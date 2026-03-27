"use client"

import { useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { BookOpen, Upload } from "lucide-react"

import { useCurrentUser } from "@/hooks/use-current-user"
import { Button } from "@/components/ui/button"
import { FilterBar } from "@/components/ui/filter-bar"
import { FilterSelect, type FilterOption } from "@/components/ui/filter-select"
import { AppPage, PageHeader } from "@/components/app-page"
import { replaceUrl } from "@/lib/url-state"

const UploadDialog = dynamic(
  () =>
    import("@/components/knowledge/upload-dialog").then(
      (module) => module.UploadDialog
    ),
  { ssr: false }
)

// --- Filter options ---

const STATUS_OPTIONS: FilterOption[] = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "indexed", label: "Indexed" },
  { value: "failed", label: "Failed" },
]

const VISIBILITY_OPTIONS: FilterOption[] = [
  { value: "internal", label: "Internal" },
  { value: "client_visible", label: "Client visible" },
]

function KnowledgePageContent({ listSection }: { listSection: ReactNode }) {
  const searchParams = useSearchParams()
  const { data: user, isPending: userPending } = useCurrentUser()

  const status = searchParams.get("status")
  const visibility = searchParams.get("visibility")
  const stalled = searchParams.get("stalled") === "true"

  const [uploadOpen, setUploadOpen] = useState(false)

  const isClientUser = !userPending && user?.role === "client_user"

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString())
    if (value == null) {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    next.set("page", "1")
    replaceUrl(`?${next.toString()}`)
  }

  function clearFilters() {
    replaceUrl("?")
  }

  if (userPending) return null

  if (isClientUser) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <BookOpen className="size-10 text-muted-foreground" />
        <p className="text-base font-medium text-foreground">Access denied</p>
        <p className="text-sm text-muted-foreground">
          Knowledge management is available to agents and team leads only.
        </p>
      </div>
    )
  }

  const hasActiveFilters = !!(status || visibility || stalled)

  return (
    <AppPage>
      <PageHeader
        title="Knowledge Base"
        meta={<p>Manage uploaded documents and monitor indexing status.</p>}
        actions={
          <Button
            onClick={() => setUploadOpen(true)}
            className="cursor-pointer shrink-0"
          >
            <Upload className="mr-2 size-4" />
            Upload Document
          </Button>
        }
      />

      {/* Filter bar */}
      <FilterBar onClear={clearFilters} hasActiveFilters={hasActiveFilters}>
        <FilterSelect
          value={status}
          onValueChange={(v) => setParam("status", v || null)}
          placeholder="All statuses"
          options={STATUS_OPTIONS}
          className="w-40"
        />
        <FilterSelect
          value={visibility}
          onValueChange={(v) => setParam("visibility", v || null)}
          placeholder="All visibility"
          options={VISIBILITY_OPTIONS}
          className="w-44"
        />
      </FilterBar>

      {stalled ? (
        <p className="text-sm text-muted-foreground">
          Showing processing documents older than 15 minutes.
        </p>
      ) : null}

      {listSection}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </AppPage>
  )
}

export default function KnowledgePageClient({
  listSection,
}: {
  listSection: ReactNode
}) {
  return <KnowledgePageContent listSection={listSection} />
}
