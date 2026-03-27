"use client"

import { useState } from "react"
import { useParams } from "next/navigation"

import { DraftPanel } from "@/components/ticket/draft-panel"
import { EvidencePanel } from "@/components/ticket/evidence-panel"
import { MessageThread } from "@/components/ticket/message-thread"
import { ReplyBox } from "@/components/ticket/reply-box"
import { TicketActions } from "@/components/ticket/ticket-actions"
import { TicketHeader } from "@/components/ticket/ticket-header"
import { TriagePanel } from "@/components/ticket/triage-panel"
import {
  getErrorMessage,
  getErrorStatus,
  isPrivilegedRole,
} from "@/components/ticket/ticket-ui"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useTicketDetail } from "@/hooks/use-ticket-detail"
import type { DraftGenerationResponse, EvidenceChunk } from "@/types/api"

export default function TicketDetailPage() {
  const params = useParams<{ id: string | string[] }>()
  const ticketId = Array.isArray(params?.id) ? params.id[0] : params?.id

  const { data: user, isPending: userPending } = useCurrentUser()
  const {
    data: ticket,
    error,
    isPending: ticketPending,
  } = useTicketDetail(ticketId ?? "")

  const [loadedEvidence, setLoadedEvidence] = useState<{
    draftId: string
    chunks: EvidenceChunk[]
  } | null>(null)

  const currentDraftId = ticket?.latest_draft?.id ?? null
  const evidenceChunks =
    currentDraftId && loadedEvidence?.draftId === currentDraftId
      ? loadedEvidence.chunks
      : null

  function handleEvidenceLoaded(result: DraftGenerationResponse) {
    setLoadedEvidence({
      draftId: result.id,
      chunks: result.evidence_chunks,
    })
  }

  function scrollToActions() {
    document.getElementById("ticket-actions")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  if (!ticketId || userPending || ticketPending) {
    return <TicketWorkspaceSkeleton />
  }

  if (getErrorStatus(error) === 404) {
    return (
      <StateCard
        title="Ticket not found"
        description="The ticket may not exist or may not be accessible in your current workspace."
      />
    )
  }

  if (error) {
    return (
      <StateCard
        title="Unable to load ticket"
        description={getErrorMessage(error, "Please refresh and try again.")}
        destructive
      />
    )
  }

  if (!ticket || !user) {
    return (
      <StateCard
        title="Ticket unavailable"
        description="The ticket data could not be loaded."
      />
    )
  }

  const privilegedRole = isPrivilegedRole(user.role)

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          <TicketHeader
            ticket={ticket}
            role={user.role}
            onAssignClick={privilegedRole ? scrollToActions : undefined}
          />
          <MessageThread messages={ticket.messages} />
          <ReplyBox ticketId={ticket.id} role={user.role} />
        </div>

        {privilegedRole && (
          <div className="space-y-6">
            <TriagePanel
              ticketId={ticket.id}
              prediction={ticket.latest_prediction}
              role={user.role}
            />
            <EvidencePanel
              draft={ticket.latest_draft}
              evidenceChunks={evidenceChunks}
            />
            <DraftPanel
              ticketId={ticket.id}
              draft={ticket.latest_draft}
              role={user.role}
              onEvidenceLoaded={handleEvidenceLoaded}
            />
            <TicketActions ticket={ticket} />
          </div>
        )}
      </div>
    </div>
  )
}

function TicketWorkspaceSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-6">
        <Card className="">
          <CardContent className="space-y-4 py-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24" />
            </div>
          </CardContent>
        </Card>

        <Card className="">
          <CardContent className="space-y-4 py-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[90%]" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="">
          <CardContent className="space-y-3 py-6">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-8 w-24" />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="">
            <CardContent className="space-y-3 py-6">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[85%]" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function StateCard({
  title,
  description,
  destructive = false,
}: {
  title: string
  description: string
  destructive?: boolean
}) {
  return (
    <Card className="mx-auto w-full max-w-[720px]">
      <CardContent className="space-y-2 py-8">
        <h1 className={`text-xl font-semibold ${destructive ? "text-destructive" : "text-foreground"}`}>
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}
