import type { TicketStatus, TicketPriority } from "@/types/api"

export type BadgeStyleEntry = {
  className: string
  label: string
}

// Ticket status
export const TICKET_STATUS_STYLES: Record<TicketStatus, BadgeStyleEntry> = {
  new: { className: "bg-primary text-primary-foreground", label: "New" },
  open: { className: "bg-blue-100 text-blue-800 border-blue-200", label: "Open" },
  pending_customer: { className: "border-border text-foreground", label: "Pending Customer" },
  pending_internal: { className: "border-border text-foreground", label: "Pending Internal" },
  resolved: { className: "bg-success/10 text-success border-success/20", label: "Resolved" },
  closed: { className: "bg-muted text-muted-foreground border-transparent", label: "Closed" },
}

// Ticket priority
export const TICKET_PRIORITY_STYLES: Record<TicketPriority, BadgeStyleEntry> = {
  low: { className: "bg-muted text-muted-foreground border-transparent", label: "Low" },
  medium: { className: "bg-secondary text-secondary-foreground border-transparent", label: "Medium" },
  high: { className: "bg-warning/10 text-warning border-warning/20", label: "High" },
  critical: { className: "bg-destructive/10 text-destructive border-destructive/20", label: "Critical" },
}

// Knowledge doc status
export const KNOWLEDGE_STATUS_STYLES: Record<string, BadgeStyleEntry> = {
  pending: { className: "border-border text-muted-foreground", label: "Pending" },
  processing: { className: "bg-blue-100 text-blue-800 border-blue-200", label: "Processing" },
  indexed: { className: "bg-success/10 text-success border-success/20", label: "Indexed" },
  failed: { className: "bg-destructive/10 text-destructive border-destructive/20", label: "Failed" },
}

// Draft approval outcome
export const APPROVAL_OUTCOME_STYLES: Record<string, BadgeStyleEntry> = {
  approved: { className: "bg-success/10 text-success border-success/20", label: "Approved" },
  edited_and_approved: { className: "bg-success/10 text-success border-success/20", label: "Edited And Approved" },
  rejected: { className: "bg-destructive/10 text-destructive border-destructive/20", label: "Rejected" },
  escalated: { className: "bg-warning/10 text-warning border-warning/20", label: "Escalated" },
  pending: { className: "border-border text-foreground", label: "Pending" },
}

// Confidence level
export function getConfidenceStyle(confidence: number) {
  if (confidence >= 0.8) {
    return {
      className: "bg-success/10 text-success border-success/20",
      barClassName: "bg-success",
      label: "High confidence",
    }
  }
  if (confidence >= 0.5) {
    return {
      className: "bg-warning/10 text-warning border-warning/20",
      barClassName: "bg-warning",
      label: "Medium confidence",
    }
  }
  return {
    className: "bg-destructive/10 text-destructive border-destructive/20",
    barClassName: "bg-destructive",
    label: "Low confidence",
  }
}

// Sender type
export const SENDER_STYLES: Record<string, BadgeStyleEntry> = {
  customer: { className: "bg-blue-100 text-blue-800 border-blue-200", label: "Customer" },
  agent: { className: "bg-primary/10 text-primary border-primary/20", label: "Agent" },
  system: { className: "bg-muted text-muted-foreground border-transparent", label: "System" },
}

// Visibility
export const VISIBILITY_STYLES: Record<string, BadgeStyleEntry> = {
  internal: { className: "bg-secondary text-secondary-foreground border-transparent", label: "Internal" },
  client_visible: { className: "bg-primary text-primary-foreground", label: "Client visible" },
}

// Eval run status
export const EVAL_RUN_STATUS_STYLES: Record<string, BadgeStyleEntry> = {
  completed: { className: "bg-success/10 text-success border-success/20", label: "Completed" },
  running: { className: "animate-pulse bg-blue-100 text-blue-800 border-blue-200", label: "Running" },
  failed: { className: "bg-destructive/10 text-destructive border-destructive/20", label: "Failed" },
}

// User role
export const ROLE_STYLES: Record<string, BadgeStyleEntry> = {
  team_lead: { className: "bg-secondary text-secondary-foreground border-transparent", label: "Team Lead" },
  support_agent: { className: "bg-secondary text-secondary-foreground border-transparent", label: "Agent" },
  client_user: { className: "bg-secondary text-secondary-foreground border-transparent", label: "Client" },
}

// Fallback for unknown values
export const FALLBACK_STYLE: BadgeStyleEntry = {
  className: "border-border text-foreground",
  label: "Unknown",
}
