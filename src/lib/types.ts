export type EmployeeStatus = "available" | "coming_soon";

export interface Employee {
  id: string;
  slug: string;
  name: string;
  role: string;
  description: string;
  responsibilities: string[];
  salary: string;
  status: EmployeeStatus;
}

export interface Company {
  id: string;
  owner_id: string;
  name: string;
  website: string | null;
}

export type EmploymentStatus = "active" | "inactive" | "terminated";
export type OnboardingStatus = "not_started" | "in_progress" | "completed";
export type WorkStatus =
  | "ready"
  | "assigned"
  | "working"
  | "awaiting_review"
  | "blocked";

export interface CompanyEmployee {
  id: string;
  company_id: string;
  employee_id: string;
  hired_at: string;
  employment_status: EmploymentStatus;
  onboarding_status: OnboardingStatus;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
  current_question_id: string | null;
  work_status: WorkStatus;
  current_assignment_id: string | null;
}

export type AssignmentPriority = "low" | "normal" | "high";
export type AssignmentStatus =
  | "draft"
  /** Assigned by the manager, behind something the employee is already doing.
   *  Starts on its own when they are free. */
  | "waiting"
  | "assigned"
  | "queued"
  | "working"
  | "submitted"
  | "needs_changes"
  | "revision_queued"
  | "revising"
  | "completed"
  | "failed"
  | "cancelled";

export type ProgressEventType =
  | "assignment_received"
  | "company_context_reviewed"
  | "research_started"
  | "findings_organized"
  | "deliverable_prepared"
  | "deliverable_submitted"
  | "review_approved"
  | "revision_requested"
  | "revision_started"
  | "assignment_completed";

export type DeliverableStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "needs_changes"
  | "superseded";

export interface Deliverable {
  id: string;
  company_id: string;
  assignment_id: string;
  company_employee_id: string;
  title: string;
  deliverable_type: string;
  content_markdown: string;
  status: DeliverableStatus;
  version: number;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  work_execution_id: string | null;
  content_json: unknown;
  source_count: number;
  generation_model: string | null;
  parent_deliverable_id: string | null;
  revision_request_id: string | null;
  revision_summary_json: unknown;
  superseded_at: string | null;
}

export type RevisionRequestStatus =
  | "pending"
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

export interface RevisionRequest {
  id: string;
  assignment_id: string;
  source_deliverable_id: string;
  feedback: string;
  status: RevisionRequestStatus;
  target_version: number;
  requested_at: string;
}

export type ExecutionStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkExecution {
  id: string;
  company_id: string;
  assignment_id: string;
  company_employee_id: string;
  status: ExecutionStatus;
  current_step: string | null;
  attempt_number: number;
  error_code: string | null;
  search_request_count: number;
  source_fetch_count: number;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
}

export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  source_type: string | null;
  published_at: string | null;
  accessed_at: string | null;
  fetch_status: string;
}

export interface DeliverableReview {
  id: string;
  deliverable_id: string;
  reviewer_user_id: string;
  decision: "approved" | "needs_changes";
  feedback: string | null;
  created_at: string;
}

export type ProgressEventStatus = "pending" | "active" | "completed" | "failed";

export interface Assignment {
  id: string;
  company_id: string;
  company_employee_id: string;
  title: string;
  description: string;
  expected_outcome: string | null;
  priority: AssignmentPriority;
  status: AssignmentStatus;
  current_progress_step: ProgressEventType | null;
  assigned_at: string;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  /** Per-assignment role input (Emma's target count and filters). Separate from
   *  role knowledge: changing an assignment never edits the onboarding profile. */
  role_input_json: unknown;
  role_input_schema_id: string | null;
  /** How the work began: "manual" when a person wrote it, "recurring" when a
   *  schedule fired, "initiative" when the manager approved something the
   *  employee proposed. The work itself is identical in all three cases. */
  source_type: string;
  recurring_assignment_id: string | null;
  recurring_occurrence_id: string | null;
  initiative_id: string | null;
  /** "manager" when the manager will review it, "internal" when it exists only
   *  because a colleague asked for it. Internal work never appears in the
   *  manager's assignment or deliverable lists. */
  assignment_type: string;
  parent_assignment_id: string | null;
  internal_request_id: string | null;
}

export interface AssignmentProgressEvent {
  id: string;
  assignment_id: string;
  event_type: ProgressEventType;
  title: string;
  description: string | null;
  status: ProgressEventStatus;
  sequence: number;
  completed_at: string | null;
}

/** Shape handed to an employee when it works on an assignment. */
export interface EmployeeWorkContext {
  employee: {
    name: string;
    role: string;
    slug: string;
  };
  companyKnowledge: {
    companySummary: string;
    customerSummary: string;
    problemSummary: string;
    differentiationSummary?: string;
    competitors?: string[];
    priorities?: string[];
    additionalContext?: string;
  };
  assignment: {
    id: string;
    title: string;
    description: string;
    expectedOutcome?: string;
    priority: AssignmentPriority;
  };
}

export interface OnboardingAnswer {
  id: string;
  company_employee_id: string;
  question_id: string;
  question_category: "company" | "role";
  answer_text: string | null;
  answer_json: unknown;
  updated_at: string;
}

export interface KnowledgeProfile {
  id: string;
  company_employee_id: string;
  company_summary: string | null;
  customer_summary: string | null;
  problem_summary: string | null;
  differentiation_summary: string | null;
  competitors: string[];
  priorities: string[];
  additional_context: string | null;
  /** Role-specific knowledge, shaped by the employee's role knowledge schema.
   *  Validated on write; consumers parse it through that schema. */
  role_knowledge_json: unknown;
  role_knowledge_schema_id: string | null;
}
