import type { TicketStatus, TicketPriority } from "@/types/api"

export type BadgeTone =
  | "brand"
  | "info"
  | "warning"
  | "success"
  | "danger"
  | "neutral"

export type BadgeStyleEntry = {
  label: string
  tone: BadgeTone
  dotClassName?: string
  pulseDot?: boolean
}

export const BADGE_TONE_DOT_CLASSNAMES: Record<BadgeTone, string> = {
  brand: "bg-primary",
  info: "bg-info",
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-destructive",
  neutral: "bg-neutral",
}

// Ticket status
export const TICKET_STATUS_STYLES: Record<TicketStatus, BadgeStyleEntry> = {
  new: { label: "New", tone: "brand" },
  open: { label: "Open", tone: "brand" },
  pending_customer: { label: "Pending Customer", tone: "warning" },
  pending_internal: { label: "Pending Internal", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
}

// Ticket priority
export const TICKET_PRIORITY_STYLES: Record<TicketPriority, BadgeStyleEntry> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Medium", tone: "neutral" },
  high: { label: "High", tone: "warning" },
  critical: { label: "Critical", tone: "danger" },
}

// Knowledge doc status
export const KNOWLEDGE_STATUS_STYLES: Record<string, BadgeStyleEntry> = {
  pending: { label: "Pending", tone: "warning" },
  processing: { label: "Processing", tone: "info", pulseDot: true },
  indexed: { label: "Indexed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
}

// Draft approval outcome
export const APPROVAL_OUTCOME_STYLES: Record<string, BadgeStyleEntry> = {
  approved: { label: "Approved", tone: "success" },
  edited_and_approved: { label: "Edited + approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  escalated: { label: "Escalated", tone: "warning" },
  pending: { label: "Pending", tone: "warning" },
}

// Confidence level
export function getConfidenceStyle(confidence: number) {
  if (confidence >= 0.8) {
    return {
      tone: "success" as const,
      barClassName: "bg-success",
      label: "Confidence",
    }
  }
  if (confidence >= 0.5) {
    return {
      tone: "warning" as const,
      barClassName: "bg-warning",
      label: "Confidence",
    }
  }
  return {
    tone: "danger" as const,
    barClassName: "bg-destructive",
    label: "Confidence",
  }
}

// Sender type
export const SENDER_STYLES: Record<string, BadgeStyleEntry> = {
  customer: { label: "Customer", tone: "info" },
  agent: { label: "Agent", tone: "brand" },
  system: { label: "System", tone: "neutral" },
}

// Visibility
export const VISIBILITY_STYLES: Record<string, BadgeStyleEntry> = {
  internal: { label: "Internal", tone: "neutral" },
  client_visible: { label: "Client visible", tone: "brand" },
}

// Eval run status
export const EVAL_RUN_STATUS_STYLES: Record<string, BadgeStyleEntry> = {
  completed: { label: "Completed", tone: "success" },
  running: { label: "Running", tone: "info", pulseDot: true },
  failed: { label: "Failed", tone: "danger" },
}

// User role
export const ROLE_STYLES: Record<string, BadgeStyleEntry> = {
  team_lead: { label: "Team Lead", tone: "brand" },
  support_agent: { label: "Agent", tone: "brand" },
  client_user: { label: "Client", tone: "neutral" },
}

// Fallback for unknown values
export const FALLBACK_STYLE: BadgeStyleEntry = {
  label: "Unknown",
  tone: "neutral",
}
