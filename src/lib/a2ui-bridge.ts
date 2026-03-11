// A2UI Bridge — pure data/JSON generation, no React imports
// Returns { root, components, data } ready for <A2UIViewer />
//
// Component spec follows Google A2UI web_core schema:
//   StringValue:  { literal: 'text' } | { literalString: 'text' } | { path: '/data/path' }
//   Children:     { explicitList: ['id1', 'id2'] }
//   Button:       { child: 'textComponentId', action: { name, context: [{key, value}] } }
//   CheckBox:     { label: { literal: 'text' }, value: { path: '/path' } }
//   Tabs:         { tabItems: [{ title: { literalString: 'tab' }, child: 'contentId' }] }

export interface A2UIComponent {
  id: string;
  component: Record<string, unknown>;
}

export interface A2UICardDef {
  root: string;
  components: A2UIComponent[];
  data: Record<string, unknown>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function str(text: string) {
  return { literal: text };
}

function dataPath(path: string) {
  return { path };
}

function children(...ids: string[]) {
  return { explicitList: ids };
}

function mkText(id: string, text: string, usageHint?: string): A2UIComponent {
  const props: Record<string, unknown> = { text: str(text) };
  if (usageHint) props.usageHint = usageHint;
  return { id, component: { Text: props } };
}

function mkDataText(id: string, path: string, usageHint?: string): A2UIComponent {
  const props: Record<string, unknown> = { text: dataPath(path) };
  if (usageHint) props.usageHint = usageHint;
  return { id, component: { Text: props } };
}

function mkRow(id: string, childIds: string[], distribution?: string): A2UIComponent {
  const props: Record<string, unknown> = { children: children(...childIds) };
  if (distribution) props.distribution = distribution;
  return { id, component: { Row: props } };
}

function mkCol(id: string, childIds: string[], distribution?: string): A2UIComponent {
  const props: Record<string, unknown> = { children: children(...childIds) };
  if (distribution) props.distribution = distribution;
  return { id, component: { Column: props } };
}

function mkDivider(id: string): A2UIComponent {
  return { id, component: { Divider: {} } };
}

function mkCard(id: string, childId: string): A2UIComponent {
  return { id, component: { Card: { child: childId } } };
}

function mkIcon(id: string, name: string): A2UIComponent {
  return { id, component: { Icon: { name: str(name) } } };
}

function mkCheckBox(id: string, label: string, dataPathStr: string): A2UIComponent {
  return {
    id,
    component: {
      CheckBox: {
        label: str(label),
        value: { path: dataPathStr },
      },
    },
  };
}

function mkButton(
  id: string,
  labelTextId: string,
  actionName: string,
  context: Record<string, string>,
  primary?: boolean,
): A2UIComponent {
  const actionContext = Object.entries(context).map(([key, value]) => ({
    key,
    value: { literalString: value },
  }));
  const props: Record<string, unknown> = {
    child: labelTextId,
    action: { name: actionName, context: actionContext },
  };
  if (primary) props.primary = true;
  return { id, component: { Button: props } };
}

function mkList(id: string, childIds: string[], direction?: string): A2UIComponent {
  const props: Record<string, unknown> = { children: children(...childIds) };
  if (direction) props.direction = direction;
  return { id, component: { List: props } };
}

function mkTabs(id: string, tabs: Array<{ title: string; childId: string }>): A2UIComponent {
  return {
    id,
    component: {
      Tabs: {
        tabItems: tabs.map((tab) => ({
          title: { literalString: tab.title },
          child: tab.childId,
        })),
      },
    },
  };
}

// ─── Status helpers ─────────────────────────────────────────────────────────

function statusIcon(status: string): string {
  switch (status) {
    case 'pass': case 'completed': case 'succeeded': case 'done': case 'approved':
      return 'check_circle';
    case 'fail': case 'failed': case 'denied':
      return 'error';
    case 'warn': case 'warning':
      return 'warning';
    case 'running': case 'in_progress': case 'streaming':
      return 'hourglass_top';
    case 'pending': case 'draft': case 'open':
      return 'radio_button_unchecked';
    case 'investigating': case 'dry_run_ready': case 'dry_run_passed':
      return 'search';
    case 'mitigated': case 'resolved':
      return 'verified';
    default:
      return 'info';
  }
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pass: '통과', fail: '실패', warn: '경고',
    completed: '완료', running: '진행중', pending: '대기',
    failed: '실패', succeeded: '성공', done: '완료',
    approved: '승인됨', denied: '거부됨',
    draft: '초안', dry_run_ready: 'Dry-Run 준비', dry_run_passed: 'Dry-Run 통과',
    open: '열림', investigating: '조사중', mitigated: '완화됨', resolved: '해결됨', closed: '종료',
    rolled_back: '롤백됨',
    critical: '심각', high: '높음', medium: '보통', low: '낮음',
  };
  return labels[status] ?? status;
}

// ─── 1. Rollback Summary Card ──────────────────────────────────────────────

