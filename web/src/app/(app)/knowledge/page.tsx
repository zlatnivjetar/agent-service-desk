"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { BookOpen, ChevronDown, ChevronRight, Trash2, Upload } from "lucide-react"

import { toast } from "sonner"
import {
  useKnowledgeDocs,
  useKnowledgeDocDetail,
  useDeleteDocument,
} from "@/hooks/use-knowledge"
import { useCurrentUser } from "@/hooks/use-current-user"
import { UploadDialog } from "@/components/knowledge/upload-dialog"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { KnowledgeDocListItem } from "@/types/api"

// --- Badge helpers ---

const STATUS_CLASSES: Record<string, string> = {
  pending: "border-border text-muted-foreground",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  indexed: "bg-success/10 text-success border-success/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
}

function DocStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={cn(
        "capitalize",
        STATUS_CLASSES[status] ?? "border-border text-foreground"
      )}
    >
      {status}
    </Badge>
  )
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  return (
    <Badge variant={visibility === "client_visible" ? "default" : "secondary"}>
      {visibility === "client_visible" ? "Client visible" : "Internal"}
    </Badge>
  )
}

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
            {chunk.content.length > 200 ? "…" : ""}
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
      <Card className="border-0 bg-white/90 shadow-sm ring-1 ring-foreground/8 transition-shadow duration-200 hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {/* Left */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="truncate font-semibold text-[#0F172A]">{doc.title}</p>
              {doc.source_filename && (
                <p className="truncate text-xs text-muted-foreground">
                  {doc.source_filename}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <DocStatusBadge status={doc.status} />
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
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
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
        <Card
          key={i}
          className="border-0 bg-white/90 shadow-sm ring-1 ring-foreground/8"
        >
          <CardContent className="p-5">
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: user, isPending: userPending } = useCurrentUser()

  const status = searchParams.get("status")
  const visibility = searchParams.get("visibility")
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
    router.push(`?${next.toString()}`)
  }

  function setPage(newPage: number) {
    const next = new URLSearchParams(searchParams.toString())
    next.set("page", String(newPage))
    router.push(`?${next.toString()}`)
  }

  const { data, isLoading, isError, refetch } = useKnowledgeDocs(
    { page, per_page: 20, status: status || null, visibility: visibility || null },
    { enabled: !userPending && !isClientUser }
  )

  const docs = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 1

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

  const hasActiveFilters = !!(status || visibility)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F172A]">
            Knowledge Base
          </h1>
          {data && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {total.toLocaleString()}{" "}
              {total === 1 ? "document" : "documents"}
            </p>
          )}
        </div>
        <Button
          onClick={() => setUploadOpen(true)}
          className="cursor-pointer shrink-0"
        >
          <Upload className="mr-2 size-4" />
          Upload Document
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status ?? ""}
          onValueChange={(v) => setParam("status", v || null)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses">
              {status
                ? status.charAt(0).toUpperCase() + status.slice(1)
                : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="indexed">Indexed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={visibility ?? ""}
          onValueChange={(v) => setParam("visibility", v || null)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All visibility">
              {visibility === "internal"
                ? "Internal"
                : visibility === "client_visible"
                  ? "Client visible"
                  : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="client_visible">Client visible</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("?")}
            className="cursor-pointer"
          >
            Clear filters
          </Button>
        )}
      </div>

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
        <div className="space-y-3">
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
    </div>
  )
}

export default function KnowledgePage() {
  return (
    <Suspense>
      <KnowledgePageContent />
    </Suspense>
  )
}
