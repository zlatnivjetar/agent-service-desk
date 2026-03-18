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
import { ConfidenceBadge, getErrorMessage } from "@/components/ticket/ticket-ui"
import type { DraftQueueItem } from "@/types/api"

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

  const { data: user, isPending: userPending } = useCurrentUser()
  const { data, isLoading, isError, refetch } = useReviewQueue(
    { page, per_page: 20 },
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

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-[#0F172A]">Review Queue</h1>
        {!isLoading && data && (
          <p className="mt-1 text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? "draft" : "drafts"} pending review
          </p>
        )}
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-0 bg-white/90 shadow-sm ring-1 ring-foreground/8">
              <CardContent className="p-5">
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
    </div>
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
    <Card className="border-0 bg-white/90 shadow-sm ring-1 ring-foreground/8 transition-shadow duration-200 hover:shadow-md">
      <CardContent className="p-5">
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
                className="cursor-pointer bg-[#F97316] text-white hover:bg-[#EA6A0A]"
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