export function buildRollbackSummaryCard(
  deployment: Record<string, unknown>,
  riskChecks: Array<Record<string, unknown>>,
  rollbackPlan: Record<string, unknown> | null,
): A2UICardDef {
  const deploymentId = String(deployment['id'] ?? '');
  const planId = String(rollbackPlan?.['id'] ?? '');
  const planStatus = rollbackPlan?.['status'] as string | undefined;

  // ── Tab 1: 배포 정보 ──
  const deployInfoComponents: A2UIComponent[] = [
    mkText('dep_title', '배포 정보', 'h3'),
    mkDivider('dep_div_1'),
    // Version row
    mkIcon('dep_ver_icon', 'tag'),
    mkText('dep_ver_label', '버전'),
    mkDataText('dep_ver_val', '/deployment/version'),
    mkRow('dep_ver_row', ['dep_ver_icon', 'dep_ver_label', 'dep_ver_val'], 'spaceBetween'),
    // Service row
    mkIcon('dep_svc_icon', 'dns'),
    mkText('dep_svc_label', '서비스'),
    mkDataText('dep_svc_val', '/deployment/service_id'),
    mkRow('dep_svc_row', ['dep_svc_icon', 'dep_svc_label', 'dep_svc_val'], 'spaceBetween'),
    // Status row
    mkIcon('dep_st_icon', statusIcon(String(deployment['status'] ?? ''))),
    mkText('dep_st_label', '상태'),
    mkDataText('dep_st_val', '/deployment/status'),
    mkRow('dep_st_row', ['dep_st_icon', 'dep_st_label', 'dep_st_val'], 'spaceBetween'),
    // Environment row
    mkIcon('dep_env_icon', 'cloud'),
    mkText('dep_env_label', '환경'),
    mkDataText('dep_env_val', '/deployment/environment'),
    mkRow('dep_env_row', ['dep_env_icon', 'dep_env_label', 'dep_env_val'], 'spaceBetween'),
    // Rollout row
    mkIcon('dep_ro_icon', 'speed'),
    mkText('dep_ro_label', '롤아웃'),
    mkDataText('dep_ro_val', '/deployment/rollout_percent'),
    mkRow('dep_ro_row', ['dep_ro_icon', 'dep_ro_label', 'dep_ro_val'], 'spaceBetween'),
    // Column
    mkCol('dep_info_col', [
      'dep_title', 'dep_div_1',
      'dep_ver_row', 'dep_svc_row', 'dep_st_row', 'dep_env_row', 'dep_ro_row',
    ]),
  ];

  // ── Tab 2: 리스크 체크 ──
  const riskComponents: A2UIComponent[] = [
    mkText('risk_title', `위험 체크 결과 (${riskChecks.length}개)`, 'h3'),
    mkDivider('risk_div_1'),
  ];
  const riskRowIds: string[] = [];
  const riskCheckData: Record<string, boolean> = {};

  riskChecks.forEach((check, i) => {
    const status = check['status'] as string;
    const checkName = String(check['check_name'] ?? `체크 ${i + 1}`);
    const detail = String(check['detail'] ?? '');
    const iconId = `risk_icon_${i}`;
    const nameId = `risk_name_${i}`;
    const detailId = `risk_detail_${i}`;
    const statusId = `risk_status_${i}`;
    const infoColId = `risk_info_${i}`;
    const rowId = `risk_row_${i}`;

    riskComponents.push(
      mkIcon(iconId, statusIcon(status)),
      mkText(nameId, checkName, 'h4'),
      mkText(detailId, detail || '-', 'caption'),
      mkCol(infoColId, [nameId, detailId]),
      mkText(statusId, `[${statusLabel(status).toUpperCase()}]`),
      mkRow(rowId, [iconId, infoColId, statusId], 'spaceBetween'),
    );
    riskRowIds.push(rowId);
    riskCheckData[`/riskChecks/${i}/passed`] = status === 'pass';
  });

  // Summary line
  const passCount = riskChecks.filter((c) => c['status'] === 'pass').length;
  const warnCount = riskChecks.filter((c) => c['status'] === 'warn').length;
  const failCount = riskChecks.filter((c) => c['status'] === 'fail').length;
  const summaryText = `통과 ${passCount} / 경고 ${warnCount} / 실패 ${failCount}`;
  riskComponents.push(
    mkDivider('risk_div_2'),
    mkText('risk_summary', summaryText, 'caption'),
  );

  riskComponents.push(
    mkCol('risk_col', ['risk_title', 'risk_div_1', ...riskRowIds, 'risk_div_2', 'risk_summary']),
  );

  // ── Tab 3: 롤백 계획 ──
  const planComponents: A2UIComponent[] = [
    mkText('plan_title', '롤백 계획', 'h3'),
    mkDivider('plan_div_1'),
    // Plan status
    mkIcon('plan_st_icon', statusIcon(planStatus ?? 'draft')),
    mkText('plan_st_label', '계획 상태'),
    mkText('plan_st_val', statusLabel(planStatus ?? '없음')),
    mkRow('plan_st_row', ['plan_st_icon', 'plan_st_label', 'plan_st_val'], 'spaceBetween'),
    // Target version
    mkIcon('plan_tv_icon', 'history'),
    mkText('plan_tv_label', '복구 대상 버전'),
    mkDataText('plan_tv_val', '/plan/target_version'),
    mkRow('plan_tv_row', ['plan_tv_icon', 'plan_tv_label', 'plan_tv_val'], 'spaceBetween'),
  ];

  // Action buttons
  const actionChildIds: string[] = [];

  if (!planStatus || planStatus === 'draft') {
    planComponents.push(
      mkText('btn_dr_text', 'Dry-Run 실행'),
      mkButton('btn_dryrun', 'btn_dr_text', 'execute_dry_run', { deploymentId, planId }, false),
    );
    actionChildIds.push('btn_dryrun');
  }

  if (planStatus === 'dry_run_passed' || planStatus === 'dry_run_ready') {
    planComponents.push(
      mkText('btn_appr_text', '승인 요청'),
      mkButton('btn_approve', 'btn_appr_text', 'request_approval', { deploymentId, planId }, false),
    );
    actionChildIds.push('btn_approve');
  }

  if (planStatus === 'approved') {
    planComponents.push(
      mkText('btn_exec_text', '롤백 실행'),
      mkButton('btn_rollback', 'btn_exec_text', 'execute_rollback', { deploymentId, planId }, true),
    );
    actionChildIds.push('btn_rollback');
  }

  if (actionChildIds.length === 0) {
    planComponents.push(
      mkText('btn_dr_text', 'Dry-Run 실행'),
      mkButton('btn_dryrun', 'btn_dr_text', 'execute_dry_run', { deploymentId, planId }, false),
    );
    actionChildIds.push('btn_dryrun');
  }

  planComponents.push(
    mkDivider('plan_div_2'),
    mkRow('plan_btn_row', actionChildIds, 'end'),
    mkCol('plan_col', ['plan_title', 'plan_div_1', 'plan_st_row', 'plan_tv_row', 'plan_div_2', 'plan_btn_row']),
  );

  // ── Root with Tabs ──
  const components: A2UIComponent[] = [
    mkText('card_title', '롤백 판단 요약', 'h2'),
    mkDivider('card_div_top'),
    ...deployInfoComponents,
    ...riskComponents,
    ...planComponents,
    mkTabs('main_tabs', [
      { title: '배포 정보', childId: 'dep_info_col' },
      { title: `리스크 (${riskChecks.length})`, childId: 'risk_col' },
      { title: '롤백 계획', childId: 'plan_col' },
    ]),
    mkCol('main_col', ['card_title', 'card_div_top', 'main_tabs']),
    mkCard('root_card', 'main_col'),
  ];

  return {
    root: 'root_card',
    components,
    data: {
      deployment: {
        id: deployment['id'],
        version: String(deployment['version'] ?? 'N/A'),
        service_id: String(deployment['service_id'] ?? 'N/A'),
        status: String(deployment['status'] ?? 'N/A'),
        environment: String(deployment['environment'] ?? 'N/A'),
        rollout_percent: `${deployment['rollout_percent'] ?? 0}%`,
      },
      plan: {
        id: rollbackPlan?.['id'] ?? null,
        status: planStatus ?? '없음',
        target_version: String(
          rollbackPlan?.['target_version'] ?? deployment['previous_version'] ?? 'N/A',
        ),
      },
      ...riskCheckData,
    },
  };
}

