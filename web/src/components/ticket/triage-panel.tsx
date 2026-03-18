"use client"

import { LoaderCircle, ShieldAlert } from "lucide-react"

import { useTriageTicket } from "@/hooks/use-ticket-detail"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TicketPrediction, UserRole } from "@/types/api"

import {
  PriorityBadge,
  formatEnumLabel,
  getConfidenceMeta,
  getErrorMessage,
  isPrivilegedRole,
} from "@/components/ticket/ticket-ui"

export function TriagePanel({
  ticketId,
  prediction,
  role,
}: {
  ticketId: string
  prediction: TicketPrediction | null | undefined
  role: UserRole
}) {
  const triageTicket = useTriageTicket(ticketId)
  const canRunTriage = isPrivilegedRole(role)

  return (
    <Card className="border-0 bg-white/90 shadow-sm ring-1 ring-foreground/8">
      <CardHeader>
        <CardTitle>AI Triage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {prediction ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{formatEnumLabel(prediction.predicted_category, "Uncategorized")}</Badge>
              {prediction.predicted_priority ? (
                <PriorityBadge priority={prediction.predicted_priority} />
              ) : null}
              <Badge variant="outline">{formatEnumLabel(prediction.predicted_team, "No team")}</Badge>
            </div>

            <ConfidenceMeter confidence={prediction.confidence} />

            {prediction.escalation_suggested && (
              <Alert variant="warning">
                <AlertTitle className="inline-flex items-center gap-2">
                  <ShieldAlert className="size-4" />
                  Escalation suggested
                </AlertTitle>
                <AlertDescription>
                  {prediction.escalation_reason ?? "The model recommends escalation."}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Not triaged yet.</p>
            {canRunTriage && (
              <Button
                onClick={() => triageTicket.mutate()}
                disabled={triageTicket.isPending}
                className="cursor-pointer bg-[#0D9488] text-white hover:bg-[#0A7C72]"
              >
                {triageTicket.isPending && <LoaderCircle className="size-4 animate-spin" />}
                {triageTicket.isPending ? "Running triage..." : "Run Triage"}
              </Button>
            )}
          </div>
        )}

        {triageTicket.isError && (
          <p className="text-sm text-destructive" role="alert">
            {getErrorMessage(triageTicket.error, "Failed to run triage")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const meta = getConfidenceMeta(confidence)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Confidence</span>
        <span className="font-medium text-foreground">{Math.round(confidence * 100)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${meta.barClassName}`}
          style={{ width: `${Math.max(confidence * 100, 6)}%` }}
        />
      </div>
    </div>
  )
}
