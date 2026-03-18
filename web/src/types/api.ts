// TypeScript interfaces mirroring FastAPI Pydantic schemas

export type UserRole = "client_user" | "support_agent" | "team_lead"
export type TicketStatus =
  | "new"
  | "open"
  | "pending_customer"
  | "pending_internal"
  | "resolved"
  | "closed"
export type TicketPriority = "low" | "medium" | "high" | "critical"
export type DraftReviewAction =
  | "approved"
  | "edited_and_approved"
  | "rejected"
  | "escalated"

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface CurrentUser {
  user_id: string
  org_id: string
  workspace_id: string
  role: UserRole
  name: string
}

// Tickets
export interface TicketListItem {
  id: string
  subject: string
  status: string
  priority: string
  category?: string | null
  team?: string | null
  assignee_id?: string | null
  assignee_name?: string | null
  org_name?: string | null
  confidence?: number | null
  sla_policy_name?: string | null
  created_at: string
  updated_at: string
}

export interface TicketMessage {
  id: string
  sender_id?: string | null
  sender_name?: string | null
  sender_type: "customer" | "agent" | "system"
  body: string
  is_internal: boolean
  created_at: string
}

export interface TicketPrediction {
  id: string
  predicted_category?: string | null
  predicted_priority?: string | null
  predicted_team?: string | null
  escalation_suggested: boolean
  escalation_reason?: string | null
  confidence: number
  created_at: string
}

export interface TicketDraft {
  id: string
  body: string
  evidence_chunk_ids: string[]
  confidence: number
  unresolved_questions?: string[] | null
  send_ready: boolean
  approval_outcome?: string | null
  created_at: string
}

export interface EvidenceChunk {
  chunk_id: string
  document_id: string
  document_title: string
  content: string
  similarity: number
  chunk_index: number
}

export interface DraftGenerationResponse extends TicketDraft {
  ticket_id: string
  prompt_version_id: string
  latency_ms?: number | null
  token_usage?: Record<string, number> | null
  estimated_cost_cents?: number | null
  evidence_chunks: EvidenceChunk[]
}

export interface TicketPredictionRecord extends TicketPrediction {
  ticket_id: string
  prompt_version_id: string
  latency_ms?: number | null
  token_usage?: Record<string, number> | null
  estimated_cost_cents?: number | null
}

export interface TicketAssignment {
  id: string
  assigned_to: string
  assigned_by?: string | null
  team?: string | null
  created_at: string
}

export interface TicketDetail extends TicketListItem {
  messages: TicketMessage[]
  latest_prediction?: TicketPrediction | null
  latest_draft?: TicketDraft | null
  assignments: TicketAssignment[]
}

// Drafts
export interface DraftQueueItem {
  draft_generation_id: string
  ticket_id: string
  ticket_subject: string
  body: string
  confidence: number
  approval_outcome?: string | null
  time_since_generation: number
  created_at: string
}

export interface ApprovalRequest {
  action: DraftReviewAction
  edited_body?: string | null
  reason?: string | null
}

export interface ApprovalResponse {
  id: string
  action: string
  acted_by: string
  reason?: string | null
  created_at: string
}

// Knowledge
export interface KnowledgeDocListItem {
  id: string
  title: string
  source_filename?: string | null
  content_type?: string | null
  visibility: string
  status: string
  created_at: string
}

export interface KnowledgeChunk {
  id: string
  chunk_index: number
  content: string
  token_count?: number | null
}

export interface KnowledgeDocDetail extends KnowledgeDocListItem {
  chunks: KnowledgeChunk[]
}

export interface KnowledgeSearchResult {
  chunk_id: string
  document_id: string
  document_title: string
  content: string
  similarity: number
  chunk_index: number
}

// Evals
export interface EvalSetListItem {
  id: string
  name: string
  description?: string | null
  example_count: number
  created_at: string
}

export interface EvalSetDetail extends EvalSetListItem {
  examples: EvalExample[]
}

export interface EvalExample {
  id: string
  type: "classification" | "routing" | "citation"
  input_text: string
  expected_category?: string | null
  expected_team?: string | null
  expected_chunk_ids?: string[] | null
}

export interface EvalResult {
  id: string
  eval_example_id: string
  passed: boolean
  model_output: unknown
  expected_output?: unknown | null
  notes?: string | null
}

export interface EvalRunListItem {
  id: string
  eval_set_id: string
  eval_set_name: string
  prompt_version_id: string
  prompt_version_name: string
  status: string
  total_examples: number
  passed: number
  failed: number
  metrics?: Record<string, number> | null
  created_at: string
  completed_at?: string | null
}

export interface EvalRunDetail extends EvalRunListItem {
  results: EvalResult[]
}

export interface MetricDiff {
  accuracy_a?: number | null
  accuracy_b?: number | null
  routing_accuracy_a?: number | null
  routing_accuracy_b?: number | null
  citation_hit_rate_a?: number | null
  citation_hit_rate_b?: number | null
}

export interface EvalComparison {
  run_a: EvalRunDetail
  run_b: EvalRunDetail
  metric_diff: MetricDiff
}

export interface PromptVersion {
  id: string
  name: string
  type: string
  is_active: boolean
  created_at: string
}