// ─── 2. Evidence Comparison Card ────────────────────────────────────────────

export function buildEvidenceComparisonCard(
  incident: Record<string, unknown>,
  evidence: Array<Record<string, unknown>>,
): A2UICardDef {
  // Group evidence by type
  const byType: Record<string, Array<Record<string, unknown>>> = {};
  for (const ev of evidence) {
    const type = String(ev['type'] ?? 'other');
    if (!byType[type]) byType[type] = [];
    byType[type].push(ev);
  }

  const typeLabels: Record<string, string> = {
    error_rate: '에러율',
    log_sample: '로그',
    metric_chart: '메트릭',
    trace: '트레이스',
    config_diff: '설정 변경',
    other: '기타',
  };

  // ── Incident summary (always visible) ──
  const incidentComponents: A2UIComponent[] = [
    mkText('inc_title', '증거 비교 분석', 'h2'),
    mkDivider('inc_div_top'),
    // Severity
    mkIcon('inc_sev_icon', statusIcon(String(incident['severity'] ?? ''))),
    mkText('inc_sev_label', '심각도'),
    mkDataText('inc_sev_val', '/incident/severity'),
    mkRow('inc_sev_row', ['inc_sev_icon', 'inc_sev_label', 'inc_sev_val'], 'spaceBetween'),
    // Status
    mkIcon('inc_st_icon', statusIcon(String(incident['status'] ?? ''))),
    mkText('inc_st_label', '상태'),
    mkDataText('inc_st_val', '/incident/status'),
    mkRow('inc_st_row', ['inc_st_icon', 'inc_st_label', 'inc_st_val'], 'spaceBetween'),
    // Service
    mkIcon('inc_svc_icon', 'dns'),
    mkText('inc_svc_label', '서비스'),
    mkDataText('inc_svc_val', '/incident/service_id'),
    mkRow('inc_svc_row', ['inc_svc_icon', 'inc_svc_label', 'inc_svc_val'], 'spaceBetween'),
    // Summary count
    mkText('inc_ev_count', `총 ${evidence.length}개 증거 수집됨`, 'caption'),
    mkDivider('inc_div_bottom'),
    mkCol('inc_summary_col', [
      'inc_sev_row', 'inc_st_row', 'inc_svc_row', 'inc_ev_count',
    ]),
  ];

  // ── Evidence tabs by type ──
  const tabDefs: Array<{ title: string; childId: string }> = [];
  const evidenceComponents: A2UIComponent[] = [];

  // "전체" tab
  const allEvidenceRowIds: string[] = [];
  evidence.forEach((ev, i) => {
    const type = String(ev['type'] ?? 'other');
    const title = String(ev['title'] ?? '제목 없음');
    const iconId = `ev_all_icon_${i}`;
    const typeId = `ev_all_type_${i}`;
    const titleId = `ev_all_title_${i}`;
    const infoId = `ev_all_info_${i}`;
    const rowId = `ev_all_row_${i}`;

    evidenceComponents.push(
      mkIcon(iconId, statusIcon(type === 'error_rate' ? 'fail' : type === 'config_diff' ? 'warn' : 'pass')),
      mkText(typeId, `[${typeLabels[type] ?? type}]`, 'caption'),
      mkText(titleId, title),
      mkCol(infoId, [titleId, typeId]),
      mkRow(rowId, [iconId, infoId], 'start'),
    );
    allEvidenceRowIds.push(rowId);
  });

  if (allEvidenceRowIds.length > 0) {
    evidenceComponents.push(
      mkList('ev_all_list', allEvidenceRowIds),
    );
    tabDefs.push({ title: `전체 (${evidence.length})`, childId: 'ev_all_list' });
  }

  // Per-type tabs
  Object.entries(byType).forEach(([type, items]) => {
    const typeKey = type.replace(/[^a-z0-9_]/g, '_');
    const itemRowIds: string[] = [];

    items.forEach((ev, i) => {
      const title = String(ev['title'] ?? '제목 없음');
      const iconId = `ev_${typeKey}_icon_${i}`;
      const titleId = `ev_${typeKey}_title_${i}`;
      const rowId = `ev_${typeKey}_row_${i}`;

      // Try to extract key info from content
      let detail = '';
      try {
        const content = typeof ev['content'] === 'string' ? JSON.parse(ev['content']) : ev['content'];
        if (content && typeof content === 'object') {
          // Show first few key-value pairs
          const entries = Object.entries(content as Record<string, unknown>).slice(0, 3);
          detail = entries.map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join(' | ');
        }
      } catch {
        // Ignore parse errors
      }

      const detailId = `ev_${typeKey}_detail_${i}`;
      const infoId = `ev_${typeKey}_info_${i}`;

      evidenceComponents.push(
        mkIcon(iconId, statusIcon(type === 'error_rate' ? 'fail' : type === 'config_diff' ? 'warn' : 'pass')),
        mkText(titleId, title),
        mkText(detailId, detail || '-', 'caption'),
        mkCol(infoId, [titleId, detailId]),
        mkRow(rowId, [iconId, infoId], 'start'),
      );
      itemRowIds.push(rowId);
    });

    const listId = `ev_${typeKey}_list`;
    evidenceComponents.push(mkList(listId, itemRowIds));
    tabDefs.push({
      title: `${typeLabels[type] ?? type} (${items.length})`,
      childId: listId,
    });
  });

  // Tabs
  evidenceComponents.push(
    mkTabs('ev_tabs', tabDefs),
  );

  // Key findings
  const keyFindings = evidence
    .filter((ev) => ev['type'] === 'error_rate' || ev['type'] === 'config_diff')
    .slice(0, 3)
    .map((ev) => String(ev['title'] ?? ''))
    .filter(Boolean);

  const findingsComponents: A2UIComponent[] = [];
  if (keyFindings.length > 0) {
    findingsComponents.push(
      mkDivider('findings_div'),
      mkIcon('findings_icon', 'lightbulb'),
      mkText('findings_label', '주요 발견', 'h4'),
      mkRow('findings_header', ['findings_icon', 'findings_label'], 'start'),
    );
    const findingRowIds: string[] = [];
    keyFindings.forEach((finding, i) => {
      const id = `finding_${i}`;
      findingsComponents.push(mkText(id, `• ${finding}`, 'body'));
      findingRowIds.push(id);
    });
    findingsComponents.push(mkCol('findings_col', ['findings_header', ...findingRowIds]));
  }

  const mainColChildren = [
    'inc_title', 'inc_div_top', 'inc_summary_col', 'inc_div_bottom', 'ev_tabs',
    ...(keyFindings.length > 0 ? ['findings_div', 'findings_col'] : []),
  ];

  const components: A2UIComponent[] = [
    ...incidentComponents,
    ...evidenceComponents,
    ...findingsComponents,
    mkCol('main_col', mainColChildren),
    mkCard('root_card', 'main_col'),
  ];

  return {
    root: 'root_card',
    components,
    data: {
      incident: {
        id: String(incident['id'] ?? ''),
        severity: statusLabel(String(incident['severity'] ?? '')),
        status: statusLabel(String(incident['status'] ?? '')),
        service_id: String(incident['service_id'] ?? ''),
      },
    },
  };
}

