import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import {
  DEFAULT_RUNTIME_SCENARIO_ID,
  SCENARIO_TEMPLATE_DEFAULTS,
  SEED_A2UI_TEMPLATES,
} from '@/server/ai/template-config';
import { loadAllScenarios } from '@/server/scenarios';

const DB_PATH = path.join(process.cwd(), 'data', 'ops-console.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
    ensureSystemSeed(_db);
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

    -- Runtime / A2UI template management
    CREATE TABLE IF NOT EXISTS app_runtime_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS a2ui_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      card_type TEXT NOT NULL,
      builder_key TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      prompt_hint TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS a2ui_template_rules (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES a2ui_templates(id),
      rule_type TEXT NOT NULL CHECK(rule_type IN ('keyword','prompt_hint','page','role')),
      rule_value TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS a2ui_template_decision_inputs (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES a2ui_templates(id),
      input_key TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      required INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL CHECK(source IN ('user','context','derived')),
      default_value TEXT,
      priority INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS a2ui_template_overrides (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES a2ui_templates(id),
      scope_type TEXT NOT NULL CHECK(scope_type IN ('global','scenario','page','role')),
      scope_value TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS a2ui_template_selection_logs (
      id TEXT PRIMARY KEY,
      template_id TEXT REFERENCES a2ui_templates(id),
      thread_id TEXT,
      page TEXT NOT NULL,
      scenario_id TEXT,
      operator_id TEXT,
      user_message TEXT NOT NULL DEFAULT '',
      selection_reason TEXT NOT NULL DEFAULT '',
      decision_payload TEXT,
      status TEXT NOT NULL CHECK(status IN ('selected','blocked','fallback')) DEFAULT 'selected',
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
    CREATE INDEX IF NOT EXISTS idx_a2ui_rules_template ON a2ui_template_rules(template_id);
    CREATE INDEX IF NOT EXISTS idx_a2ui_decision_inputs_template ON a2ui_template_decision_inputs(template_id);
    CREATE INDEX IF NOT EXISTS idx_a2ui_overrides_template ON a2ui_template_overrides(template_id);
    CREATE INDEX IF NOT EXISTS idx_a2ui_selection_logs_template ON a2ui_template_selection_logs(template_id);
  `);

  // Backward-compatible migration for existing DB files.
  try {
    db.prepare('SELECT decision_payload FROM a2ui_template_selection_logs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE a2ui_template_selection_logs ADD COLUMN decision_payload TEXT');
  }
}

function ensureSystemSeed(db: Database.Database) {
  db.prepare(
    `INSERT OR IGNORE INTO app_runtime_state (key, value, updated_at)
     VALUES ('current_scenario_id', ?, datetime('now'))`,
  ).run(DEFAULT_RUNTIME_SCENARIO_ID);

  const insertTemplate = db.prepare(
    `INSERT INTO a2ui_templates
      (id, name, description, card_type, builder_key, tool_name, category, prompt_hint, is_enabled, created_at, updated_at)
     VALUES
      (@id, @name, @description, @card_type, @builder_key, @tool_name, @category, @prompt_hint, @is_enabled, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      card_type = excluded.card_type,
      builder_key = excluded.builder_key,
      tool_name = excluded.tool_name,
      category = excluded.category,
      prompt_hint = excluded.prompt_hint
     WHERE
      a2ui_templates.name != excluded.name OR
      a2ui_templates.description != excluded.description OR
      a2ui_templates.card_type != excluded.card_type OR
      a2ui_templates.builder_key != excluded.builder_key OR
      a2ui_templates.tool_name != excluded.tool_name OR
      a2ui_templates.category != excluded.category OR
      a2ui_templates.prompt_hint != excluded.prompt_hint`,
  );

  const insertRule = db.prepare(
    `INSERT INTO a2ui_template_rules
      (id, template_id, rule_type, rule_value, priority, created_at)
     VALUES
      (@id, @template_id, @rule_type, @rule_value, @priority, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
      rule_value = excluded.rule_value,
      priority = excluded.priority`,
  );

  const insertOverride = db.prepare(
    `INSERT INTO a2ui_template_overrides
      (id, template_id, scope_type, scope_value, enabled, created_at, updated_at)
     VALUES
      (@id, @template_id, @scope_type, @scope_value, @enabled, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO NOTHING`,
  );

  const insertDecisionInput = db.prepare(
    `INSERT INTO a2ui_template_decision_inputs
      (id, template_id, input_key, label, description, required, source, default_value, priority, created_at)
     VALUES
      (@id, @template_id, @input_key, @label, @description, @required, @source, @default_value, @priority, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
      input_key = excluded.input_key,
      label = excluded.label,
      description = excluded.description,
      required = excluded.required,
      source = excluded.source,
      default_value = excluded.default_value,
      priority = excluded.priority`,
  );

  const transaction = db.transaction(() => {
    for (const template of SEED_A2UI_TEMPLATES) {
      insertTemplate.run({
        id: template.id,
        name: template.name,
        description: template.description,
        card_type: template.cardType,
        builder_key: template.builderKey,
        tool_name: template.toolName,
        category: template.category,
        prompt_hint: template.promptHint,
        is_enabled: template.isEnabledByDefault ? 1 : 0,
      });

      template.keywords.forEach((keyword, index) => {
        insertRule.run({
          id: `${template.id}_keyword_${index}`,
          template_id: template.id,
          rule_type: 'keyword',
          rule_value: keyword,
          priority: 40 + index,
        });
      });

      insertRule.run({
        id: `${template.id}_prompt_hint`,
        template_id: template.id,
        rule_type: 'prompt_hint',
        rule_value: template.promptHint,
        priority: 5,
      });

      template.allowedPages.forEach((page, index) => {
        insertRule.run({
          id: `${template.id}_page_${index}`,
          template_id: template.id,
          rule_type: 'page',
          rule_value: page,
          priority: 10 + index,
        });
      });

      template.allowedRoles?.forEach((role, index) => {
        insertRule.run({
          id: `${template.id}_role_${index}`,
          template_id: template.id,
          rule_type: 'role',
          rule_value: role,
          priority: 10 + index,
        });
      });

      template.decisionInputs?.forEach((inputDef, index) => {
        insertDecisionInput.run({
          id: `${template.id}_decision_input_${inputDef.key}`,
          template_id: template.id,
          input_key: inputDef.key,
          label: inputDef.label,
          description: inputDef.description,
          required: inputDef.required ? 1 : 0,
          source: inputDef.source,
          default_value: inputDef.defaultValue ?? null,
          priority: inputDef.priority ?? 100 + index,
        });
      });
    }

    for (const [scenarioId, defaults] of Object.entries(SCENARIO_TEMPLATE_DEFAULTS)) {
      defaults.forEach((override) => {
        insertOverride.run({
          id: `${override.templateId}_scenario_${scenarioId}`,
          template_id: override.templateId,
          scope_type: 'scenario',
          scope_value: scenarioId,
          enabled: override.enabled ? 1 : 0,
        });
      });
    }
  });

  transaction();

  const demoDataStats = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM deployments) as deployments,
        (SELECT COUNT(*) FROM incidents) as incidents,
        (SELECT COUNT(*) FROM job_runs) as job_runs,
        (SELECT COUNT(*) FROM reports) as reports`,
    )
    .get() as {
    deployments: number;
    incidents: number;
    job_runs: number;
    reports: number;
  };

  const hasDemoData =
    demoDataStats.deployments > 0 ||
    demoDataStats.incidents > 0 ||
    demoDataStats.job_runs > 0 ||
    demoDataStats.reports > 0;

  if (!hasDemoData) {
    loadAllScenarios(db);
  }
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

// ─── Runtime state helpers ───

export function getRuntimeState(key: string) {
  return getDb()
    .prepare('SELECT value, updated_at FROM app_runtime_state WHERE key = ?')
    .get(key) as { value: string; updated_at: string } | undefined;
}

export function setRuntimeState(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO app_runtime_state (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, value);
}

export function clearRuntimeState(key: string) {
  getDb().prepare('DELETE FROM app_runtime_state WHERE key = ?').run(key);
}

export function getCurrentScenarioId() {
  return getRuntimeState('current_scenario_id')?.value ?? DEFAULT_RUNTIME_SCENARIO_ID;
}

export function setCurrentScenarioId(scenarioId: string) {
  setRuntimeState('current_scenario_id', scenarioId);
}

interface PendingTemplateDecisionState {
  originalUserText: string;
  scenarioId: string;
  candidateTemplateIds: string[];
  createdAt: string;
}

function getPendingTemplateDecisionKey(operatorId: string, page: string) {
  return `pending_template_decision:${operatorId}:${page}`;
}

export function getPendingTemplateDecisionState(
  operatorId: string,
  page: string,
): PendingTemplateDecisionState | null {
  const record = getRuntimeState(getPendingTemplateDecisionKey(operatorId, page));
  if (!record?.value) {
    return null;
  }

  try {
    return JSON.parse(record.value) as PendingTemplateDecisionState;
  } catch {
    return null;
  }
}

export function setPendingTemplateDecisionState(
  operatorId: string,
  page: string,
  state: PendingTemplateDecisionState,
) {
  setRuntimeState(
    getPendingTemplateDecisionKey(operatorId, page),
    JSON.stringify(state),
  );
}

export function clearPendingTemplateDecisionState(
  operatorId: string,
  page: string,
) {
  clearRuntimeState(getPendingTemplateDecisionKey(operatorId, page));
}

// ─── A2UI template helpers ───

export function getAllA2UITemplates() {
  return getDb()
    .prepare('SELECT * FROM a2ui_templates ORDER BY category, name')
    .all() as Array<Record<string, unknown>>;
}

export function getA2UITemplate(id: string) {
  return getDb()
    .prepare('SELECT * FROM a2ui_templates WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
}

export function getA2UITemplateByToolName(toolName: string) {
  return getDb()
    .prepare('SELECT * FROM a2ui_templates WHERE tool_name = ?')
    .get(toolName) as Record<string, unknown> | undefined;
}

export function getA2UITemplateRules(templateId?: string) {
  if (templateId) {
    return getDb()
      .prepare('SELECT * FROM a2ui_template_rules WHERE template_id = ? ORDER BY priority ASC, id ASC')
      .all(templateId) as Array<Record<string, unknown>>;
  }

  return getDb()
    .prepare('SELECT * FROM a2ui_template_rules ORDER BY template_id ASC, priority ASC, id ASC')
    .all() as Array<Record<string, unknown>>;
}

export function getA2UITemplateOverrides(templateId?: string) {
  if (templateId) {
    return getDb()
      .prepare('SELECT * FROM a2ui_template_overrides WHERE template_id = ? ORDER BY scope_type ASC, scope_value ASC')
      .all(templateId) as Array<Record<string, unknown>>;
  }

  return getDb()
    .prepare('SELECT * FROM a2ui_template_overrides ORDER BY template_id ASC, scope_type ASC, scope_value ASC')
    .all() as Array<Record<string, unknown>>;
}

export function getA2UITemplateDecisionInputs(templateId?: string) {
  if (templateId) {
    return getDb()
      .prepare(
        'SELECT * FROM a2ui_template_decision_inputs WHERE template_id = ? ORDER BY priority ASC, id ASC',
      )
      .all(templateId) as Array<Record<string, unknown>>;
  }

  return getDb()
    .prepare(
      'SELECT * FROM a2ui_template_decision_inputs ORDER BY template_id ASC, priority ASC, id ASC',
    )
    .all() as Array<Record<string, unknown>>;
}

export function updateA2UITemplateEnabled(id: string, enabled: boolean) {
  getDb()
    .prepare("UPDATE a2ui_templates SET is_enabled = ?, updated_at = datetime('now') WHERE id = ?")
    .run(enabled ? 1 : 0, id);
  return getA2UITemplate(id);
}

export function upsertA2UITemplateOverride(
  templateId: string,
  scopeType: 'global' | 'scenario' | 'page' | 'role',
  scopeValue: string,
  enabled: boolean,
) {
  const id = `${templateId}_${scopeType}_${scopeValue}`;
  getDb()
    .prepare(
      `INSERT INTO a2ui_template_overrides (id, template_id, scope_type, scope_value, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, updated_at = datetime('now')`,
    )
    .run(id, templateId, scopeType, scopeValue, enabled ? 1 : 0);
}

export function clearA2UITemplateOverride(
  templateId: string,
  scopeType: 'global' | 'scenario' | 'page' | 'role',
  scopeValue: string,
) {
  getDb()
    .prepare('DELETE FROM a2ui_template_overrides WHERE template_id = ? AND scope_type = ? AND scope_value = ?')
    .run(templateId, scopeType, scopeValue);
}

export function updateA2UITemplatePromptHint(id: string, promptHint: string) {
  getDb()
    .prepare("UPDATE a2ui_templates SET prompt_hint = ?, updated_at = datetime('now') WHERE id = ?")
    .run(promptHint, id);
  return getA2UITemplate(id);
}

export function replaceA2UITemplateRulesByType(
  templateId: string,
  ruleType: 'keyword' | 'page' | 'role',
  values: string[],
) {
  const db = getDb();
  const deleteStmt = db.prepare(
    'DELETE FROM a2ui_template_rules WHERE template_id = ? AND rule_type = ?',
  );
  const insertStmt = db.prepare(
    `INSERT INTO a2ui_template_rules (id, template_id, rule_type, rule_value, priority, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  );

  db.transaction(() => {
    deleteStmt.run(templateId, ruleType);
    values.forEach((value, index) => {
      const id = `${templateId}_${ruleType}_${value.replace(/\s+/g, '_').toLowerCase()}`;
      insertStmt.run(id, templateId, ruleType, value, (index + 1) * 10);
    });
  })();
}

export function replaceA2UITemplateDecisionInputs(
  templateId: string,
  inputs: Array<{
    input_key: string;
    label: string;
    description: string;
    required: boolean;
    source: string;
    default_value: string | null;
    priority: number;
  }>,
) {
  const db = getDb();
  const deleteStmt = db.prepare(
    'DELETE FROM a2ui_template_decision_inputs WHERE template_id = ?',
  );
  const insertStmt = db.prepare(
    `INSERT INTO a2ui_template_decision_inputs
      (id, template_id, input_key, label, description, required, source, default_value, priority, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  );

  db.transaction(() => {
    deleteStmt.run(templateId);
    inputs.forEach((input) => {
      const id = `${templateId}_input_${input.input_key}`;
      insertStmt.run(
        id,
        templateId,
        input.input_key,
        input.label,
        input.description,
        input.required ? 1 : 0,
        input.source,
        input.default_value,
        input.priority,
      );
    });
  })();
}

export function logA2UITemplateSelection(input: {
  templateId?: string | null;
  threadId?: string | null;
  page: string;
  scenarioId?: string | null;
  operatorId?: string | null;
  userMessage?: string;
  selectionReason?: string;
  decisionPayload?: unknown;
  status: 'selected' | 'blocked' | 'fallback';
}) {
  getDb()
    .prepare(
      `INSERT INTO a2ui_template_selection_logs
        (id, template_id, thread_id, page, scenario_id, operator_id, user_message, selection_reason, decision_payload, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      crypto.randomUUID(),
      input.templateId ?? null,
      input.threadId ?? null,
      input.page,
      input.scenarioId ?? null,
      input.operatorId ?? null,
      input.userMessage ?? '',
      input.selectionReason ?? '',
      input.decisionPayload ? JSON.stringify(input.decisionPayload) : null,
      input.status,
    );
}

// ─── Chat helpers ───

export function getChatThread(operatorId: string, page: string) {
  return getDb()
    .prepare('SELECT * FROM chat_threads WHERE operator_id = ? AND page = ? ORDER BY updated_at DESC LIMIT 1')
    .get(operatorId, page) as { id: string; page: string; selected_entity_id: string | null; operator_id: string; created_at: string; updated_at: string } | undefined;
}

export function createChatThread(id: string, operatorId: string, page: string, selectedEntityId?: string) {
  getDb()
    .prepare('INSERT INTO chat_threads (id, operator_id, page, selected_entity_id) VALUES (?, ?, ?, ?)')
    .run(id, operatorId, page, selectedEntityId ?? null);
  return getDb().prepare('SELECT * FROM chat_threads WHERE id = ?').get(id);
}

export function getChatMessages(threadId: string) {
  return getDb()
    .prepare('SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC')
    .all(threadId);
}

export function saveChatMessage(id: string, threadId: string, role: string, content: string, toolName?: string, toolResult?: string) {
  getDb()
    .prepare('INSERT INTO chat_messages (id, thread_id, role, content, tool_name, tool_result) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, threadId, role, content, toolName ?? null, toolResult ?? null);
  return getDb().prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);
}

export function updateChatThreadTimestamp(threadId: string) {
  getDb()
    .prepare("UPDATE chat_threads SET updated_at = datetime('now') WHERE id = ?")
    .run(threadId);
}

export function resetDatabase() {
  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  db.exec('PRAGMA foreign_keys = OFF');
  for (const { name } of tables) {
    db.exec(`DELETE FROM ${name}`);
  }
  db.exec('PRAGMA foreign_keys = ON');
  ensureSystemSeed(db);
}
