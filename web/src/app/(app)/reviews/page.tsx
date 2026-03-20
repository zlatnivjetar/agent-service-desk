"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, ExternalLink, LoaderCircle } from "lucide-react"

import { toast } from "sonner"
import { useReviewQueue, useReviewDraftFromQueue } from "@/hooks/use-review-queue"
import { useCurrentUser } from "@/hooks/use-current-user"
import { Button } from "@/components/ui/button"
import { PageError } from "@/components/ui/page-error"
import { Card, CardContent } from "@/components/ui/card"
import { FilterBar } from "@/components/ui/filter-bar"
import { FilterSelect, type FilterOption } from "@/components/ui/filter-select"
import { AppPage, PageHeader } from "@/components/app-page"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ConfidenceBadge } from "@/components/ui/status-badges"
import { getErrorMessage } from "@/components/ticket/ticket-ui"
import type { DraftQueueItem } from "@/types/api"

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

function formatSecondsAgo(seconds: number): string {
  if (seconds < 60) return `${Math.max(Math.round(seconds), 0)}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function ReviewQueueContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))
  const confidenceMax = searchParams.get("confidence_max")
  const createdBefore = searchParams.get("created_before")
  const sortBy = searchParams.get("sort_by") ?? "created_at"
  const sortOrder = searchParams.get("sort_order") ?? "asc"
  const selectedSort = `${sortBy}.${sortOrder}`

  const { data: user, isPending: userPending } = useCurrentUser()
  const { data, isLoading, isError, refetch } = useReviewQueue(
    {
      page,
      per_page: 20,
      confidence_max: confidenceMax ? Number(confidenceMax) : null,
      created_before: createdBefore,
      sort_by: sortBy,
      sort_order: sortOrder,
    },
    { enabled: !userPending && user?.role !== "client_user" }
  )

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

  if (isError) {
    return <PageError message="Failed to load review queue." onRetry={() => refetch()} />
  }

  function setPage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", String(newPage))
    router.push(`?${params}`)
  }

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value == null || value === "") {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.set("page", "1")
    router.push(`?${params}`)
  }

  function clearFilters() {
    router.push("?")
  }

  function setSorting(by: string, order: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("sort_by", by)
    params.set("sort_order", order)
    params.set("page", "1")
    router.push(`?${params}`)
  }

  const hasActiveFilters = !!(confidenceMax || createdBefore || searchParams.get("sort_by") || searchParams.get("sort_order"))

  return (
    <AppPage>
      <PageHeader
        title="Review Queue"
        meta={
          <p className="min-h-5">
            {!isLoading && data
              ? `${data.total} ${data.total === 1 ? "draft" : "drafts"} pending review`
              : "\u00A0"}
          </p>
        }
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

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-3">
                    <Skeleton className="h-6 w-24 rounded-full" />
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-8 w-16" />
                      <Skeleton className="h-8 w-18" />
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && data?.items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckCircle2 className="size-10 text-success" />
          <p className="text-base font-medium text-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground">No drafts pending review.</p>
        </div>
      )}

      {/* Card list */}
      {!isLoading && data && data.items.length > 0 && (
        <div className="space-y-4">
          {data.items.map((item) => (
            <ReviewCard key={item.draft_generation_id} item={item} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && data && data.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.total_pages}
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
              disabled={page >= data.total_pages}
              className="cursor-pointer"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </AppPage>
  )
}

function ReviewCard({ item }: { item: DraftQueueItem }) {
  const router = useRouter()
  const reviewMutation = useReviewDraftFromQueue(item.draft_generation_id, item.ticket_id)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const isPending = reviewMutation.isPending

  function handleApprove() {
    reviewMutation.mutate({ action: "approved" }, {
      onSuccess: () => toast.success("Draft approved"),
      onError: (e) => toast.error((e as Error)?.message || "Action failed"),
    })
  }

  function handleEscalate() {
    reviewMutation.mutate({ action: "escalated" }, {
      onSuccess: () => toast.success("Draft escalated"),
      onError: (e) => toast.error((e as Error)?.message || "Action failed"),
    })
  }

  function handleReject() {
    reviewMutation.mutate(
      { action: "rejected", reason: rejectReason.trim() },
      {
        onSuccess: () => {
          setRejectOpen(false)
          setRejectReason("")
          toast.success("Draft rejected")
        },
        onError: (e) => toast.error((e as Error)?.message || "Action failed"),
      }
    )
  }

  return (
    <Card variant="interactive">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left section */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Link
                href={`/tickets/${item.ticket_id}`}
                className="truncate text-sm font-medium text-foreground underline-offset-2 transition-colors duration-150 hover:text-primary hover:underline"
              >
                {item.ticket_subject}
              </Link>
              <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
            </div>
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </p>
            <p className="text-xs text-muted-foreground">
              Generated {formatSecondsAgo(item.time_since_generation)}
            </p>
          </div>

          {/* Right section */}
          <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
            <ConfidenceBadge confidence={item.confidence} />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isPending}
                className="cursor-pointer"
              >
                {isPending ? <LoaderCircle className="size-3 animate-spin" /> : null}
                Approve
              </Button>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push(`/tickets/${item.ticket_id}`)}
                disabled={isPending}
                className="cursor-pointer"
              >
                Edit
              </Button>

              <Button
                size="sm"
                variant="destructive"
                onClick={() => setRejectOpen(true)}
                disabled={isPending}
                className="cursor-pointer"
              >
                Reject
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={handleEscalate}
                disabled={isPending}
                className="cursor-pointer"
              >
                Escalate
              </Button>
            </div>

            {reviewMutation.isError && (
              <p className="text-xs text-destructive" role="alert">
                {getErrorMessage(reviewMutation.error, "Action failed")}
              </p>
            )}
          </div>
        </div>
      </CardContent>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Draft</DialogTitle>
            <DialogDescription>
              Provide a reason so the next draft can address the gap.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="What needs to change?"
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRejectOpen(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || isPending}
              className="cursor-pointer"
            >
              {isPending ? "Rejecting..." : "Reject Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default function ReviewsPage() {
  return (
    <Suspense>
      <ReviewQueueContent />
    </Suspense>
  )
}