// ─── 3. Dry-Run Stepper Card ────────────────────────────────────────────────

export function buildDryRunStepperCard(
  rollbackPlan: Record<string, unknown>,
  steps: Array<Record<string, unknown>>,
): A2UICardDef {
  const planId = String(rollbackPlan['id'] ?? '');
  const deploymentId = String(rollbackPlan['deployment_id'] ?? '');
  const currentStepOrder = steps.find((s) => s['status'] === 'pending')?.['step_order'] as number | undefined;

  // Completed count
  const completedCount = steps.filter((s) => s['status'] === 'completed').length;
  const totalSteps = steps.length;
  const progressText = `${completedCount} / ${totalSteps} 단계 완료`;

  // Header
  const headerComponents: A2UIComponent[] = [
    mkText('stepper_title', 'Dry-Run 단계별 확인', 'h2'),
    mkDivider('stepper_div_top'),
    mkIcon('stepper_progress_icon', completedCount === totalSteps ? 'check_circle' : 'hourglass_top'),
    mkText('stepper_progress_text', progressText),
    mkRow('stepper_progress_row', ['stepper_progress_icon', 'stepper_progress_text'], 'start'),
    mkText('stepper_plan_id', `계획: ${planId}`, 'caption'),
    mkDivider('stepper_div_1'),
  ];

  // Step rows
  const stepComponents: A2UIComponent[] = [];
  const stepRowIds: string[] = [];

  steps.forEach((step, i) => {
    const status = String(step['status'] ?? 'pending');
    const action = String(step['action'] ?? step['description'] ?? `단계 ${i + 1}`);
    const isCurrentStep = step['step_order'] === currentStepOrder;
    const stepNum = String(step['step_order'] ?? i + 1);

    const numId = `step_num_${i}`;
    const iconId = `step_icon_${i}`;
    const actionId = `step_action_${i}`;
    const statusLabelId = `step_status_${i}`;
    const infoId = `step_info_${i}`;
    const rowId = `step_row_${i}`;

    stepComponents.push(
      mkText(numId, isCurrentStep ? `▸ ${stepNum}` : stepNum, isCurrentStep ? 'h4' : 'body'),
      mkIcon(iconId, statusIcon(status)),
      mkText(actionId, action),
      mkText(statusLabelId, statusLabel(status), 'caption'),
      mkCol(infoId, [actionId, statusLabelId]),
      mkRow(rowId, [numId, iconId, infoId], 'start'),
    );
    stepRowIds.push(rowId);
  });

  stepComponents.push(mkList('step_list', stepRowIds));

  // Action buttons
  const buttonComponents: A2UIComponent[] = [];
  const buttonIds: string[] = [];

  const allCompleted = completedCount === totalSteps;
  const hasPending = steps.some((s) => s['status'] === 'pending');

  if (hasPending) {
    buttonComponents.push(
      mkText('btn_next_text', '다음 단계 실행'),
      mkButton('btn_next', 'btn_next_text', 'dry_run_next_step', { planId, deploymentId }),
    );
    buttonIds.push('btn_next');
  }

  if (allCompleted) {
    buttonComponents.push(
      mkText('btn_confirm_text', 'Dry-Run 완료 확인'),
      mkButton('btn_confirm', 'btn_confirm_text', 'dry_run_confirm', { planId, deploymentId }, true),
    );
    buttonIds.push('btn_confirm');
  }

  buttonComponents.push(
    mkDivider('stepper_div_bottom'),
    mkRow('stepper_btn_row', buttonIds, 'end'),
  );

  const mainChildren = [
    'stepper_title', 'stepper_div_top',
    'stepper_progress_row', 'stepper_plan_id', 'stepper_div_1',
    'step_list',
    'stepper_div_bottom', 'stepper_btn_row',
  ];

  const components: A2UIComponent[] = [
    ...headerComponents,
    ...stepComponents,
    ...buttonComponents,
    mkCol('main_col', mainChildren),
    mkCard('root_card', 'main_col'),
  ];

  return {
    root: 'root_card',
    components,
    data: {
      plan: {
        id: rollbackPlan['id'],
        status: String(rollbackPlan['status'] ?? ''),
        deployment_id: rollbackPlan['deployment_id'],
      },
    },
  };
}

