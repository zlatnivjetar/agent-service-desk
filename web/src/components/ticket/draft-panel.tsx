"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  PencilLine,
  RefreshCcw,
  Sparkles,
} from "lucide-react"

import {
  useGenerateDraft,
  useRedraft,
  useReviewDraft,
} from "@/hooks/use-ticket-detail"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import type { DraftGenerationResponse, TicketDraft, UserRole } from "@/types/api"

import {
  ConfidenceBadge,
  ReviewOutcomeBadge,
  getErrorMessage,
  isDraftPending,
} from "@/components/ticket/ticket-ui"

export function DraftPanel({
  ticketId,
  draft,
  role,
  onEvidenceLoaded,
}: {
  ticketId: string
  draft: TicketDraft | null | undefined
  role: UserRole
  onEvidenceLoaded: (result: DraftGenerationResponse) => void
}) {
  const generateDraft = useGenerateDraft(ticketId)
  const redraft = useRedraft(ticketId)
  const reviewDraft = useReviewDraft(ticketId, draft?.id)

  const [editOpen, setEditOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [editedBody, setEditedBody] = useState("")
  const [rejectReason, setRejectReason] = useState("")

  const isGenerating = generateDraft.isPending || redraft.isPending
  const pendingReview = isDraftPending(draft?.approval_outcome)

  useEffect(() => {
    setEditedBody(draft?.body ?? "")
  }, [draft?.body, draft?.id])

  function handleGenerate() {
    generateDraft.mutate(undefined, {
      onSuccess: (result) => onEvidenceLoaded(result),
    })
  }

  function handleRedraft() {
    redraft.mutate(undefined, {
      onSuccess: (result) => onEvidenceLoaded(result),
    })
  }

  function handleApprove() {
    reviewDraft.mutate({ action: "approved" })
  }

  function handleEscalate() {
    reviewDraft.mutate({ action: "escalated" })
  }

  return (
    <Card className="border-0 bg-white/90 shadow-sm ring-1 ring-foreground/8">
      <CardHeader>
        <CardTitle>AI Draft</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isGenerating ? (
          <DraftLoadingState />
        ) : draft ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ConfidenceBadge confidence={draft.confidence} />
              <ReviewOutcomeBadge outcome={draft.approval_outcome} />
              {draft.send_ready ? (
                <span className="inline-flex items-center gap-1 text-sm text-success">
                  <CheckCircle2 className="size-4" />
                  Send ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-warning">
                  <AlertTriangle className="size-4" />
                  Needs more evidence
                </span>
              )}
            </div>

            <div className="rounded-xl border bg-background/70 p-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{draft.body}</p>
            </div>

            {draft.unresolved_questions?.length ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Unresolved Questions</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {draft.unresolved_questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {pendingReview ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleApprove}
                    disabled={reviewDraft.isPending}
                    className="cursor-pointer bg-[#F97316] text-white hover:bg-[#EA6A0A]"
                  >
                    {reviewDraft.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
                    Approve
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={() => setEditOpen(true)}
                    disabled={reviewDraft.isPending}
                    className="cursor-pointer"
                  >
                    <PencilLine className="size-4" />
                    Edit & Approve
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={() => setRejectOpen(true)}
                    disabled={reviewDraft.isPending}
                    className="cursor-pointer"
                  >
                    Reject
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleEscalate}
                    disabled={reviewDraft.isPending}
                    className="cursor-pointer"
                  >
                    Escalate
                  </Button>
                </div>

                <EditApproveDialog
                  open={editOpen}
                  pending={reviewDraft.isPending}
                  value={editedBody}
                  onOpenChange={setEditOpen}
                  onChange={setEditedBody}
                  onSubmit={() =>
                    reviewDraft.mutate(
                      { action: "edited_and_approved", edited_body: editedBody.trim() },
                      { onSuccess: () => setEditOpen(false) }
                    )
                  }
                />

                <RejectDialog
                  open={rejectOpen}
                  pending={reviewDraft.isPending}
                  value={rejectReason}
                  onOpenChange={setRejectOpen}
                  onChange={setRejectReason}
                  onSubmit={() =>
                    reviewDraft.mutate(
                      { action: "rejected", reason: rejectReason.trim() },
                      {
                        onSuccess: () => {
                          setRejectOpen(false)
                          setRejectReason("")
                        },
                      }
                    )
                  }
                />
              </div>
            ) : (
              <Button
                onClick={handleRedraft}
                disabled={redraft.isPending}
                variant="outline"
                className="cursor-pointer"
              >
                {redraft.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                Re-draft
              </Button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">No draft generated yet.</p>
            {role !== "client_user" && (
              <Button
                onClick={handleGenerate}
                disabled={generateDraft.isPending}
                className="cursor-pointer bg-[#F97316] text-white hover:bg-[#EA6A0A]"
              >
                {generateDraft.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {generateDraft.isPending ? "Generating draft..." : "Generate Draft"}
              </Button>
            )}
          </div>
        )}

        {generateDraft.isError && (
          <p className="text-sm text-destructive" role="alert">
            {getErrorMessage(generateDraft.error, "Failed to generate draft")}
          </p>
        )}

        {redraft.isError && (
          <p className="text-sm text-destructive" role="alert">
            {getErrorMessage(redraft.error, "Failed to re-draft")}
          </p>
        )}

        {reviewDraft.isError && (
          <p className="text-sm text-destructive" role="alert">
            {getErrorMessage(reviewDraft.error, "Failed to review draft")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function DraftLoadingState() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Generating draft...
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[92%]" />
      <Skeleton className="h-4 w-[85%]" />
      <Skeleton className="h-4 w-[75%]" />
    </div>
  )
}

function EditApproveDialog({
  open,
  pending,
  value,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean
  pending: boolean
  value: string
  onOpenChange: (open: boolean) => void
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit & Approve Draft</DialogTitle>
          <DialogDescription>
            Make any changes needed, then approve the edited response.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4">
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="min-h-56"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="cursor-pointer">
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!value.trim() || pending}
            className="cursor-pointer bg-[#F97316] text-white hover:bg-[#EA6A0A]"
          >
            {pending ? "Saving..." : "Approve Edited Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({
  open,
  pending,
  value,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean
  pending: boolean
  value: string
  onOpenChange: (open: boolean) => void
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Draft</DialogTitle>
          <DialogDescription>
            Provide a reason so the next draft can address the gap.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4">
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="What needs to change?"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="cursor-pointer">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onSubmit}
            disabled={!value.trim() || pending}
            className="cursor-pointer"
          >
            {pending ? "Rejecting..." : "Reject Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
