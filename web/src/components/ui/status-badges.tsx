import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  BADGE_TONE_DOT_CLASSNAMES,
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
  type BadgeStyleEntry,
} from "@/lib/badge-styles"

function ReadOnlyBadge({
  style,
  children,
  className,
}: {
  style: BadgeStyleEntry
  children?: ReactNode
  className?: string
}) {
  return (
    <Badge
      className={className}
      dotClassName={cn(
        BADGE_TONE_DOT_CLASSNAMES[style.tone],
        style.pulseDot && "animate-pulse",
        style.dotClassName
      )}
    >
      {children ?? style.label}
    </Badge>
  )
}

export function TicketStatusBadge({ status }: { status: string }) {
  const style = TICKET_STATUS_STYLES[status as keyof typeof TICKET_STATUS_STYLES] ?? FALLBACK_STYLE
  return <ReadOnlyBadge style={style} />
}

export function TicketPriorityBadge({ priority }: { priority: string }) {
  const style = TICKET_PRIORITY_STYLES[priority as keyof typeof TICKET_PRIORITY_STYLES] ?? FALLBACK_STYLE
  return <ReadOnlyBadge style={style} />
}

export function KnowledgeStatusBadge({ status }: { status: string }) {
  const style = KNOWLEDGE_STATUS_STYLES[status] ?? FALLBACK_STYLE
  return <ReadOnlyBadge style={style} />
}

export function ApprovalOutcomeBadge({ outcome }: { outcome: string | null | undefined }) {
  const style = APPROVAL_OUTCOME_STYLES[outcome ?? "pending"] ?? FALLBACK_STYLE
  return <ReadOnlyBadge style={style} />
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const style = getConfidenceStyle(confidence)
  return (
    <ReadOnlyBadge style={style}>
      {Math.round(confidence * 100)}% confidence
    </ReadOnlyBadge>
  )
}

export function SenderBadge({ senderType }: { senderType: string }) {
  const style = SENDER_STYLES[senderType] ?? FALLBACK_STYLE
  return <ReadOnlyBadge style={style} />
}

export function VisibilityBadge({ visibility }: { visibility: string }) {
  const style = VISIBILITY_STYLES[visibility] ?? FALLBACK_STYLE
  return <ReadOnlyBadge style={style} />
}

export function EvalRunStatusBadge({ status }: { status: string }) {
  const style = EVAL_RUN_STATUS_STYLES[status] ?? FALLBACK_STYLE
  return <ReadOnlyBadge style={style} />
}

export function RoleBadge({ role }: { role: string }) {
  const style = ROLE_STYLES[role] ?? FALLBACK_STYLE
  return (
    <ReadOnlyBadge style={style} className="px-2.5 text-[11px]" />
  )
}