// ─── 4. Confirm Action Card (NEW) ───────────────────────────────────────────

export function buildConfirmActionCard(
  actionType: 'rollback' | 'job_execute' | 'incident_close',
  entity: Record<string, unknown>,
  checks: Array<{ label: string; required: boolean }>,
  context: Record<string, string>,
): A2UICardDef {
  const actionLabels: Record<string, string> = {
    rollback: '롤백 실행 확인',
    job_execute: 'Job 실행 확인',
    incident_close: '인시던트 종료 확인',
  };

  const actionDescriptions: Record<string, string> = {
    rollback: '이 작업은 프로덕션 서비스를 이전 버전으로 되돌립니다. 실행 전 모든 항목을 확인하세요.',
    job_execute: '이 작업은 프로덕션 환경에서 배치 Job을 실행합니다. 실행 전 모든 항목을 확인하세요.',
    incident_close: '인시던트를 종료합니다. 모든 후속 조치가 완료되었는지 확인하세요.',
  };

  const actionNames: Record<string, string> = {
    rollback: 'confirm_rollback',
    job_execute: 'confirm_job_execute',
    incident_close: 'confirm_incident_close',
  };

  // Header
  const headerComponents: A2UIComponent[] = [
    mkIcon('confirm_warn_icon', 'warning'),
    mkText('confirm_title', actionLabels[actionType] ?? '실행 확인', 'h2'),
    mkRow('confirm_header', ['confirm_warn_icon', 'confirm_title'], 'start'),
    mkDivider('confirm_div_top'),
    mkText('confirm_desc', actionDescriptions[actionType] ?? '', 'body'),
    mkDivider('confirm_div_1'),
  ];

  // Entity info
  const entityComponents: A2UIComponent[] = [
    mkText('entity_title', '대상 정보', 'h3'),
  ];
  const entityRowIds: string[] = ['entity_title'];
  const entityData: Record<string, string> = {};

  Object.entries(entity).slice(0, 6).forEach(([key, val], i) => {
    const labelId = `entity_label_${i}`;
    const valId = `entity_val_${i}`;
    const rowId = `entity_row_${i}`;
    const displayKey = key.replace(/_/g, ' ');
    entityComponents.push(
      mkText(labelId, displayKey),
      mkDataText(valId, `/entity/${key}`),
      mkRow(rowId, [labelId, valId], 'spaceBetween'),
    );
    entityRowIds.push(rowId);
    entityData[key] = String(val ?? '');
  });

  entityComponents.push(mkCol('entity_col', entityRowIds));

  // Checklist with CheckBoxes
  const checklistComponents: A2UIComponent[] = [
    mkDivider('check_div'),
    mkText('check_title', '실행 전 확인 사항', 'h3'),
  ];
  const checklistData: Record<string, boolean> = {};
  const checkIds: string[] = ['check_title'];

  checks.forEach((check, i) => {
    const cbId = `check_cb_${i}`;
    const dataKey = `/checks/${i}`;
    checklistComponents.push(
      mkCheckBox(cbId, `${check.required ? '(필수) ' : ''}${check.label}`, dataKey),
    );
    checkIds.push(cbId);
    checklistData[dataKey] = false;
  });

  checklistComponents.push(mkCol('check_col', checkIds));

  // Action buttons
  const buttonComponents: A2UIComponent[] = [
    mkDivider('confirm_div_bottom'),
    mkText('btn_cancel_text', '취소'),
    mkButton('btn_cancel', 'btn_cancel_text', 'cancel_action', context),
    mkText('btn_confirm_text', '확인 및 실행'),
    mkButton('btn_confirm', 'btn_confirm_text', actionNames[actionType] ?? 'confirm_action', context, true),
    mkRow('confirm_btn_row', ['btn_cancel', 'btn_confirm'], 'end'),
  ];

  const mainChildren = [
    'confirm_header', 'confirm_div_top', 'confirm_desc', 'confirm_div_1',
    'entity_col', 'check_div', 'check_col',
    'confirm_div_bottom', 'confirm_btn_row',
  ];

  const components: A2UIComponent[] = [
    ...headerComponents,
    ...entityComponents,
    ...checklistComponents,
    ...buttonComponents,
    mkCol('main_col', mainChildren),
    mkCard('root_card', 'main_col'),
  ];

  return {
    root: 'root_card',
    components,
    data: {
      entity: entityData,
      ...checklistData,
    },
  };
}

