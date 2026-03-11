// ─── Operators & Roles ───
export type OperatorRole = 'oncall_engineer' | 'release_manager' | 'ops_engineer' | 'support_lead';

export interface Operator {
  id: string;
  name: string;
  role: OperatorRole;
  avatarUrl: string;
  isActive: boolean;
}

// ─── Services ───
export interface Service {
  id: string;
  name: string;
  tier: 'critical' | 'standard' | 'internal';
  owner: string;
}

// ─── Incidents ───
export type IncidentStatus = 'open' | 'investigating' | 'mitigated' | 'resolved' | 'closed';
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Incident {
  id: string;
  title: string;
  description: string;
  serviceId: string;
  environment: 'production' | 'staging' | 'development';
  severity: IncidentSeverity;
  status: IncidentStatus;
  assigneeId: string | null;
  linkedDeploymentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentEvent {
  id: string;
  incidentId: string;
  actorId: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface IncidentEvidence {
  id: string;
  incidentId: string;
  type: 'error_rate' | 'log_sample' | 'metric_chart' | 'trace' | 'config_diff';
  title: string;
  content: string; // JSON string
  createdAt: string;
}

// ─── Deployments ───
export type DeploymentStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'rolled_back';

export interface Deployment {
  id: string;
  serviceId: string;
  environment: 'production' | 'staging' | 'development';
  version: string;
  previousVersion: string;
  status: DeploymentStatus;
  rolloutPercent: number;
  deployedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentDiff {
  id: string;
  deploymentId: string;
  filePath: string;
  changeType: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  content: string;
}

export interface DeploymentRiskCheck {
  id: string;
  deploymentId: string;
  checkName: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export type RollbackPlanStatus = 'draft' | 'dry_run_ready' | 'approved' | 'executed' | 'failed';

export interface RollbackPlan {
  id: string;
  deploymentId: string;
  targetVersion: string;
  status: RollbackPlanStatus;
  createdBy: string;
  approvedBy: string | null;
  dryRunResult: string | null; // JSON
  createdAt: string;
  updatedAt: string;
}

export interface RollbackStep {
  id: string;
  rollbackPlanId: string;
  stepOrder: number;
  action: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  detail: string;
}

// ─── Jobs ───
export type JobRunStatus = 'draft' | 'dry_run_ready' | 'approved' | 'running' | 'done' | 'failed' | 'aborted';

export interface JobTemplate {
  id: string;
  name: string;
  type: 'backfill' | 'cleanup' | 'replay';
  description: string;
  specSchema: string; // JSON schema
}

export interface JobRun {
  id: string;
  templateId: string;
  serviceId: string;
  environment: 'production' | 'staging' | 'development';
  spec: string; // JSON
  status: JobRunStatus;
  dryRunResult: string | null; // JSON
  createdBy: string;
  approvedBy: string | null;
  progress: number; // 0-100
  createdAt: string;
  updatedAt: string;
}

export interface JobRunEvent {
  id: string;
  jobRunId: string;
  type: 'created' | 'dry_run' | 'approved' | 'started' | 'progress' | 'completed' | 'failed' | 'aborted';
  detail: string;
  createdAt: string;
}

// ─── Reports ───
export type ReportStatus = 'draft' | 'reviewed' | 'finalized' | 'exported';
export type ReportType = 'incident_update' | 'handover' | 'postmortem';

export interface Report {
  id: string;
  type: ReportType;
  title: string;
  incidentId: string | null;
  status: ReportStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportSection {
  id: string;
  reportId: string;
  sectionOrder: number;
  title: string;
  content: string;
}

export interface ReportActionItem {
  id: string;
  reportId: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  isDone: boolean;
}

export interface ReportExport {
  id: string;
  reportId: string;
  format: 'markdown' | 'json';
  content: string;
  exportedAt: string;
}

// ─── Audit ───
export type ActionType =
  | 'incident_create' | 'incident_update' | 'incident_assign' | 'incident_close'
  | 'deployment_create' | 'deployment_rollback'
  | 'rollback_plan_create' | 'rollback_dry_run' | 'rollback_approve' | 'rollback_execute'
  | 'job_create' | 'job_dry_run' | 'job_approve' | 'job_execute' | 'job_abort'
  | 'report_create' | 'report_update' | 'report_finalize' | 'report_export'
  | 'operator_switch';

export interface AuditLog {
  id: string;
  requestId: string;
  actorId: string;
  actorRole: OperatorRole;
  actionType: ActionType;
  targetType: string;
  targetId: string;
  reason: string;
  result: 'success' | 'failure' | 'denied';
  createdAt: string;
}

// ─── Chat ───
export interface ChatThread {
  id: string;
  page: string;
  selectedEntityId: string | null;
  operatorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName: string | null;
  toolResult: string | null; // JSON
  status: 'pending' | 'streaming' | 'completed' | 'failed';
  createdAt: string;
}

export interface ChatContextSnapshot {
  id: string;
  threadId: string;
  messageId: string;
  snapshot: string; // JSON
  createdAt: string;
}
