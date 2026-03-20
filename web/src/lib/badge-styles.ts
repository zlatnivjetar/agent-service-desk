import type { DashboardWatchlistItem, TicketStatus, TicketPriority } from "@/types/api"

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
  dotColorVar?: string
  pulseDot?: boolean
  colorVar?: string
  softColorVar?: string
  borderColorVar?: string
}

export const BADGE_TONE_DOT_CLASSNAMES: Record<BadgeTone, string> = {
  brand: "bg-primary",
  info: "bg-info",
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-destructive",
  neutral: "bg-neutral",
}

export const BADGE_TONE_COLOR_VARS: Record<BadgeTone, string> = {
  brand: "var(--primary)",
  info: "var(--info)",
  warning: "var(--warning)",
  success: "var(--success)",
  danger: "var(--destructive)",
  neutral: "var(--neutral)",
}

export const BADGE_TONE_SOFT_COLOR_VARS: Record<BadgeTone, string> = {
  brand: "var(--primary-soft)",
  info: "var(--info-soft)",
  warning: "var(--warning-soft)",
  success: "var(--success-soft)",
  danger: "var(--destructive-soft)",
  neutral: "var(--neutral-soft)",
}

export const BADGE_TONE_BORDER_COLOR_VARS: Record<BadgeTone, string> = {
  brand: "var(--primary-border)",
  info: "var(--info-border)",
  warning: "var(--warning-border)",
  success: "var(--success-border)",
  danger: "var(--destructive-border)",
  neutral: "var(--neutral-border)",
}

function withToneTokens(
  entry: Omit<BadgeStyleEntry, "dotColorVar" | "colorVar" | "softColorVar" | "borderColorVar">,
  overrides?: Partial<
    Pick<BadgeStyleEntry, "dotColorVar" | "colorVar" | "softColorVar" | "borderColorVar">
  >
): BadgeStyleEntry {
  return {
    ...entry,
    dotColorVar: overrides?.dotColorVar ?? BADGE_TONE_COLOR_VARS[entry.tone],
    colorVar: overrides?.colorVar ?? BADGE_TONE_COLOR_VARS[entry.tone],
    softColorVar: overrides?.softColorVar ?? BADGE_TONE_SOFT_COLOR_VARS[entry.tone],
    borderColorVar: overrides?.borderColorVar ?? BADGE_TONE_BORDER_COLOR_VARS[entry.tone],
  }
}

// Ticket status
export const TICKET_STATUS_STYLES: Record<TicketStatus, BadgeStyleEntry> = {
  new: withToneTokens(
    { label: "New", tone: "neutral" },
    {
      dotColorVar: "var(--status-new)",
      colorVar: "var(--status-new)",
    }
  ),
  open: withToneTokens({ label: "Open", tone: "brand" }),
  pending_customer: withToneTokens({ label: "Pending Customer", tone: "warning" }),
  pending_internal: withToneTokens({ label: "Pending Internal", tone: "warning" }),
  resolved: withToneTokens(
    { label: "Resolved", tone: "success" },
    {
      dotColorVar: "var(--status-resolved)",
      colorVar: "var(--status-resolved)",
    }
  ),
  closed: withToneTokens(
    { label: "Closed", tone: "neutral" },
    {
      dotColorVar: "var(--status-closed)",
      colorVar: "var(--status-closed)",
    }
  ),
}

// Ticket priority
export const TICKET_PRIORITY_STYLES: Record<TicketPriority, BadgeStyleEntry> = {
  low: withToneTokens({ label: "Low", tone: "neutral" }),
  medium: withToneTokens(
    { label: "Medium", tone: "warning" },
    {
      dotColorVar: "var(--priority-medium)",
      colorVar: "var(--priority-medium)",
    }
  ),
  high: withToneTokens({ label: "High", tone: "warning" }),
  critical: withToneTokens(
    { label: "Critical", tone: "danger", dotClassName: "animate-critical-dot" },
    {
      dotColorVar: "var(--priority-critical)",
      colorVar: "var(--priority-critical)",
    }
  ),
}

type DashboardWatchlistSeverity = DashboardWatchlistItem["severity"]

export const DASHBOARD_WATCHLIST_STYLES: Record<DashboardWatchlistSeverity, BadgeStyleEntry> = {
  critical: withToneTokens(
    { label: "Critical", tone: "danger", dotClassName: "animate-critical-dot" },
    {
      dotColorVar: "var(--priority-critical)",
      colorVar: "var(--priority-critical)",
    }
  ),
  warning: withToneTokens({ label: "Warning", tone: "warning" }),
  info: withToneTokens(
    { label: "Info", tone: "brand" },
    {
      dotColorVar: "var(--primary)",
      colorVar: "var(--primary)",
    }
  ),
}

// Knowledge doc status
export const KNOWLEDGE_STATUS_STYLES: Record<string, BadgeStyleEntry> = {
  pending: withToneTokens({ label: "Pending", tone: "warning" }),
  processing: withToneTokens({ label: "Processing", tone: "info", pulseDot: true }),
  indexed: withToneTokens({ label: "Indexed", tone: "success" }),
  failed: withToneTokens({ label: "Failed", tone: "danger" }),
}

// Draft approval outcome
export const APPROVAL_OUTCOME_STYLES: Record<string, BadgeStyleEntry> = {
  approved: withToneTokens({ label: "Approved", tone: "success" }),
  edited_and_approved: withToneTokens({ label: "Edited + approved", tone: "success" }),
  rejected: withToneTokens({ label: "Rejected", tone: "danger" }),
  escalated: withToneTokens({ label: "Escalated", tone: "warning" }),
  pending: withToneTokens({ label: "Pending", tone: "warning" }),
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
  customer: withToneTokens({ label: "Customer", tone: "info" }),
  agent: withToneTokens({ label: "Agent", tone: "brand" }),
  system: withToneTokens({ label: "System", tone: "neutral" }),
}

// Visibility
export const VISIBILITY_STYLES: Record<string, BadgeStyleEntry> = {
  internal: withToneTokens({ label: "Internal", tone: "neutral" }),
  client_visible: withToneTokens({ label: "Client visible", tone: "brand" }),
}

// Eval run status
export const EVAL_RUN_STATUS_STYLES: Record<string, BadgeStyleEntry> = {
  completed: withToneTokens({ label: "Completed", tone: "success" }),
  running: withToneTokens({ label: "Running", tone: "info", pulseDot: true }),
  failed: withToneTokens({ label: "Failed", tone: "danger" }),
}

// User role
export const ROLE_STYLES: Record<string, BadgeStyleEntry> = {
  team_lead: withToneTokens({ label: "Team Lead", tone: "brand" }),
  support_agent: withToneTokens({ label: "Agent", tone: "brand" }),
  client_user: withToneTokens({ label: "Client", tone: "neutral" }),
}

// Fallback for unknown values
export const FALLBACK_STYLE: BadgeStyleEntry = withToneTokens({
  label: "Unknown",
  tone: "neutral",
})

export function getTicketStatusStyle(status: string) {
  return TICKET_STATUS_STYLES[status as TicketStatus] ?? FALLBACK_STYLE
}

export function getTicketPriorityStyle(priority: string) {
  return TICKET_PRIORITY_STYLES[priority as TicketPriority] ?? FALLBACK_STYLE
}

export function getDashboardWatchlistStyle(severity: string) {
  return DASHBOARD_WATCHLIST_STYLES[severity as DashboardWatchlistSeverity] ?? FALLBACK_STYLE
}