// ─── 5. Job Spec Review Card ────────────────────────────────────────────────

export function buildJobSpecReviewCard(
  jobRun: Record<string, unknown>,
  template: Record<string, unknown> | null,
  dryRunResult: Record<string, unknown> | null,
): A2UICardDef {
  const spec = jobRun['specParsed'] as Record<string, unknown> | null;
  const specParams = spec ? Object.entries(spec).slice(0, 8) : [];
  const jobRunId = String(jobRun['id'] ?? '');
  const jobStatus = String(jobRun['status'] ?? 'draft');

  // ── Tab 1: Job 정보 ──
  const infoComponents: A2UIComponent[] = [
    mkText('job_info_title', 'Job 정보', 'h3'),
    mkDivider('job_info_div'),
    // Template
    mkIcon('job_tmpl_icon', 'description'),
    mkText('job_tmpl_label', '템플릿'),
    mkText('job_tmpl_val', template ? String(template['name'] ?? '알 수 없음') : '알 수 없음'),
    mkRow('job_tmpl_row', ['job_tmpl_icon', 'job_tmpl_label', 'job_tmpl_val'], 'spaceBetween'),
    // Type
    mkIcon('job_type_icon', 'category'),
    mkText('job_type_label', '유형'),
    mkText('job_type_val', template ? String(template['type'] ?? template['job_type'] ?? '알 수 없음') : '알 수 없음'),
    mkRow('job_type_row', ['job_type_icon', 'job_type_label', 'job_type_val'], 'spaceBetween'),
    // Status
    mkIcon('job_st_icon', statusIcon(jobStatus)),
    mkText('job_st_label', '상태'),
    mkText('job_st_val', statusLabel(jobStatus)),
    mkRow('job_st_row', ['job_st_icon', 'job_st_label', 'job_st_val'], 'spaceBetween'),
    // Progress
    mkIcon('job_prog_icon', 'speed'),
    mkText('job_prog_label', '진행률'),
    mkDataText('job_prog_val', '/jobRun/progress'),
    mkRow('job_prog_row', ['job_prog_icon', 'job_prog_label', 'job_prog_val'], 'spaceBetween'),
    // Column
    mkCol('job_info_col', [
      'job_info_title', 'job_info_div',
      'job_tmpl_row', 'job_type_row', 'job_st_row', 'job_prog_row',
    ]),
  ];

  // ── Tab 2: Spec 파라미터 ──
  const specComponents: A2UIComponent[] = [
    mkText('spec_title', 'Spec 파라미터', 'h3'),
    mkDivider('spec_div'),
  ];
  const specRowIds: string[] = ['spec_title', 'spec_div'];

  specParams.forEach(([key, val], i) => {
    const keyId = `spec_key_${i}`;
    const valId = `spec_val_${i}`;
    const rowId = `spec_row_${i}`;
    specComponents.push(
      mkText(keyId, key, 'caption'),
      mkText(valId, String(val ?? '')),
      mkRow(rowId, [keyId, valId], 'spaceBetween'),
    );
    specRowIds.push(rowId);
  });

  if (specParams.length === 0) {
    specComponents.push(mkText('spec_empty', '파라미터 없음', 'caption'));
    specRowIds.push('spec_empty');
  }

  specComponents.push(mkCol('spec_col', specRowIds));

  // ── Tab 3: Dry-Run 결과 (conditional) ──
  const dryRunComponents: A2UIComponent[] = [];
  let hasDryRunTab = false;

  if (dryRunResult) {
    hasDryRunTab = true;
    dryRunComponents.push(
      mkText('dryrun_title', 'Dry-Run 결과', 'h3'),
      mkDivider('dryrun_div'),
    );
    const dryRunRowIds: string[] = ['dryrun_title', 'dryrun_div'];

    // Display dry-run result entries
    const dryRunEntries = Object.entries(dryRunResult).slice(0, 10);
    dryRunEntries.forEach(([key, val], i) => {
      const keyId = `dr_key_${i}`;
      const valId = `dr_val_${i}`;
      const rowId = `dr_row_${i}`;
      const displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
      dryRunComponents.push(
        mkText(keyId, key.replace(/_/g, ' ')),
        mkText(valId, displayVal.length > 60 ? displayVal.slice(0, 60) + '...' : displayVal, 'caption'),
        mkRow(rowId, [keyId, valId], 'spaceBetween'),
      );
      dryRunRowIds.push(rowId);
    });

    if (dryRunEntries.length === 0) {
      dryRunComponents.push(mkText('dr_empty', '결과 없음', 'caption'));
      dryRunRowIds.push('dr_empty');
    }

    dryRunComponents.push(mkCol('dryrun_col', dryRunRowIds));
  }

  // ── Tabs ──
  const tabDefs: Array<{ title: string; childId: string }> = [
    { title: 'Job 정보', childId: 'job_info_col' },
    { title: '파라미터', childId: 'spec_col' },
  ];
  if (hasDryRunTab) {
    tabDefs.push({ title: 'Dry-Run', childId: 'dryrun_col' });
  }

  // ── Action buttons ──
  const buttonComponents: A2UIComponent[] = [];
  const buttonIds: string[] = [];

  if (jobStatus === 'draft' || jobStatus === 'dry_run_ready') {
    buttonComponents.push(
      mkText('btn_dr_text', 'Dry-Run 실행'),
      mkButton('btn_dryrun', 'btn_dr_text', 'execute_job_dryrun', { jobRunId }),
    );
    buttonIds.push('btn_dryrun');
  }

  if (jobStatus === 'dry_run_ready' || (dryRunResult && jobStatus !== 'running' && jobStatus !== 'done')) {
    buttonComponents.push(
      mkText('btn_appr_text', '승인'),
      mkButton('btn_approve', 'btn_appr_text', 'approve_job', { jobRunId }),
    );
    buttonIds.push('btn_approve');
  }

  if (jobStatus === 'approved') {
    buttonComponents.push(
      mkText('btn_exec_text', '실행'),
      mkButton('btn_execute', 'btn_exec_text', 'execute_job', { jobRunId }, true),
    );
    buttonIds.push('btn_execute');
  }

  if (buttonIds.length === 0 && jobStatus !== 'running' && jobStatus !== 'done' && jobStatus !== 'failed') {
    buttonComponents.push(
      mkText('btn_dr_text', 'Dry-Run 실행'),
      mkButton('btn_dryrun', 'btn_dr_text', 'execute_job_dryrun', { jobRunId }),
    );
    buttonIds.push('btn_dryrun');
  }

  const mainChildren = [
    'card_title', 'card_div_top',
    'main_tabs',
    ...(buttonIds.length > 0 ? ['btn_div', 'btn_row'] : []),
  ];

  const components: A2UIComponent[] = [
    mkText('card_title', 'Job Spec 검토', 'h2'),
    mkDivider('card_div_top'),
    ...infoComponents,
    ...specComponents,
    ...dryRunComponents,
    mkTabs('main_tabs', tabDefs),
    ...buttonComponents,
    ...(buttonIds.length > 0 ? [
      mkDivider('btn_div'),
      mkRow('btn_row', buttonIds, 'end'),
    ] : []),
    mkCol('main_col', mainChildren),
    mkCard('root_card', 'main_col'),
  ];

  return {
    root: 'root_card',
    components,
    data: {
      jobRun: {
        id: jobRun['id'],
        status: jobStatus,
        progress: `${jobRun['progress'] ?? 0}%`,
      },
    },
  };
}

