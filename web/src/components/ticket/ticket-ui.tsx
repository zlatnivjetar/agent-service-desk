import { Badge } from "@/components/ui/badge"
import { getConfidenceStyle } from "@/lib/badge-styles"
import type {
  DraftReviewAction,
  EvidenceChunk,
  TicketPriority,
  TicketStatus,
  UserRole,
} from "@/types/api"

// Re-export shared badge components for backward compatibility
export {
  TicketStatusBadge as StatusBadge,
  TicketPriorityBadge as PriorityBadge,
  SenderBadge,
  ConfidenceBadge,
  ApprovalOutcomeBadge as ReviewOutcomeBadge,
} from "@/components/ui/status-badges"

export const TICKET_STATUS_OPTIONS: Array<{ value: TicketStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "pending_customer", label: "Pending Customer" },
  { value: "pending_internal", label: "Pending Internal" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
]

export const TICKET_PRIORITY_OPTIONS: Array<{ value: TicketPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
]

export const DEMO_ASSIGNEES = [
  {
    id: "00000000-0000-4000-a000-000000000001",
    label: "Alex Agent",
    role: "support_agent" as const,
  },
  {
    id: "00000000-0000-4000-a000-000000000002",
    label: "Lee Lead",
    role: "team_lead" as const,
  },
]

export function formatEnumLabel(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function getInitials(name: string | null | undefined) {
  if (!name) return "?"
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join("")
  return initials.slice(0, 2) || "?"
}

export function getSlaLabel(priority: string | null | undefined) {
  switch (priority) {
    case "critical":
      return "SLA: 1h"
    case "high":
      return "SLA: 4h"
    case "medium":
      return "SLA: 8h"
    default:
      return "SLA: 24h"
  }
}

export function getConfidenceMeta(confidence: number) {
  const style = getConfidenceStyle(confidence)
  return {
    barClassName: style.barClassName,
    badgeClassName: style.className,
    label: style.label,
  }
}

export function isPrivilegedRole(role: UserRole | undefined) {
  return role === "support_agent" || role === "team_lead"
}

export function isDraftPending(approvalOutcome: string | null | undefined) {
  return approvalOutcome == null || approvalOutcome === "pending"
}

export function getReviewOutcomeLabel(outcome: string | null | undefined) {
  return formatEnumLabel(outcome, "Pending")
}

export function getReviewOutcomeClass(outcome: string | null | undefined) {
  switch (outcome) {
    case "approved":
    case "edited_and_approved":
      return "bg-success/10 text-success border-success/20"
    case "rejected":
      return "bg-destructive/10 text-destructive border-destructive/20"
    case "escalated":
      return "bg-warning/10 text-warning border-warning/20"
    default:
      return "border-border text-foreground"
  }
}

export function getErrorMessage(error: unknown, fallback = "Something went wrong") {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

export function getErrorStatus(error: unknown) {
  if (typeof error === "object" && error && "status" in error) {
    const status = Reflect.get(error, "status")
    if (typeof status === "number") return status
  }

  return undefined
}

export function EvidenceList({
  evidenceChunks,
}: {
  evidenceChunks: EvidenceChunk[]
}) {
  return (
    <ol className="space-y-3">
      {evidenceChunks.map((chunk, index) => (
        <li
          key={chunk.chunk_id}
          className="rounded-xl border bg-background/70 p-3"
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-foreground">
              {index + 1}. {chunk.document_title}
            </span>
            <Badge variant="outline">Chunk {chunk.chunk_index}</Badge>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {chunk.content}
          </p>
        </li>
      ))}
    </ol>
  )
}

export const REVIEW_ACTIONS: DraftReviewAction[] = [
  "approved",
  "edited_and_approved",
  "rejected",
  "escalated",
]
