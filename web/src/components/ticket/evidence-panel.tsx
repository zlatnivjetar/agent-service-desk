"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EvidenceChunk, TicketDraft } from "@/types/api"

import { EvidenceList } from "@/components/ticket/ticket-ui"

export function EvidencePanel({
  draft,
  evidenceChunks,
}: {
  draft: TicketDraft | null | undefined
  evidenceChunks: EvidenceChunk[] | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Retrieved Evidence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {evidenceChunks && evidenceChunks.length > 0 ? (
          <EvidenceList evidenceChunks={evidenceChunks} />
        ) : draft?.evidence_chunk_ids.length ? (
          <>
            <p className="text-sm text-muted-foreground">
              {draft.evidence_chunk_ids.length} evidence chunks referenced.
            </p>
            <ol className="space-y-2">
              {draft.evidence_chunk_ids.map((chunkId, index) => (
                <li
                  key={chunkId}
                  className="rounded-xl border bg-background/70 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">{index + 1}.</span>{" "}
                  <code className="text-xs text-muted-foreground">{chunkId}</code>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No evidence retrieved yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