// ─── 6. Report Template Card ────────────────────────────────────────────────

const REPORT_SECTIONS: Record<string, Array<{ title: string; description: string }>> = {
  incident_postmortem: [
    { title: '1. 인시던트 요약', description: '장애 개요, 영향 범위, 지속 시간' },
    { title: '2. 타임라인', description: '발생 → 감지 → 대응 → 해결 시간순 기록' },
    { title: '3. 근본 원인 분석', description: '장애의 직접적 원인과 기여 요인' },
    { title: '4. 영향 범위', description: '영향받은 서비스, 사용자 수, 비즈니스 영향' },
    { title: '5. 대응 조치', description: '취한 조치, 의사결정 과정, 커뮤니케이션' },
    { title: '6. 재발 방지 계획', description: '단기/장기 개선 항목, 담당자, 일정' },
  ],
  deployment_review: [
    { title: '1. 배포 개요', description: '배포 버전, 대상 서비스, 환경' },
    { title: '2. 변경 사항 요약', description: '주요 코드 변경, 설정 변경' },
    { title: '3. 위험 체크 결과', description: '자동/수동 위험 체크 결과' },
    { title: '4. 롤백 계획', description: '롤백 절차, 판단 기준' },
    { title: '5. 결론 및 권고 사항', description: '배포 결과, 후속 조치' },
  ],
  weekly_ops: [
    { title: '1. 이번 주 인시던트 현황', description: '발생/해결 인시던트 통계' },
    { title: '2. 배포 현황', description: '배포 횟수, 성공률, 주요 변경' },
    { title: '3. 주요 지표 변화', description: '가용성, 에러율, 응답시간 변화' },
    { title: '4. 다음 주 주요 작업', description: '예정된 배포, 유지보수, 작업' },
  ],
  handover: [
    { title: '1. 현재 상태', description: '활성 인시던트, 진행 중인 작업' },
    { title: '2. 주의 사항', description: '주시해야 할 지표, 잠재 위험' },
    { title: '3. 대기 중인 승인', description: '승인 대기 중인 롤백, Job' },
    { title: '4. 연락처', description: '관련 담당자, 에스컬레이션 경로' },
  ],
  default: [
    { title: '1. 개요', description: '보고서 목적, 기간, 범위' },
    { title: '2. 상세 내용', description: '주요 내용 기술' },
    { title: '3. 결론', description: '요약 및 후속 조치' },
  ],
};

