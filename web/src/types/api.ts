// TypeScript interfaces mirroring FastAPI Pydantic schemas

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
  role: string
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
  sender_type: string
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

export interface TicketAssignment {
  id: string
  assignee_id: string
  assignee_name?: string | null
  assigned_at: string
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
  time_since_generation: string
  created_at: string
}

export interface ApprovalRequest {
  outcome: "approved" | "rejected" | "escalated"
  notes?: string | null
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
  input: string
  expected_output?: string | null
  metadata?: Record<string, unknown> | null
}

export interface EvalResult {
  id: string
  eval_example_id: string
  passed: boolean
  model_output: string
  expected_output?: string | null
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
  metric: string
  run_a: number
  run_b: number
  delta: number
}

export interface EvalComparison {
  run_a: EvalRunListItem
  run_b: EvalRunListItem
  metric_diffs: MetricDiff[]
}

export interface PromptVersion {
  id: string
  name: string
  description?: string | null
  created_at: string
}
