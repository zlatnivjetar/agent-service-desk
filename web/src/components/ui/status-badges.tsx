import { Badge } from "@/components/ui/badge"
import {
  TICKET_STATUS_STYLES,
  TICKET_PRIORITY_STYLES,
  KNOWLEDGE_STATUS_STYLES,
  APPROVAL_OUTCOME_STYLES,
  SENDER_STYLES,
  VISIBILITY_STYLES,
  EVAL_RUN_STATUS_STYLES,
  ROLE_STYLES,
  FALLBACK_STYLE,
  getConfidenceStyle,
} from "@/lib/badge-styles"

export function TicketStatusBadge({ status }: { status: string }) {
  const style = TICKET_STATUS_STYLES[status as keyof typeof TICKET_STATUS_STYLES] ?? FALLBACK_STYLE
  return <Badge className={style.className}>{style.label}</Badge>
}

export function TicketPriorityBadge({ priority }: { priority: string }) {
  const style = TICKET_PRIORITY_STYLES[priority as keyof typeof TICKET_PRIORITY_STYLES] ?? FALLBACK_STYLE
  return <Badge className={style.className}>{style.label}</Badge>
}

export function KnowledgeStatusBadge({ status }: { status: string }) {
  const style = KNOWLEDGE_STATUS_STYLES[status] ?? FALLBACK_STYLE
  return <Badge className={style.className}>{style.label}</Badge>
}

export function ApprovalOutcomeBadge({ outcome }: { outcome: string | null | undefined }) {
  const style = APPROVAL_OUTCOME_STYLES[outcome ?? "pending"] ?? FALLBACK_STYLE
  return <Badge className={style.className}>{style.label}</Badge>
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const style = getConfidenceStyle(confidence)
  return (
    <Badge className={style.className}>
      {Math.round(confidence * 100)}% {style.label.toLowerCase()}
    </Badge>
  )
}

export function SenderBadge({ senderType }: { senderType: string }) {
  const style = SENDER_STYLES[senderType] ?? FALLBACK_STYLE
  return <Badge className={style.className}>{style.label}</Badge>
}

export function VisibilityBadge({ visibility }: { visibility: string }) {
  const style = VISIBILITY_STYLES[visibility] ?? FALLBACK_STYLE
  return <Badge className={style.className}>{style.label}</Badge>
}

export function EvalRunStatusBadge({ status }: { status: string }) {
  const style = EVAL_RUN_STATUS_STYLES[status] ?? FALLBACK_STYLE
  return <Badge className={style.className}>{style.label}</Badge>
}

export function RoleBadge({ role }: { role: string }) {
  const style = ROLE_STYLES[role] ?? FALLBACK_STYLE
  return (
    <Badge variant="secondary" className="text-xs px-1 py-0 w-fit">
      {style.label}
    </Badge>
  )
}
