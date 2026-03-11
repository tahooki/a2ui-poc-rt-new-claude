import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'ops-console.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    -- Operators
    CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('oncall_engineer','release_manager','ops_engineer','support_lead')),
      avatar_url TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Services
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tier TEXT NOT NULL CHECK(tier IN ('critical','standard','internal')),
      owner TEXT NOT NULL
    );

    -- Incidents
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      service_id TEXT NOT NULL REFERENCES services(id),
      environment TEXT NOT NULL CHECK(environment IN ('production','staging','development')),
      severity TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low')),
      status TEXT NOT NULL CHECK(status IN ('open','investigating','mitigated','resolved','closed')) DEFAULT 'open',
      assignee_id TEXT REFERENCES operators(id),
      linked_deployment_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS incident_events (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      actor_id TEXT NOT NULL REFERENCES operators(id),
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS incident_evidence (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      type TEXT NOT NULL CHECK(type IN ('error_rate','log_sample','metric_chart','trace','config_diff')),
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Deployments
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id),
      environment TEXT NOT NULL CHECK(environment IN ('production','staging','development')),
      version TEXT NOT NULL,
      previous_version TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed','rolled_back')) DEFAULT 'pending',
      rollout_percent INTEGER NOT NULL DEFAULT 0,
      deployed_by TEXT NOT NULL REFERENCES operators(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deployment_diffs (
      id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL REFERENCES deployments(id),
      file_path TEXT NOT NULL,
      change_type TEXT NOT NULL CHECK(change_type IN ('added','modified','deleted')),
      additions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS deployment_risk_checks (
      id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL REFERENCES deployments(id),
      check_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pass','warn','fail')),
      detail TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS rollback_plans (
      id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL REFERENCES deployments(id),
      target_version TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft','dry_run_ready','approved','executed','failed')) DEFAULT 'draft',
      created_by TEXT NOT NULL REFERENCES operators(id),
      approved_by TEXT REFERENCES operators(id),
      dry_run_result TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rollback_steps (
      id TEXT PRIMARY KEY,
      rollback_plan_id TEXT NOT NULL REFERENCES rollback_plans(id),
      step_order INTEGER NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','running','done','failed')) DEFAULT 'pending',
      detail TEXT NOT NULL DEFAULT ''
    );

    -- Jobs
    CREATE TABLE IF NOT EXISTS job_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('backfill','cleanup','replay')),
      description TEXT NOT NULL DEFAULT '',
      spec_schema TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS job_runs (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES job_templates(id),
      service_id TEXT NOT NULL REFERENCES services(id),
      environment TEXT NOT NULL CHECK(environment IN ('production','staging','development')),
      spec TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL CHECK(status IN ('draft','dry_run_ready','approved','running','done','failed','aborted')) DEFAULT 'draft',
      dry_run_result TEXT,
      created_by TEXT NOT NULL REFERENCES operators(id),
      approved_by TEXT REFERENCES operators(id),
      progress INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_run_events (
      id TEXT PRIMARY KEY,
      job_run_id TEXT NOT NULL REFERENCES job_runs(id),
      type TEXT NOT NULL CHECK(type IN ('created','dry_run','approved','started','progress','completed','failed','aborted')),
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Reports
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('incident_update','handover','postmortem')),
      title TEXT NOT NULL,
      incident_id TEXT REFERENCES incidents(id),
      status TEXT NOT NULL CHECK(status IN ('draft','reviewed','finalized','exported')) DEFAULT 'draft',
      created_by TEXT NOT NULL REFERENCES operators(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS report_sections (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id),
      section_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS report_action_items (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id),
      description TEXT NOT NULL,
      assignee_id TEXT REFERENCES operators(id),
      due_date TEXT,
      is_done INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS report_exports (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES reports(id),
      format TEXT NOT NULL CHECK(format IN ('markdown','json')),
      content TEXT NOT NULL,
      exported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL CHECK(result IN ('success','failure','denied')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Chat
    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      page TEXT NOT NULL,
      selected_entity_id TEXT,
      operator_id TEXT NOT NULL REFERENCES operators(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES chat_threads(id),
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
      content TEXT NOT NULL DEFAULT '',
      tool_name TEXT,
      tool_result TEXT,
      status TEXT NOT NULL CHECK(status IN ('pending','streaming','completed','failed')) DEFAULT 'completed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_context_snapshots (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES chat_threads(id),
      message_id TEXT NOT NULL REFERENCES chat_messages(id),
      snapshot TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents(service_id);
    CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
    CREATE INDEX IF NOT EXISTS idx_deployments_service ON deployments(service_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
    CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);
  `);
}

// ─── Query helpers ───

export function getAllOperators() {
  return getDb().prepare('SELECT * FROM operators ORDER BY name').all();
}

export function getOperator(id: string) {
  return getDb().prepare('SELECT * FROM operators WHERE id = ?').get(id);
}

export function getAllIncidents(filters?: { status?: string; severity?: string; serviceId?: string; environment?: string }) {
  let sql = 'SELECT * FROM incidents WHERE 1=1';
  const params: string[] = [];
  if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters?.severity) { sql += ' AND severity = ?'; params.push(filters.severity); }
  if (filters?.serviceId) { sql += ' AND service_id = ?'; params.push(filters.serviceId); }
  if (filters?.environment) { sql += ' AND environment = ?'; params.push(filters.environment); }
  sql += ' ORDER BY created_at DESC';
  return getDb().prepare(sql).all(...params);
}

export function getIncident(id: string) {
  return getDb().prepare('SELECT * FROM incidents WHERE id = ?').get(id);
}

export function getIncidentEvents(incidentId: string) {
  return getDb().prepare('SELECT * FROM incident_events WHERE incident_id = ? ORDER BY created_at DESC').all(incidentId);
}

export function getIncidentEvidence(incidentId: string) {
  return getDb().prepare('SELECT * FROM incident_evidence WHERE incident_id = ? ORDER BY created_at').all(incidentId);
}

export function getAllDeployments(filters?: { status?: string; serviceId?: string; environment?: string }) {
  let sql = 'SELECT * FROM deployments WHERE 1=1';
  const params: string[] = [];
  if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters?.serviceId) { sql += ' AND service_id = ?'; params.push(filters.serviceId); }
  if (filters?.environment) { sql += ' AND environment = ?'; params.push(filters.environment); }
  sql += ' ORDER BY CASE WHEN status IN (\'failed\',\'running\') THEN 0 ELSE 1 END, created_at DESC';
  return getDb().prepare(sql).all(...params);
}

export function getDeployment(id: string) {
  return getDb().prepare('SELECT * FROM deployments WHERE id = ?').get(id);
}

export function getDeploymentDiffs(deploymentId: string) {
  return getDb().prepare('SELECT * FROM deployment_diffs WHERE deployment_id = ?').all(deploymentId);
}

export function getDeploymentRiskChecks(deploymentId: string) {
  return getDb().prepare('SELECT * FROM deployment_risk_checks WHERE deployment_id = ?').all(deploymentId);
}

export function getRollbackPlan(deploymentId: string) {
  return getDb().prepare('SELECT * FROM rollback_plans WHERE deployment_id = ? ORDER BY created_at DESC LIMIT 1').get(deploymentId);
}

export function getRollbackSteps(rollbackPlanId: string) {
  return getDb().prepare('SELECT * FROM rollback_steps WHERE rollback_plan_id = ? ORDER BY step_order').all(rollbackPlanId);
}

export function getAllJobTemplates() {
  return getDb().prepare('SELECT * FROM job_templates ORDER BY name').all();
}

export function getAllJobRuns(filters?: { status?: string; serviceId?: string }) {
  let sql = 'SELECT * FROM job_runs WHERE 1=1';
  const params: string[] = [];
  if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters?.serviceId) { sql += ' AND service_id = ?'; params.push(filters.serviceId); }
  sql += ' ORDER BY created_at DESC';
  return getDb().prepare(sql).all(...params);
}

export function getJobRun(id: string) {
  return getDb().prepare('SELECT * FROM job_runs WHERE id = ?').get(id);
}

export function getJobRunEvents(jobRunId: string) {
  return getDb().prepare('SELECT * FROM job_run_events WHERE job_run_id = ? ORDER BY created_at').all(jobRunId);
}

export function getAllReports() {
  return getDb().prepare('SELECT * FROM reports ORDER BY created_at DESC').all();
}

export function getReport(id: string) {
  return getDb().prepare('SELECT * FROM reports WHERE id = ?').get(id);
}

export function getReportSections(reportId: string) {
  return getDb().prepare('SELECT * FROM report_sections WHERE report_id = ? ORDER BY section_order').all(reportId);
}

export function getReportActionItems(reportId: string) {
  return getDb().prepare('SELECT * FROM report_action_items WHERE report_id = ?').all(reportId);
}

export function getReportExports(reportId: string) {
  return getDb().prepare('SELECT * FROM report_exports WHERE report_id = ? ORDER BY exported_at DESC').all(reportId);
}

export function getAuditLogs(filters?: { targetType?: string; targetId?: string; actorId?: string; limit?: number }) {
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: (string | number)[] = [];
  if (filters?.targetType) { sql += ' AND target_type = ?'; params.push(filters.targetType); }
  if (filters?.targetId) { sql += ' AND target_id = ?'; params.push(filters.targetId); }
  if (filters?.actorId) { sql += ' AND actor_id = ?'; params.push(filters.actorId); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(filters?.limit ?? 50);
  return getDb().prepare(sql).all(...params);
}

export function getAllServices() {
  return getDb().prepare('SELECT * FROM services ORDER BY name').all();
}

export function getService(id: string) {
  return getDb().prepare('SELECT * FROM services WHERE id = ?').get(id);
}

export function countIncidents(status?: string) {
  if (status) return (getDb().prepare('SELECT COUNT(*) as count FROM incidents WHERE status = ?').get(status) as { count: number }).count;
  return (getDb().prepare('SELECT COUNT(*) as count FROM incidents').get() as { count: number }).count;
}

export function countAuditLogs() {
  return (getDb().prepare('SELECT COUNT(*) as count FROM audit_logs').get() as { count: number }).count;
}

export function resetDatabase() {
  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  db.exec('PRAGMA foreign_keys = OFF');
  for (const { name } of tables) {
    db.exec(`DELETE FROM ${name}`);
  }
  db.exec('PRAGMA foreign_keys = ON');
}
