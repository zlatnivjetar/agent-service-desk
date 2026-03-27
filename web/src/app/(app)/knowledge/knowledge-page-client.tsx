"use client"

import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { BookOpen, ChevronDown, ChevronRight, Trash2, Upload } from "lucide-react"

import { toast } from "sonner"
import {
  useKnowledgeDocs,
  useKnowledgeDocDetail,
  useDeleteDocument,
} from "@/hooks/use-knowledge"
import { useCurrentUser } from "@/hooks/use-current-user"
import { PageError } from "@/components/ui/page-error"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { KnowledgeStatusBadge, VisibilityBadge } from "@/components/ui/status-badges"
import { FilterBar } from "@/components/ui/filter-bar"
import { FilterSelect, type FilterOption } from "@/components/ui/filter-select"
import { AppPage, PageHeader } from "@/components/app-page"
import { formatRelativeTime } from "@/lib/format"
import { knowledgeDocsQueryOptions } from "@/lib/queries/knowledge"
import { replaceUrl } from "@/lib/url-state"
import type { KnowledgeDocListItem } from "@/types/api"

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

// --- Chunk list (only mounted when expanded) ---

function ChunkList({ docId }: { docId: string }) {
  const { data, isLoading } = useKnowledgeDocDetail(docId)

  if (isLoading) {
    return (
      <div className="mt-3 space-y-2 border-t pt-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (!data?.chunks.length) {
    return (
      <div className="mt-3 border-t pt-3 text-sm text-muted-foreground">
        No chunks available.
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {data.chunks.map((chunk) => (
        <div key={chunk.id} className="rounded-md bg-muted/50 p-3 text-sm">
          <div className="mb-1 flex items-center gap-3">
            <span className="font-mono text-xs font-medium text-muted-foreground">
              #{chunk.chunk_index + 1}
            </span>
            {chunk.token_count != null && (
              <span className="text-xs text-muted-foreground">
                {chunk.token_count} tokens
              </span>
            )}
          </div>
          <p className="leading-relaxed text-muted-foreground">
            {chunk.content.slice(0, 200)}
            {chunk.content.length > 200 ? "..." : ""}
          </p>
        </div>
      ))}
    </div>
  )
}

// --- Doc card ---

function DocCard({ doc }: { doc: KnowledgeDocListItem }) {
  const [expanded, setExpanded] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deleteMutation = useDeleteDocument()

  function handleDelete() {
    deleteMutation.mutate(doc.id, {
      onSuccess: () => {
        setDeleteOpen(false)
        toast.success("Document deleted")
      },
      onError: (e) => toast.error((e as Error)?.message || "Failed to delete document"),
    })
  }

  return (
    <>
      <Card variant="interactive">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {/* Left */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="truncate font-semibold">{doc.title}</p>
              {doc.source_filename && (
                <p className="truncate text-xs text-muted-foreground">
                  {doc.source_filename}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <KnowledgeStatusBadge status={doc.status} />
                <VisibilityBadge visibility={doc.visibility} />
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(doc.created_at)}
                </span>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="cursor-pointer"
              >
                {expanded ? (
                  <ChevronDown className="mr-1 size-3" />
                ) : (
                  <ChevronRight className="mr-1 size-3" />
                )}
                View chunks
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          {expanded && <ChunkList docId={doc.id} />}
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &apos;{doc.title}&apos; and all its
              chunks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="cursor-pointer"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// --- Loading skeletons ---

function DocCardSkeletons() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <div className="flex gap-2 pt-0.5">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  )
}

// --- Main page content ---

function KnowledgePageContent() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { data: user, isPending: userPending } = useCurrentUser()

  const status = searchParams.get("status")
  const visibility = searchParams.get("visibility")
  const stalled = searchParams.get("stalled") === "true"
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))

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

  function setPage(newPage: number) {
    const next = new URLSearchParams(searchParams.toString())
    next.set("page", String(newPage))
    replaceUrl(`?${next.toString()}`)
  }

  function clearFilters() {
    replaceUrl("?")
  }

  const knowledgeParams = useMemo(
    () => ({
      page,
      per_page: 20,
      status: status || null,
      visibility: visibility || null,
      stalled: stalled || null,
    }),
    [page, stalled, status, visibility]
  )
  const { data, isLoading, isError, isPlaceholderData, refetch } = useKnowledgeDocs(
    knowledgeParams,
    { enabled: !userPending && !isClientUser }
  )

  const docs = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 1
  const isRefreshing = isPlaceholderData && data != null

  useEffect(() => {
    if (!data) return
    if (data.page >= data.total_pages) return

    void queryClient.prefetchQuery(
      knowledgeDocsQueryOptions({
        ...knowledgeParams,
        page: data.page + 1,
      })
    )
  }, [data, knowledgeParams, queryClient])

  // While user role is loading, render nothing to avoid a skeleton flash
  if (userPending) return null

  // Role gate
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

  if (isError) {
    return <PageError message="Failed to load knowledge documents." onRetry={() => refetch()} />
  }

  const hasActiveFilters = !!(status || visibility || stalled)

  return (
    <AppPage>
      <PageHeader
        title="Knowledge Base"
        meta={
          <div>
            <p className="min-h-5">
              {data
                ? `${total.toLocaleString()} ${total === 1 ? "document" : "documents"}`
                : "\u00A0"}
            </p>
            <p className="min-h-4 text-xs text-muted-foreground">
              {isRefreshing ? "Updating documents..." : "\u00A0"}
            </p>
          </div>
        }
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

      {/* Document list */}
      {isLoading ? (
        <div className="space-y-3">
          <DocCardSkeletons />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <BookOpen className="size-10 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">
            No documents uploaded yet
          </p>
          <p className="text-sm text-muted-foreground">
            Upload your first document to power the AI drafting pipeline.
          </p>
          <Button
            onClick={() => setUploadOpen(true)}
            className="mt-2 cursor-pointer"
          >
            <Upload className="mr-2 size-4" />
            Upload Document
          </Button>
        </div>
      ) : (
        <div className={isRefreshing ? "space-y-3 opacity-70 transition-opacity duration-200" : "space-y-3 transition-opacity duration-200"}>
          {docs.map((doc) => (
            <DocCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="cursor-pointer"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className="cursor-pointer"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </AppPage>
  )
}

export default function KnowledgePageClient() {
  return <KnowledgePageContent />
}