export function buildReportTemplateCard(
  incident: Record<string, unknown>,
  reportType: string,
): A2UICardDef {
  const sections = REPORT_SECTIONS[reportType] ?? REPORT_SECTIONS['default'];
  const incidentId = String(incident['id'] ?? '');
  const reportTypeLabels: Record<string, string> = {
    incident_postmortem: '포스트모템',
    deployment_review: '배포 검토',
    weekly_ops: '주간 운영 보고',
    handover: '핸드오버',
    default: '일반 보고서',
  };

  // Header
  const headerComponents: A2UIComponent[] = [
    mkIcon('report_icon', 'article'),
    mkText('report_title', '보고서 템플릿', 'h2'),
    mkRow('report_header', ['report_icon', 'report_title'], 'start'),
    mkDivider('report_div_top'),
    // Report info
    mkText('report_type_label', '보고서 유형'),
    mkText('report_type_val', reportTypeLabels[reportType] ?? reportType),
    mkRow('report_type_row', ['report_type_label', 'report_type_val'], 'spaceBetween'),
    mkText('report_inc_label', '연관 인시던트'),
    mkText('report_inc_val', incidentId || '없음'),
    mkRow('report_inc_row', ['report_inc_label', 'report_inc_val'], 'spaceBetween'),
    mkDivider('report_div_1'),
  ];

  // Section list with CheckBoxes for selection
  const sectionComponents: A2UIComponent[] = [
    mkText('sections_title', '제안 섹션 구성', 'h3'),
    mkText('sections_desc', '포함할 섹션을 선택하세요', 'caption'),
  ];
  const sectionIds: string[] = ['sections_title', 'sections_desc'];
  const sectionData: Record<string, boolean> = {};

  sections.forEach((section, i) => {
    const cbId = `section_cb_${i}`;
    const descId = `section_desc_${i}`;
    const colId = `section_col_${i}`;
    const dataKey = `/sections/${i}`;

    sectionComponents.push(
      mkCheckBox(cbId, section.title, dataKey),
      mkText(descId, section.description, 'caption'),
      mkCol(colId, [cbId, descId]),
    );
    sectionIds.push(colId);
    sectionData[dataKey] = true; // All selected by default
  });

  sectionComponents.push(mkCol('sections_list', sectionIds));

  // Action items suggestion
  const actionItemComponents: A2UIComponent[] = [
    mkDivider('action_div'),
    mkIcon('action_icon', 'checklist'),
    mkText('action_title', '추천 Action Items', 'h3'),
    mkRow('action_header', ['action_icon', 'action_title'], 'start'),
    mkText('action_item_1', '• 근본 원인 분석 완료 및 문서화'),
    mkText('action_item_2', '• 재발 방지 조치 식별 및 담당자 배정'),
    mkText('action_item_3', '• 모니터링/알림 임계값 조정'),
    mkCol('action_items_col', ['action_header', 'action_item_1', 'action_item_2', 'action_item_3']),
  ];

  // Buttons
  const buttonComponents: A2UIComponent[] = [
    mkDivider('btn_div'),
    mkText('btn_gen_text', '보고서 생성'),
    mkButton('btn_generate', 'btn_gen_text', 'generate_report', {
      incidentId,
      reportType,
    }, true),
    mkRow('btn_row', ['btn_generate'], 'end'),
  ];

  const mainChildren = [
    'report_header', 'report_div_top',
    'report_type_row', 'report_inc_row', 'report_div_1',
    'sections_list',
    'action_div', 'action_items_col',
    'btn_div', 'btn_row',
  ];

  const components: A2UIComponent[] = [
    ...headerComponents,
    ...sectionComponents,
    ...actionItemComponents,
    ...buttonComponents,
    mkCol('main_col', mainChildren),
    mkCard('root_card', 'main_col'),
  ];

  return {
    root: 'root_card',
    components,
    data: {
      incident: {
        id: String(incident['id'] ?? ''),
        title: String(incident['title'] ?? ''),
        severity: String(incident['severity'] ?? ''),
        service_id: String(incident['service_id'] ?? ''),
      },
      reportType,
      ...sectionData,
    },
  };
}
