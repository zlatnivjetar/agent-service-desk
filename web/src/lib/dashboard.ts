import type { DashboardRangePreset } from "@/types/api"

export const TEAM_OPTIONS = [
  { value: "general_support", label: "General Support" },
  { value: "billing_team", label: "Billing Team" },
  { value: "engineering", label: "Engineering" },
  { value: "integrations", label: "Integrations" },
  { value: "onboarding", label: "Onboarding" },
  { value: "account_management", label: "Account Management" },
]

export const DATE_RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom" },
]

export const OVERVIEW_TABLE_COLUMNS = [
  { id: "subject", label: "Subject" },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "created", label: "Created" },
  { id: "assignee", label: "Assignee" },
  { id: "category", label: "Category" },
]

export const TICKETS_TABLE_COLUMNS = [
  { id: "subject", label: "Subject" },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "created", label: "Created" },
  { id: "assignee", label: "Assignee" },
  { id: "org", label: "Org" },
  { id: "category", label: "Category" },
  { id: "confidence", label: "Confidence" },
]

export const DEFAULT_OVERVIEW_COLUMNS = OVERVIEW_TABLE_COLUMNS.map((column) => column.id)
export const DEFAULT_TICKETS_COLUMNS = TICKETS_TABLE_COLUMNS.map((column) => column.id)

export const OVERVIEW_ALLOWED_QUERY_KEYS = [
  "range",
  "from",
  "to",
  "compare",
  "team",
  "assignee_id",
  "status",
  "priority",
  "age_bucket",
  "page",
  "sort_by",
  "sort_order",
]

export const TICKETS_ALLOWED_QUERY_KEYS = [
  "range",
  "from",
  "to",
  "status",
  "priority",
  "category",
  "team",
  "assignee",
  "updated_before",
  "page",
  "sort_by",
  "sort_order",
]

export function serializeQueryState(
  searchParams: URLSearchParams,
  allowedKeys: string[]
) {
  const state: Record<string, string> = {}
  allowedKeys.forEach((key) => {
    const value = searchParams.get(key)
    if (value != null && value !== "") {
      state[key] = value
    }
  })
  return state
}

export function searchParamsFromState(state: Record<string, unknown>) {
  const searchParams = new URLSearchParams()
  Object.entries(state).forEach(([key, value]) => {
    if (typeof value === "string" && value !== "") {
      searchParams.set(key, value)
    }
  })
  return searchParams
}

export function hrefFromState(pathname: string, state: Record<string, unknown>) {
  const searchParams = searchParamsFromState(state)
  const query = searchParams.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function getDefaultRangePreset(value: string | null): DashboardRangePreset {
  if (value === "7d" || value === "30d" || value === "90d" || value === "custom") {
    return value
  }
  return "30d"
}

export function formatAgeBucketLabel(bucket: string) {
  switch (bucket) {
    case "0_1d":
      return "0-1d"
    case "2_3d":
      return "2-3d"
    case "4_7d":
      return "4-7d"
    case "8_14d":
      return "8-14d"
    case "15d_plus":
      return "15d+"
    default:
      return bucket
  }
}

export function getRangeBounds(
  range: DashboardRangePreset,
  fromValue?: string | null,
  toValue?: string | null
) {
  const today = new Date()
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

  if (range === "custom" && fromValue && toValue) {
    return { from: fromValue, to: toValue }
  }

  const presetDays = range === "7d" ? 6 : range === "90d" ? 89 : 29
  const start = new Date(end)
  start.setUTCDate(end.getUTCDate() - presetDays)
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  }
}

function parseUtcDate(dateString: string) {
  return new Date(`${dateString}T00:00:00.000Z`)
}

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function getDateRangeDayCount(from: string, to: string) {
  const diffMs = parseUtcDate(to).getTime() - parseUtcDate(from).getTime()
  return Math.floor(diffMs / 86_400_000) + 1
}

export function getPreviousRangeBounds(from: string, to: string) {
  const dayCount = getDateRangeDayCount(from, to)
  const previousEnd = parseUtcDate(from)
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)

  const previousStart = new Date(previousEnd)
  previousStart.setUTCDate(previousEnd.getUTCDate() - (dayCount - 1))

  return {
    from: formatUtcDate(previousStart),
    to: formatUtcDate(previousEnd),
    dayCount,
  }
}

export function getAgeBucketRange(bucket: string, endDate: string) {
  const end = new Date(`${endDate}T00:00:00.000Z`)
  const makeDate = (daysAgo: number) => {
    const value = new Date(end)
    value.setUTCDate(end.getUTCDate() - daysAgo)
    return value.toISOString().slice(0, 10)
  }

  switch (bucket) {
    case "0_1d":
      return { from: makeDate(1), to: endDate }
    case "2_3d":
      return { from: makeDate(3), to: makeDate(2) }
    case "4_7d":
      return { from: makeDate(7), to: makeDate(4) }
    case "8_14d":
      return { from: makeDate(14), to: makeDate(8) }
    case "15d_plus":
      return { from: null, to: makeDate(15) }
    default:
      return { from: null, to: null }
  }
}
