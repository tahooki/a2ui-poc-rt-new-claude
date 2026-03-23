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

function mkInfoRow(
  prefix: string,
  iconName: string,
  label: string,
  value:
    | { kind: 'text'; text: string; usageHint?: string }
    | { kind: 'data'; path: string; usageHint?: string },
): { components: A2UIComponent[]; rowId: string } {
  const iconId = `${prefix}_icon`;
  const labelId = `${prefix}_label`;
  const leftId = `${prefix}_left`;
  const valueId = `${prefix}_value`;
  const rowId = `${prefix}_row`;

  const valueComponent =
    value.kind === 'data'
      ? mkDataText(valueId, value.path, value.usageHint)
      : mkText(valueId, value.text, value.usageHint);

  return {
    rowId,
    components: [
      mkIcon(iconId, iconName),
      mkText(labelId, label, 'caption'),
      mkRow(leftId, [iconId, labelId], 'start'),
      valueComponent,
      mkRow(rowId, [leftId, valueId], 'spaceBetween'),
    ],
  };
}

function rollbackVerdictSummary(input: { failCount: number; warnCount: number }) {
  if (input.failCount > 0) {
    return {
      title: '즉시 롤백 검토',
      detail: `실패 체크 ${input.failCount}개가 감지되어 현재 배포 상태를 유지하기 어렵습니다.`,
    };
  }

  if (input.warnCount > 0) {
    return {
      title: '주의 후 진행',
      detail: `경고 ${input.warnCount}개가 남아 있어 Dry-Run과 승인 상태를 함께 확인하는 편이 안전합니다.`,
    };
  }

  return {
    title: '진행 가능',
    detail: '현재 수집된 위험 체크 기준으로는 치명적인 차단 신호가 없습니다.',
  };
}

function asText(value: unknown, fallback = 'N/A'): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function pickText(
  source: Record<string, unknown>,
  keys: string[],
  fallback = 'N/A',
): string {
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined) {
      const text = String(value).trim();
      if (text.length > 0) return text;
    }
  }
  return fallback;
}

function normalizeSignalList(source: Record<string, unknown>): string[] {
  const rawSignals =
    source['recentSignals'] ??
    source['signals'] ??
    source['riskSignals'] ??
    source['recent_risk_signals'] ??
    source['signalSummary'] ??
    source['risk_signal_summary'] ??
    source['recent_signal_summary'];

  if (Array.isArray(rawSignals)) {
    return rawSignals
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  if (typeof rawSignals === 'string') {
    return rawSignals
      .split(/[|,·/]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  const fallback = pickText(source, ['signal_summary', 'risk_signal_summary'], '');
  return fallback ? [fallback] : [];
}

function normalizeRollbackCandidates(
  cardData: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const candidates =
    cardData['rollbackCandidates'] ??
    cardData['candidates'] ??
    cardData['deployments'] ??
    cardData['items'];

  if (Array.isArray(candidates)) {
    return candidates.filter((candidate): candidate is Record<string, unknown> => {
      return Boolean(candidate) && typeof candidate === 'object' && !Array.isArray(candidate);
    });
  }

  const deployment = cardData['deployment'];
  if (deployment && typeof deployment === 'object' && !Array.isArray(deployment)) {
    return [deployment as Record<string, unknown>];
  }

  return [];
}

function candidateStatusLabel(candidate: Record<string, unknown>): string {
  const status = pickText(candidate, ['state', 'candidate_state', 'rollback_state', 'status'], '');
  if (status === 'candidate') return '후보';
  if (status === 'rollback_requested') return '롤백 요청됨';
  if (status === 'rollbacked') return '롤백됨';
  if (status === 'rolled_back') return '롤백됨';
  if (!status) return '후보';
  return statusLabel(status);
}

function candidateActionable(candidate: Record<string, unknown>): boolean {
  const status = pickText(candidate, ['state', 'candidate_state', 'rollback_state', 'status'], '');
  const previousVersion = pickText(candidate, ['previous_version', 'previousVersion', 'target_version'], '');
  const availability = candidate['available'];

  if (availability === false) return false;
  if (!previousVersion || previousVersion === 'N/A') return false;
  if (status === 'rolled_back') return false;
  if (String(candidate['rollbackable'] ?? '').toLowerCase() === 'false') return false;
  return true;
}

function buildCandidateLabel(candidate: Record<string, unknown>): string {
  const service = pickText(candidate, ['service_name', 'service', 'service_id'], '서비스');
  const environment = pickText(candidate, ['environment', 'env'], '환경');
  const currentVersion = pickText(candidate, ['version', 'current_version', 'currentVersion'], 'N/A');
  return `${service} · ${environment} · 현재 ${currentVersion}`;
}

function rollbackCandidateRoleLabel(role: string): string {
  switch (role) {
    case 'current_target':
      return '지금 롤백할 대상';
    case 'recovery_target':
      return '복구될 버전';
    default:
      return '이전 배포 이력';
  }
}

function buildStepStatusNote(status: string, isCurrentStep: boolean) {
  if (isCurrentStep) {
    return '현재 대기 중인 단계입니다. 실행 전에 대상 배포와 리스크 신호를 다시 확인하세요.';
  }

  switch (status) {
    case 'completed':
    case 'done':
      return '검증이 끝난 단계입니다.';
    case 'running':
    case 'in_progress':
      return '실행 중인 단계입니다.';
    case 'failed':
    case 'fail':
      return '실패한 단계입니다. 원인을 확인한 뒤 다음 액션을 결정해야 합니다.';
    default:
      return '아직 시작하지 않은 단계입니다.';
  }
}

// ─── Rollback Action Card ───────────────────────────────────────────────────

export function buildRollbackActionCard(cardData: Record<string, unknown>): A2UICardDef {
  const candidates = normalizeRollbackCandidates(cardData).slice(0, 5);
  const serviceName = pickText(
    cardData,
    ['service_name', 'service', 'service_id', 'serviceId'],
    candidates[0] ? pickText(candidates[0], ['service_name', 'service', 'service_id'], '대상 서비스') : '대상 서비스',
  );
  const envScope = pickText(
    cardData,
    ['environment', 'env'],
    candidates[0] ? pickText(candidates[0], ['environment', 'env'], '전체 환경') : '전체 환경',
  );

  // ── Header ──
  const headerComponents: A2UIComponent[] = [
    mkText('rollback_title', '배포 이력', 'h2'),
    mkText('rollback_summary', `${serviceName} · ${envScope} · 최근 ${candidates.length}건`, 'caption'),
    mkDivider('rollback_div_top'),
  ];

  // ── Candidate rows ──
  const candidateComponents: A2UIComponent[] = [];
  const cardIds: string[] = [];

  if (candidates.length === 0) {
    candidateComponents.push(
      mkIcon('rollback_empty_icon', 'info'),
      mkText('rollback_empty_title', '배포 이력이 없습니다.', 'h4'),
      mkCol('rollback_empty_col', ['rollback_empty_icon', 'rollback_empty_title']),
    );
    cardIds.push('rollback_empty_col');
  } else {
    candidates.forEach((candidate, index) => {
      const candidateId = String(candidate['id'] ?? candidate['deployment_id'] ?? `candidate-${index}`);
      const currentVersion = pickText(candidate, ['version', 'current_version', 'currentVersion']);
      const environment = pickText(candidate, ['environment', 'env'], envScope);
      const status = pickText(candidate, ['state', 'candidate_state', 'rollback_state', 'status'], 'candidate');
      const deployedAt = pickText(candidate, ['deployed_at', 'created_at', 'updated_at', 'started_at'], '');
      const statusIconName = statusIcon(status);

      const isRolledBack = status === 'rolled_back' || status === 'rollbacked';
      const isFirst = index === 0;

      // Status text: 롤백됨 > 배포됨/실패/진행중
      const statusText = isRolledBack
        ? '롤백됨'
        : status === 'succeeded'
          ? '배포됨'
          : status === 'running'
            ? '진행 중'
            : status === 'failed'
              ? '실패'
              : candidateStatusLabel(candidate);

      // Show rollback button: not for already rolled-back, and not for the first (current) item
      const showRollbackBtn = !isRolledBack && !isFirst;

      const timeLabel = deployedAt
        ? deployedAt.replace(/T/, ' ').replace(/\.\d+Z$/, '').replace(/Z$/, '')
        : '';

      const rowComponents: A2UIComponent[] = [
        mkText(`rb_${index}_ver`, `${currentVersion}`, 'h4'),
        mkIcon(`rb_${index}_icon`, statusIconName),
        mkText(`rb_${index}_st`, statusText, 'caption'),
        mkRow(`rb_${index}_hdr`, [`rb_${index}_ver`, `rb_${index}_icon`, `rb_${index}_st`], 'spaceBetween'),
        mkText(`rb_${index}_env`, `${environment}${timeLabel ? ` · ${timeLabel}` : ''}`, 'caption'),
      ];

      const colChildren = [`rb_${index}_hdr`, `rb_${index}_env`];

      if (showRollbackBtn) {
        rowComponents.push(
          mkText(`rb_${index}_rb_text`, '롤백하기'),
          mkButton(
            `rb_${index}_rb_btn`,
            `rb_${index}_rb_text`,
            'execute_rollback',
            {
              candidateId,
              deploymentId: candidateId,
              planId: asText(candidate['plan_id'] ?? candidate['rollback_plan_id'] ?? ''),
              serviceId: pickText(candidate, ['service_id', 'service', 'service_name'], serviceName),
              environment,
            },
            true,
          ),
          mkRow(`rb_${index}_actions`, [`rb_${index}_rb_btn`], 'end'),
        );
        colChildren.push(`rb_${index}_actions`);
      }

      rowComponents.push(
        mkCol(`rb_${index}_col`, colChildren),
        mkCard(`rb_${index}_card`, `rb_${index}_col`),
      );

      candidateComponents.push(...rowComponents);
      cardIds.push(`rb_${index}_card`);
    });
  }

  const components: A2UIComponent[] = [
    ...headerComponents,
    ...candidateComponents,
    ...(cardIds.length > 0 ? [mkList('rollback_list', cardIds, 'vertical')] : []),
    mkCol('rollback_main_col', [
      'rollback_title',
      'rollback_summary',
      'rollback_div_top',
      ...(cardIds.length > 0 ? ['rollback_list'] : ['rollback_empty_col']),
    ]),
    mkCard('root_card', 'rollback_main_col'),
  ];

  return {
    root: 'root_card',
    components,
    data: {
      service: serviceName,
      environment: envScope,
      candidates: candidates.map((candidate) => ({
        id: candidate['id'] ?? candidate['deployment_id'] ?? '',
        version: pickText(candidate, ['version', 'current_version', 'currentVersion']),
        status: candidateStatusLabel(candidate),
      })),
    },
  };
}

function evidenceVerdictSummary(input: {
  severity: string;
  evidenceCount: number;
  criticalSignalCount: number;
}) {
  if (input.severity === 'critical' || input.criticalSignalCount >= 2) {
    return {
      title: '즉시 원인 확인 필요',
      detail: `중요 신호 ${input.criticalSignalCount}개가 감지되었습니다. 로그와 설정 변경을 먼저 교차 검토하세요.`,
    };
  }

  if (input.evidenceCount > 0) {
    return {
      title: '추가 비교 권장',
      detail: `수집된 증거 ${input.evidenceCount}건을 기반으로 원인 후보를 좁힐 수 있습니다.`,
    };
  }

  return {
    title: '증거 부족',
    detail: '아직 비교할 만한 증거가 충분하지 않습니다.',
  };
}

function actionRiskSummary(actionType: 'rollback' | 'job_execute' | 'incident_close') {
  switch (actionType) {
    case 'rollback':
      return {
        title: '고위험 변경',
        detail: '서비스 상태와 승인 여부를 다시 확인한 뒤 실행하는 편이 안전합니다.',
      };
    case 'job_execute':
      return {
        title: '실행 전 검토 필요',
        detail: '입력 파라미터와 dry-run 결과를 마지막으로 점검해야 합니다.',
      };
    default:
      return {
        title: '종결 전 확인',
        detail: '후속 조치와 커뮤니케이션이 모두 완료되었는지 확인해야 합니다.',
      };
  }
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
    case 'suggested':
      return 'auto_awesome';
    case 'draft_created':
    case 'approval_requested':
      return 'edit_note';
    case 'approval_pending':
      return 'hourglass_top';
    case 'held':
      return 'pause_circle';
    case 'expired':
      return 'schedule';
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
    suggested: '제안됨',
    draft_created: '초안 생성됨',
    approval_requested: '승인 요청됨',
    approval_pending: '승인 대기',
    held: '보류',
    expired: '만료됨',
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
  context?: {
    relatedIncidents?: Array<Record<string, unknown>>;
    deploymentDiffs?: Array<Record<string, unknown>>;
    recentAuditLogs?: Array<Record<string, unknown>>;
    approvalStatus?: Record<string, unknown> | null;
  },
): A2UICardDef {
  const deploymentId = String(deployment['id'] ?? '');
  const planId = String(rollbackPlan?.['id'] ?? '');
  const planStatus = rollbackPlan?.['status'] as string | undefined;
  const relatedIncidents = context?.relatedIncidents ?? [];
  const deploymentDiffs = context?.deploymentDiffs ?? [];
  const recentAuditLogs = context?.recentAuditLogs ?? [];
  const approvalStatus = context?.approvalStatus ?? null;
  const passCount = riskChecks.filter((check) => check['status'] === 'pass').length;
  const warnCount = riskChecks.filter((check) => check['status'] === 'warn').length;
  const failCount = riskChecks.filter((check) => check['status'] === 'fail').length;
  const riskSummaryText = `통과 ${passCount} / 경고 ${warnCount} / 실패 ${failCount}`;
  const verdict = rollbackVerdictSummary({ failCount, warnCount });
  const approvalStatusText = statusLabel(String(approvalStatus?.['status'] ?? 'draft'));
  const approvalMessage = String(approvalStatus?.['message'] ?? '승인 상태 정보 없음');

  const deploymentRows = [
    mkInfoRow('dep_ver', 'tag', '버전', { kind: 'data', path: '/deployment/version' }),
    mkInfoRow('dep_svc', 'dns', '서비스', { kind: 'data', path: '/deployment/service_id' }),
    mkInfoRow('dep_st', statusIcon(String(deployment['status'] ?? '')), '상태', {
      kind: 'data',
      path: '/deployment/status',
    }),
    mkInfoRow('dep_env', 'cloud', '환경', { kind: 'data', path: '/deployment/environment' }),
    mkInfoRow('dep_ro', 'speed', '롤아웃', { kind: 'data', path: '/deployment/rollout_percent' }),
  ];

  const deployInfoComponents: A2UIComponent[] = [
    mkText('dep_title', '배포 정보', 'h3'),
    mkDivider('dep_div_1'),
    mkText('dep_overview_label', '현재 권고', 'caption'),
    mkText('dep_overview_title', verdict.title, 'h4'),
    mkText(
      'dep_overview_detail',
      `${verdict.detail} 승인 상태는 ${approvalStatusText}입니다.`,
      'caption',
    ),
    ...deploymentRows.flatMap((row) => row.components),
    mkCol('dep_info_col', [
      'dep_title',
      'dep_div_1',
      'dep_overview_label',
      'dep_overview_title',
      'dep_overview_detail',
      ...deploymentRows.map((row) => row.rowId),
    ]),
  ];

  const riskComponents: A2UIComponent[] = [
    mkText('risk_title', `위험 체크 결과 (${riskChecks.length}개)`, 'h3'),
    mkDivider('risk_div_1'),
  ];
  const riskRowIds: string[] = [];
  const riskCheckData: Record<string, boolean> = {};

  riskChecks.forEach((check, index) => {
    const status = String(check['status'] ?? 'pending');
    const checkName = String(check['check_name'] ?? `체크 ${index + 1}`);
    const detail = String(check['detail'] ?? '');
    const iconId = `risk_icon_${index}`;
    const nameId = `risk_name_${index}`;
    const detailId = `risk_detail_${index}`;
    const statusId = `risk_status_${index}`;
    const infoColId = `risk_info_${index}`;
    const rowId = `risk_row_${index}`;

    riskComponents.push(
      mkIcon(iconId, statusIcon(status)),
      mkText(nameId, checkName, 'h4'),
      mkText(detailId, detail || '-', 'caption'),
      mkCol(infoColId, [nameId, detailId]),
      mkText(statusId, statusLabel(status), 'caption'),
      mkRow(rowId, [iconId, infoColId, statusId], 'spaceBetween'),
    );
    riskRowIds.push(rowId);
    riskCheckData[`/riskChecks/${index}/passed`] = status === 'pass';
  });

  riskComponents.push(
    mkDivider('risk_div_2'),
    mkText('risk_summary', riskSummaryText, 'caption'),
    mkCol('risk_col', ['risk_title', 'risk_div_1', ...riskRowIds, 'risk_div_2', 'risk_summary']),
  );

  const planRows = [
    mkInfoRow('plan_st', statusIcon(planStatus ?? 'draft'), '계획 상태', {
      kind: 'text',
      text: statusLabel(planStatus ?? '없음'),
    }),
    mkInfoRow('plan_tv', 'history', '복구 대상 버전', {
      kind: 'data',
      path: '/plan/target_version',
    }),
  ];

  const planComponents: A2UIComponent[] = [
    mkText('plan_title', '롤백 계획', 'h3'),
    mkDivider('plan_div_1'),
    mkText('plan_summary', `리스크 요약: ${riskSummaryText}`, 'caption'),
    ...planRows.flatMap((row) => row.components),
  ];

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
    mkCol('plan_col', [
      'plan_title',
      'plan_div_1',
      'plan_summary',
      ...planRows.map((row) => row.rowId),
      'plan_div_2',
      'plan_btn_row',
    ]),
  );

  const contextComponents: A2UIComponent[] = [
    mkText('ctx_title', '운영 문맥', 'h3'),
    mkDivider('ctx_div_1'),
    ...mkInfoRow('ctx_appr', statusIcon(String(approvalStatus?.['status'] ?? 'draft')), '승인 상태', {
      kind: 'text',
      text: approvalStatusText,
    }).components,
    mkText('ctx_appr_msg', approvalMessage, 'caption'),
  ];
  const contextRowIds: string[] = ['ctx_title', 'ctx_div_1', 'ctx_appr_row', 'ctx_appr_msg'];

  const diffSummary = {
    added: deploymentDiffs.filter((diff) => String(diff['change_type'] ?? '') === 'added').length,
    modified: deploymentDiffs.filter((diff) => String(diff['change_type'] ?? '') === 'modified').length,
    deleted: deploymentDiffs.filter((diff) => String(diff['change_type'] ?? '') === 'deleted').length,
  };
  contextComponents.push(
    mkDivider('ctx_div_2'),
    mkText('ctx_diff_title', `변경 요약 (${deploymentDiffs.length}개)`, 'h4'),
    mkText(
      'ctx_diff_summary',
      `추가 ${diffSummary.added} / 수정 ${diffSummary.modified} / 삭제 ${diffSummary.deleted}`,
      'caption',
    ),
  );
  contextRowIds.push('ctx_div_2', 'ctx_diff_title', 'ctx_diff_summary');

  if (relatedIncidents.length > 0) {
    contextComponents.push(
      mkDivider('ctx_div_3'),
      mkText('ctx_inc_title', `관련 인시던트 (${relatedIncidents.length})`, 'h4'),
    );
    contextRowIds.push('ctx_div_3', 'ctx_inc_title');

    relatedIncidents.slice(0, 3).forEach((incident, index) => {
      const rowId = `ctx_inc_row_${index}`;
      const iconId = `ctx_inc_icon_${index}`;
      const textId = `ctx_inc_text_${index}`;
      const label = `${String(incident['title'] ?? incident['id'] ?? 'incident')} · ${statusLabel(String(incident['status'] ?? 'open'))}`;
      contextComponents.push(
        mkIcon(iconId, statusIcon(String(incident['status'] ?? 'open'))),
        mkText(textId, label, 'caption'),
        mkRow(rowId, [iconId, textId], 'start'),
      );
      contextRowIds.push(rowId);
    });
  }

  if (recentAuditLogs.length > 0) {
    contextComponents.push(
      mkDivider('ctx_div_4'),
      mkText('ctx_audit_title', `최근 감사 이력 (${recentAuditLogs.length})`, 'h4'),
    );
    contextRowIds.push('ctx_div_4', 'ctx_audit_title');

    recentAuditLogs.slice(0, 3).forEach((log, index) => {
      const rowId = `ctx_audit_row_${index}`;
      const iconId = `ctx_audit_icon_${index}`;
      const textId = `ctx_audit_text_${index}`;
      const text = `${String(log['action_type'] ?? 'action')} · ${String(log['result'] ?? 'unknown')}`;
      contextComponents.push(
        mkIcon(iconId, statusIcon(String(log['result'] ?? 'unknown'))),
        mkText(textId, text, 'caption'),
        mkRow(rowId, [iconId, textId], 'start'),
      );
      contextRowIds.push(rowId);
    });
  }

  contextComponents.push(mkCol('ctx_col', contextRowIds));

  const components: A2UIComponent[] = [
    mkText('card_title', '롤백 판단 요약', 'h2'),
    mkText('card_verdict_label', '배포 판단', 'caption'),
    mkText('card_verdict_title', verdict.title, 'h4'),
    mkText(
      'card_verdict_detail',
      `${riskSummaryText} · 승인 ${approvalStatusText} · 관련 인시던트 ${relatedIncidents.length}건`,
      'caption',
    ),
    mkDivider('card_div_top'),
    ...deployInfoComponents,
    ...riskComponents,
    ...planComponents,
    ...contextComponents,
    mkTabs('main_tabs', [
      { title: '배포 정보', childId: 'dep_info_col' },
      { title: `리스크 (${riskChecks.length})`, childId: 'risk_col' },
      { title: '롤백 계획', childId: 'plan_col' },
      { title: '운영 문맥', childId: 'ctx_col' },
    ]),
    mkCol('main_col', [
      'card_title',
      'card_verdict_label',
      'card_verdict_title',
      'card_verdict_detail',
      'card_div_top',
      'main_tabs',
    ]),
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
        status: statusLabel(String(deployment['status'] ?? 'N/A')),
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
  context?: {
    incidentEvents?: Array<Record<string, unknown>>;
    linkedDeployment?: Record<string, unknown> | null;
    linkedDeploymentDiffs?: Array<Record<string, unknown>>;
    recentAuditLogs?: Array<Record<string, unknown>>;
    rootCauseHints?: string[];
    nextActions?: string[];
  },
): A2UICardDef {
  const incidentEvents = context?.incidentEvents ?? [];
  const linkedDeployment = context?.linkedDeployment ?? null;
  const linkedDeploymentDiffs = context?.linkedDeploymentDiffs ?? [];
  const recentAuditLogs = context?.recentAuditLogs ?? [];
  const rootCauseHints = context?.rootCauseHints ?? [];
  const nextActions = context?.nextActions ?? [];
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
  const severity = String(incident['severity'] ?? 'medium');
  const status = String(incident['status'] ?? 'open');
  const criticalSignalCount = evidence.filter((item) =>
    ['error_rate', 'config_diff', 'trace'].includes(String(item['type'] ?? 'other')),
  ).length;
  const verdict = evidenceVerdictSummary({
    severity,
    evidenceCount: evidence.length,
    criticalSignalCount,
  });
  const incidentRows = [
    mkInfoRow('inc_sev', statusIcon(severity === 'critical' ? 'failed' : severity === 'high' ? 'warn' : 'open'), '심각도', {
      kind: 'data',
      path: '/incident/severity',
    }),
    mkInfoRow('inc_st', statusIcon(status), '상태', {
      kind: 'data',
      path: '/incident/status',
    }),
    mkInfoRow('inc_svc', 'dns', '서비스', {
      kind: 'data',
      path: '/incident/service_id',
    }),
  ];

  const incidentComponents: A2UIComponent[] = [
    mkText('inc_title', '증거 비교 분석', 'h2'),
    mkText('inc_verdict_label', '분석 요약', 'caption'),
    mkText('inc_verdict_title', verdict.title, 'h4'),
    mkText(
      'inc_verdict_detail',
      `${verdict.detail} 현재 상태는 ${statusLabel(status)}입니다.`,
      'caption',
    ),
    mkDivider('inc_div_top'),
    ...incidentRows.flatMap((row) => row.components),
    mkText('inc_ev_count', `총 ${evidence.length}개 증거 수집됨 · 핵심 신호 ${criticalSignalCount}개`, 'caption'),
    mkDivider('inc_div_bottom'),
    mkCol('inc_summary_col', [
      'inc_title',
      'inc_verdict_label',
      'inc_verdict_title',
      'inc_verdict_detail',
      'inc_div_top',
      ...incidentRows.map((row) => row.rowId),
      'inc_ev_count',
    ]),
  ];

  const tabDefs: Array<{ title: string; childId: string }> = [];
  const evidenceComponents: A2UIComponent[] = [];
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
    evidenceComponents.push(mkCol('ev_all_list', allEvidenceRowIds));
    tabDefs.push({ title: `전체 (${evidence.length})`, childId: 'ev_all_list' });
  }

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
    evidenceComponents.push(mkCol(listId, itemRowIds));
    tabDefs.push({
      title: `${typeLabels[type] ?? type} (${items.length})`,
      childId: listId,
    });
  });

  evidenceComponents.push(mkTabs('ev_tabs', tabDefs));

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

  const triageComponents: A2UIComponent[] = [];
  const triageChildren: string[] = [];

  if (incidentEvents.length > 0) {
    triageComponents.push(
      mkDivider('triage_div_1'),
      mkText('triage_events_title', `최근 이벤트 (${incidentEvents.length})`, 'h4'),
    );
    triageChildren.push('triage_div_1', 'triage_events_title');

    incidentEvents.slice(0, 3).forEach((event, index) => {
      const rowId = `triage_event_row_${index}`;
      const iconId = `triage_event_icon_${index}`;
      const textId = `triage_event_text_${index}`;
      const text = `${String(event['action'] ?? 'event')} · ${String(event['detail'] ?? '').slice(0, 48)}`;
      triageComponents.push(
        mkIcon(iconId, statusIcon(index === incidentEvents.length - 1 ? 'open' : 'running')),
        mkText(textId, text || '-', 'caption'),
        mkRow(rowId, [iconId, textId], 'start'),
      );
      triageChildren.push(rowId);
    });
  }

  if (linkedDeployment) {
    const diffSummary = {
      added: linkedDeploymentDiffs.filter((diff) => String(diff['change_type'] ?? '') === 'added').length,
      modified: linkedDeploymentDiffs.filter((diff) => String(diff['change_type'] ?? '') === 'modified').length,
      deleted: linkedDeploymentDiffs.filter((diff) => String(diff['change_type'] ?? '') === 'deleted').length,
    };
    triageComponents.push(
      mkDivider('triage_div_2'),
      mkText('triage_dep_title', '연결된 배포 문맥', 'h4'),
      mkText(
        'triage_dep_text',
        `${String(linkedDeployment['version'] ?? linkedDeployment['id'] ?? 'deployment')} · 변경 추가 ${diffSummary.added} / 수정 ${diffSummary.modified} / 삭제 ${diffSummary.deleted}`,
        'caption',
      ),
    );
    triageChildren.push('triage_div_2', 'triage_dep_title', 'triage_dep_text');
  }

  if (rootCauseHints.length > 0) {
    triageComponents.push(
      mkDivider('triage_div_3'),
      mkText('triage_hint_title', '원인 힌트', 'h4'),
    );
    triageChildren.push('triage_div_3', 'triage_hint_title');

    rootCauseHints.slice(0, 3).forEach((hint, index) => {
      const id = `triage_hint_${index}`;
      triageComponents.push(mkText(id, `• ${hint}`, 'caption'));
      triageChildren.push(id);
    });
  }

  if (nextActions.length > 0) {
    triageComponents.push(
      mkDivider('triage_div_4'),
      mkText('triage_next_title', '다음 액션 제안', 'h4'),
    );
    triageChildren.push('triage_div_4', 'triage_next_title');

    nextActions.slice(0, 3).forEach((action, index) => {
      const id = `triage_next_${index}`;
      triageComponents.push(mkText(id, `• ${action}`, 'caption'));
      triageChildren.push(id);
    });
  }

  if (recentAuditLogs.length > 0) {
    triageComponents.push(
      mkDivider('triage_div_5'),
      mkText('triage_audit_title', `최근 감사 로그 (${recentAuditLogs.length})`, 'h4'),
    );
    triageChildren.push('triage_div_5', 'triage_audit_title');

    recentAuditLogs.slice(0, 3).forEach((log, index) => {
      const rowId = `triage_audit_row_${index}`;
      const iconId = `triage_audit_icon_${index}`;
      const textId = `triage_audit_text_${index}`;
      const text = `${String(log['action_type'] ?? 'action')} · ${String(log['result'] ?? 'unknown')}`;
      triageComponents.push(
        mkIcon(iconId, statusIcon(String(log['result'] ?? 'unknown'))),
        mkText(textId, text, 'caption'),
        mkRow(rowId, [iconId, textId], 'start'),
      );
      triageChildren.push(rowId);
    });
  }

  if (triageChildren.length > 0) {
    triageComponents.push(mkCol('triage_col', triageChildren));
  }

  const mainColChildren = [
    'inc_summary_col', 'inc_div_bottom', 'ev_tabs',
    ...(keyFindings.length > 0 ? ['findings_div', 'findings_col'] : []),
    ...(triageChildren.length > 0 ? ['triage_col'] : []),
  ];

  const components: A2UIComponent[] = [
    ...incidentComponents,
    ...evidenceComponents,
    ...findingsComponents,
    ...triageComponents,
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
  context?: {
    deployment?: Record<string, unknown> | null;
    riskChecks?: Array<Record<string, unknown>>;
    dryRunSummary?: Record<string, unknown> | null;
  },
): A2UICardDef {
  const planId = String(rollbackPlan['id'] ?? '');
  const deploymentId = String(rollbackPlan['deployment_id'] ?? '');
  const currentStepOrder = steps.find((step) => step['status'] === 'pending')?.['step_order'] as number | undefined;
  const deployment = context?.deployment ?? null;
  const riskChecks = context?.riskChecks ?? [];
  const dryRunSummary = context?.dryRunSummary ?? null;
  const passCount = riskChecks.filter((item) => String(item['status'] ?? '') === 'pass').length;
  const warnCount = riskChecks.filter((item) => String(item['status'] ?? '') === 'warn').length;
  const failCount = riskChecks.filter((item) => String(item['status'] ?? '') === 'fail').length;
  const completedCount = steps.filter((step) => ['completed', 'done'].includes(String(step['status'] ?? ''))).length;
  const totalSteps = steps.length;
  const progressText = `${completedCount} / ${totalSteps} 단계 완료`;
  const allCompleted = completedCount === totalSteps;
  const hasPending = steps.some((step) => step['status'] === 'pending');

  const headerComponents: A2UIComponent[] = [
    mkText('stepper_title', 'Dry-Run 단계별 확인', 'h2'),
    mkText('stepper_status_label', '진행 요약', 'caption'),
    mkText(
      'stepper_status_value',
      allCompleted ? '모든 단계가 검증되었습니다.' : '다음 실행 단계를 확인하세요.',
      'h4',
    ),
    mkDivider('stepper_div_top'),
    ...mkInfoRow(
      'stepper_progress',
      allCompleted ? 'check_circle' : 'hourglass_top',
      '진행 상태',
      { kind: 'text', text: progressText },
    ).components,
    mkText('stepper_plan_id', `계획: ${planId}`, 'caption'),
  ];

  if (deployment || riskChecks.length > 0) {
    headerComponents.push(
      mkText(
        'stepper_context',
        `${deployment ? `배포 ${String(deployment['version'] ?? deployment['id'] ?? '')}` : '배포 정보 없음'} · 리스크 통과 ${passCount} / 경고 ${warnCount} / 실패 ${failCount}`,
        'caption',
      ),
    );
  }

  if (dryRunSummary) {
    headerComponents.push(
      mkText(
        'stepper_dryrun_summary',
        `Dry-run 요약: ${String(dryRunSummary['message'] ?? dryRunSummary['result'] ?? '확인 필요')}`,
        'caption',
      ),
    );
  }

  headerComponents.push(mkDivider('stepper_div_1'));

  const stepComponents: A2UIComponent[] = [];
  const stepItemIds: string[] = [];

  steps.forEach((step, index) => {
    const status = String(step['status'] ?? 'pending');
    const action = String(step['action'] ?? step['description'] ?? `단계 ${index + 1}`);
    const isCurrentStep = step['step_order'] === currentStepOrder;
    const stepNum = String(step['step_order'] ?? index + 1);
    const markerId = `step_marker_${index}`;
    const iconId = `step_icon_${index}`;
    const titleId = `step_title_${index}`;
    const titleRowId = `step_title_row_${index}`;
    const statusId = `step_status_${index}`;
    const noteId = `step_note_${index}`;
    const cardId = `step_card_${index}`;

    stepComponents.push(
      mkText(markerId, isCurrentStep ? '현재 단계' : `단계 ${stepNum}`, 'caption'),
      mkIcon(iconId, statusIcon(status)),
      mkText(titleId, `${stepNum}. ${action}`, isCurrentStep ? 'h4' : 'body'),
      mkRow(titleRowId, [iconId, titleId], 'start'),
      mkText(statusId, `상태: ${statusLabel(status)}`, 'caption'),
      mkText(noteId, buildStepStatusNote(status, isCurrentStep), 'caption'),
      mkCol(cardId, [markerId, titleRowId, statusId, noteId]),
    );
    stepItemIds.push(cardId);

    if (index < steps.length - 1) {
      const dividerId = `step_div_${index}`;
      stepComponents.push(mkDivider(dividerId));
      stepItemIds.push(dividerId);
    }
  });

  stepComponents.push(mkCol('step_list', stepItemIds));

  const buttonComponents: A2UIComponent[] = [];
  const buttonIds: string[] = [];

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
    'stepper_title',
    'stepper_status_label',
    'stepper_status_value',
    'stepper_div_top',
    'stepper_progress_row',
    'stepper_plan_id',
    ...(deployment || riskChecks.length > 0 ? ['stepper_context'] : []),
    ...(dryRunSummary ? ['stepper_dryrun_summary'] : []),
    'stepper_div_1',
    'step_list',
    'stepper_div_bottom',
    'stepper_btn_row',
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
  extra?: {
    recentAuditLogs?: Array<Record<string, unknown>>;
    recentRelatedEvents?: Array<Record<string, unknown>>;
    approvalStatus?: Record<string, unknown> | null;
    policyHints?: string[];
  },
): A2UICardDef {
  const recentAuditLogs = extra?.recentAuditLogs ?? [];
  const recentRelatedEvents = extra?.recentRelatedEvents ?? [];
  const approvalStatus = extra?.approvalStatus ?? null;
  const policyHints = extra?.policyHints ?? [];
  const riskSummary = actionRiskSummary(actionType);
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

  const headerComponents: A2UIComponent[] = [
    mkText('confirm_title', actionLabels[actionType] ?? '실행 확인', 'h2'),
    mkText('confirm_risk_label', '실행 전 리스크', 'caption'),
    mkText('confirm_risk_title', riskSummary.title, 'h4'),
    mkText('confirm_risk_detail', riskSummary.detail, 'caption'),
    mkDivider('confirm_div_top'),
    mkText('confirm_desc', actionDescriptions[actionType] ?? '', 'body'),
    mkDivider('confirm_div_1'),
  ];

  const entityComponents: A2UIComponent[] = [
    mkText('entity_title', '대상 정보', 'h3'),
  ];
  const entityRowIds: string[] = ['entity_title'];
  const entityData: Record<string, string> = {};
  const entityIcons: Record<string, string> = {
    id: 'badge',
    service: 'dns',
    service_id: 'dns',
    version: 'tag',
    environment: 'cloud',
    status: 'info',
    job: 'description',
    job_id: 'description',
    incident: 'error',
    incident_id: 'error',
  };

  Object.entries(entity).slice(0, 6).forEach(([key, val], i) => {
    const displayKey = key.replace(/_/g, ' ');
    const row = mkInfoRow(
      `entity_${i}`,
      entityIcons[key] ?? 'label',
      displayKey,
      { kind: 'data', path: `/entity/${key}` },
    );
    entityComponents.push(...row.components);
    entityRowIds.push(row.rowId);
    entityData[key] = String(val ?? '');
  });

  entityComponents.push(mkCol('entity_col', entityRowIds));

  const checklistComponents: A2UIComponent[] = [
    mkDivider('check_div'),
    mkText('check_title', '실행 전 확인 사항', 'h3'),
    mkText('check_hint', '필수 항목을 먼저 확인한 뒤 실행 버튼을 누르세요.', 'caption'),
  ];
  const checklistData: Record<string, boolean> = {};
  const checkIds: string[] = ['check_title', 'check_hint'];

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

  const contextComponents: A2UIComponent[] = [];
  const contextIds: string[] = [];

  if (approvalStatus || policyHints.length > 0 || recentAuditLogs.length > 0 || recentRelatedEvents.length > 0) {
    contextComponents.push(
      mkDivider('confirm_ctx_div'),
      mkText('confirm_ctx_title', '정책 및 최근 문맥', 'h3'),
    );
    contextIds.push('confirm_ctx_div', 'confirm_ctx_title');
  }

  if (approvalStatus) {
    const approvalRow = mkInfoRow(
      'confirm_ctx_approval',
      statusIcon(String(approvalStatus['status'] ?? 'draft')),
      '승인 상태',
      {
        kind: 'text',
        text: statusLabel(String(approvalStatus['status'] ?? 'draft')),
      },
    );
    contextComponents.push(...approvalRow.components);
    contextIds.push(approvalRow.rowId);
  }

  policyHints.slice(0, 3).forEach((hint, index) => {
    const id = `confirm_ctx_hint_${index}`;
    contextComponents.push(mkText(id, `• ${hint}`, 'caption'));
    contextIds.push(id);
  });

  recentRelatedEvents.slice(0, 2).forEach((event, index) => {
    const id = `confirm_ctx_event_${index}`;
    const text = String(event['action'] ?? event['detail'] ?? event['type'] ?? 'event');
    contextComponents.push(mkText(id, `최근 이벤트: ${text}`, 'caption'));
    contextIds.push(id);
  });

  recentAuditLogs.slice(0, 2).forEach((log, index) => {
    const id = `confirm_ctx_audit_${index}`;
    const text = `${String(log['action_type'] ?? 'action')} · ${String(log['result'] ?? 'unknown')}`;
    contextComponents.push(mkText(id, `감사 로그: ${text}`, 'caption'));
    contextIds.push(id);
  });

  if (contextIds.length > 0) {
    contextComponents.push(mkCol('confirm_ctx_col', contextIds));
  }

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
    'confirm_title', 'confirm_risk_label', 'confirm_risk_title', 'confirm_risk_detail',
    'confirm_div_top', 'confirm_desc', 'confirm_div_1',
    'entity_col', 'check_div', 'check_col',
    ...(contextIds.length > 0 ? ['confirm_ctx_col'] : []),
    'confirm_div_bottom', 'confirm_btn_row',
  ];

  const components: A2UIComponent[] = [
    ...headerComponents,
    ...entityComponents,
    ...checklistComponents,
    ...contextComponents,
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
  context?: {
    jobRunEvents?: Array<Record<string, unknown>>;
    dependencySummary?: Record<string, unknown> | null;
    rerunHints?: string[];
  },
): A2UICardDef {
  const jobRunEvents = context?.jobRunEvents ?? [];
  const dependencySummary = context?.dependencySummary ?? null;
  const rerunHints = context?.rerunHints ?? [];
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

  const contextComponents: A2UIComponent[] = [];
  const contextIds: string[] = [];
  if (dependencySummary || jobRunEvents.length > 0 || rerunHints.length > 0) {
    contextComponents.push(
      mkDivider('job_ctx_div'),
      mkText('job_ctx_title', '실행 문맥', 'h3'),
    );
    contextIds.push('job_ctx_div', 'job_ctx_title');
  }

  if (dependencySummary) {
    contextComponents.push(
      mkText(
        'job_ctx_dep',
        `의존성 ${String(dependencySummary['dependencyCount'] ?? 0)}개 · ${String(dependencySummary['readiness'] ?? '확인 필요')}`,
        'caption',
      ),
    );
    contextIds.push('job_ctx_dep');
  }

  jobRunEvents.slice(0, 3).forEach((event, index) => {
    const id = `job_ctx_event_${index}`;
    const text = `${String(event['type'] ?? 'event')} · ${String(event['detail'] ?? '').slice(0, 48)}`;
    contextComponents.push(mkText(id, text, 'caption'));
    contextIds.push(id);
  });

  rerunHints.slice(0, 3).forEach((hint, index) => {
    const id = `job_ctx_hint_${index}`;
    contextComponents.push(mkText(id, `• ${hint}`, 'caption'));
    contextIds.push(id);
  });

  if (contextIds.length > 0) {
    contextComponents.push(mkCol('job_ctx_col', contextIds));
    tabDefs.push({ title: '문맥', childId: 'job_ctx_col' });
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
    ...contextComponents,
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
  context?: {
    incidentEvents?: Array<Record<string, unknown>>;
    evidenceSummary?: Record<string, unknown> | null;
    recentAuditLogs?: Array<Record<string, unknown>>;
    pendingActions?: string[];
  },
): A2UICardDef {
  const incidentEvents = context?.incidentEvents ?? [];
  const evidenceSummary = context?.evidenceSummary ?? null;
  const recentAuditLogs = context?.recentAuditLogs ?? [];
  const pendingActions = context?.pendingActions ?? [];
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

  const contextComponents: A2UIComponent[] = [];
  const contextIds: string[] = [];
  if (incidentEvents.length > 0 || evidenceSummary || recentAuditLogs.length > 0 || pendingActions.length > 0) {
    contextComponents.push(
      mkDivider('report_ctx_div'),
      mkText('report_ctx_title', '현재 문맥 요약', 'h3'),
    );
    contextIds.push('report_ctx_div', 'report_ctx_title');
  }

  if (evidenceSummary) {
    contextComponents.push(
      mkText(
        'report_ctx_evidence',
        `증거 ${String(evidenceSummary['total'] ?? 0)}건 수집됨`,
        'caption',
      ),
    );
    contextIds.push('report_ctx_evidence');
  }

  incidentEvents.slice(0, 2).forEach((event, index) => {
    const id = `report_ctx_event_${index}`;
    const text = `${String(event['action'] ?? 'event')} · ${String(event['detail'] ?? '').slice(0, 48)}`;
    contextComponents.push(mkText(id, text, 'caption'));
    contextIds.push(id);
  });

  recentAuditLogs.slice(0, 2).forEach((log, index) => {
    const id = `report_ctx_audit_${index}`;
    const text = `${String(log['action_type'] ?? 'action')} · ${String(log['result'] ?? 'unknown')}`;
    contextComponents.push(mkText(id, `감사 로그: ${text}`, 'caption'));
    contextIds.push(id);
  });

  pendingActions.slice(0, 3).forEach((action, index) => {
    const id = `report_ctx_action_${index}`;
    contextComponents.push(mkText(id, `• ${action}`, 'caption'));
    contextIds.push(id);
  });

  if (contextIds.length > 0) {
    contextComponents.push(mkCol('report_ctx_col', contextIds));
  }

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
    ...(contextIds.length > 0 ? ['report_ctx_col'] : []),
    'btn_div', 'btn_row',
  ];

  const components: A2UIComponent[] = [
    ...headerComponents,
    ...sectionComponents,
    ...actionItemComponents,
    ...contextComponents,
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

// ─── 7. Deployment Approval Inbox ─────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asRecordList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
}

function pickBool(source: Record<string, unknown>, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const text = value.trim().toLowerCase();
      if (['true', 'yes', '1', 'y'].includes(text)) return true;
      if (['false', 'no', '0', 'n'].includes(text)) return false;
    }
  }
  return fallback;
}

function normalizeRiskSummary(source: Record<string, unknown>): {
  passCount: number;
  warnCount: number;
  failCount: number;
  text: string;
} {
  const fromSummary = asRecord(
    source['riskSummary'] ??
      source['risk_summary'] ??
      source['risk'] ??
      source['summary'],
  );
  if (fromSummary) {
    const passCount = Number(fromSummary['passCount'] ?? fromSummary['passed'] ?? fromSummary['pass'] ?? 0);
    const warnCount = Number(fromSummary['warnCount'] ?? fromSummary['warnings'] ?? fromSummary['warn'] ?? 0);
    const failCount = Number(fromSummary['failCount'] ?? fromSummary['failed'] ?? fromSummary['fail'] ?? 0);
    return {
      passCount,
      warnCount,
      failCount,
      text: `통과 ${passCount} / 경고 ${warnCount} / 실패 ${failCount}`,
    };
  }

  const checks = asRecordList(source['riskChecks'] ?? source['risk_checks'] ?? source['checks']);
  if (checks.length > 0) {
    const passCount = checks.filter((item) => String(item['status'] ?? '') === 'pass').length;
    const warnCount = checks.filter((item) => String(item['status'] ?? '') === 'warn').length;
    const failCount = checks.filter((item) => String(item['status'] ?? '') === 'fail').length;
    return {
      passCount,
      warnCount,
      failCount,
      text: `통과 ${passCount} / 경고 ${warnCount} / 실패 ${failCount}`,
    };
  }

  const passCount = Number(source['passCount'] ?? source['passedCount'] ?? 0);
  const warnCount = Number(source['warnCount'] ?? source['warningCount'] ?? 0);
  const failCount = Number(source['failCount'] ?? source['failedCount'] ?? 0);
  return {
    passCount,
    warnCount,
    failCount,
    text: `통과 ${passCount} / 경고 ${warnCount} / 실패 ${failCount}`,
  };
}

function normalizeDeploymentCandidates(
  source: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const candidateSources = [
    source['candidates'],
    source['requests'],
    source['items'],
    source['deployments'],
    source['approvalQueue'],
    source['suggestions'],
    source['baselineCandidates'],
    source['recentSuccessfulDeployments'],
  ];

  for (const value of candidateSources) {
    const candidates = asRecordList(value);
    if (candidates.length > 0) return candidates;
  }

  const single =
    asRecord(source['baseline']) ||
    asRecord(source['selectedDeployment']) ||
    asRecord(source['deployment']) ||
    asRecord(source['request']) ||
    asRecord(source['candidate']);

  return single ? [single] : [];
}

function renderQueueState(status: string): string {
  switch (status) {
    case 'approval_requested':
      return '승인 대기';
    case 'started':
      return '시작됨';
    case 'approved':
    case 'held':
    case 'expired':
      return statusLabel(status);
    case 'approval_pending':
      return '승인 대기';
    default:
      return statusLabel(status);
  }
}

export function buildDeploymentApprovalInboxCard(cardData: Record<string, unknown>): A2UICardDef {
  const candidates = normalizeDeploymentCandidates(cardData).slice(0, 5);
  const queueState = String(cardData['state'] ?? cardData['status'] ?? 'approval_pending');
  const totalCount = candidates.length;
  const actionableCount = candidates.filter((candidate) => {
    const s = String(candidate['status'] ?? candidate['state'] ?? 'approval_pending');
    return ['approval_pending', 'approval_requested', 'draft'].includes(s);
  }).length;
  const summary = totalCount > 0
    ? `지금 처리할 수 있는 배포 요청 ${actionableCount}건`
    : '현재 승인 대기 배포가 없습니다.';

  const serviceScope = pickText(
    cardData,
    ['service_name', 'service', 'service_id'],
    candidates[0]
      ? pickText(candidates[0], ['service_name', 'service', 'service_id'], '전체 서비스')
      : '전체 서비스',
  );
  const envScope = pickText(
    cardData,
    ['environment', 'env'],
    candidates[0]
      ? pickText(candidates[0], ['environment', 'env'], '전체 환경')
      : '전체 환경',
  );

  const headerComponents: A2UIComponent[] = [
    mkIcon('inbox_icon', 'inbox'),
    mkText('inbox_eyebrow', 'A2UI · 배포 승인 Inbox', 'caption'),
    mkText('inbox_title', '승인 대기 배포', 'h2'),
    mkText('inbox_summary', summary, 'caption'),
    mkText('inbox_scope', `${serviceScope} · ${envScope}`, 'caption'),
    mkDivider('inbox_div_top'),
    mkCol('inbox_header_col', ['inbox_icon', 'inbox_eyebrow', 'inbox_title', 'inbox_summary', 'inbox_scope', 'inbox_div_top']),
  ];

  const rowCardIds: string[] = [];
  const rowComponents: A2UIComponent[] = [];
  const rowsData: Array<Record<string, unknown>> = [];

  candidates.forEach((candidate, index) => {
    const candidateId = asText(candidate['id'] ?? candidate['deployment_id'] ?? candidate['request_id'] ?? `approval-${index}`);
    const service = pickText(candidate, ['service_name', 'service', 'service_id'], serviceScope);
    const serviceId = pickText(candidate, ['service_id', 'serviceId'], service);
    const environment = pickText(candidate, ['environment', 'env'], envScope);
    const version = pickText(candidate, ['version', 'target_version', 'current_version'], 'N/A');
    const requestor = pickText(candidate, ['requestor', 'requested_by', 'requestedBy', 'owner'], 'N/A');
    const requestedAt = pickText(candidate, ['requested_at', 'requestedAt', 'created_at', 'submitted_at'], '-');
    const risk = normalizeRiskSummary(candidate);
    const changeSize = pickText(
      candidate,
      ['change_size_summary', 'changeSizeSummary', 'change_size', 'diff_summary', 'change_summary'],
      '변경 규모 정보 없음',
    );
    const recentSignal = pickText(
      candidate,
      ['recent_failure_indicator', 'failure_indicator', 'recentFailureIndicator', 'rollback_indicator', 'recentSignal'],
      '',
    );
    const status = String(candidate['state'] ?? candidate['status'] ?? 'approval_pending');
    const canApprove = pickBool(candidate, ['canApprove'], true);
    const isApproved = ['approved', 'held', 'expired'].includes(status);
    const isRisky = risk.failCount > 0;
    const isActionable = !isApproved && ['approval_pending', 'approval_requested', 'draft'].includes(status);
    const detailPrimary = isRisky || !canApprove || !isActionable;
    const statusText = renderQueueState(status);
    const stateNote = isApproved
      ? '승인완료'
      : isRisky
        ? '실패 신호가 있어 상세 검토를 우선 권장합니다.'
        : '바로 승인할 수 있습니다.';

    const headerId = `inbox_${index}_header`;
    const titleId = `inbox_${index}_title`;
    const statusId = `inbox_${index}_status`;
    const metaId = `inbox_${index}_meta`;
    const requesterId = `inbox_${index}_requester`;
    const riskId = `inbox_${index}_risk`;
    const noteId = `inbox_${index}_note`;
    const rowColId = `inbox_${index}_col`;
    const rowCardId = `inbox_${index}_card`;
    const actionsRowId = `inbox_${index}_actions`;

    rowComponents.push(
      mkIcon(`inbox_${index}_icon`, statusIcon(status)),
      mkText(titleId, `${service} · ${environment} · ${version}`, 'h4'),
      mkText(statusId, statusText, 'caption'),
      mkRow(headerId, [`inbox_${index}_icon`, titleId, statusId], 'spaceBetween'),
      mkText(metaId, `요청 시각: ${requestedAt}`, 'caption'),
      mkText(requesterId, `배포자: ${requestor}`, 'caption'),
      mkText(riskId, `${risk.text} · ${changeSize}${recentSignal ? ` · ${recentSignal}` : ''}`, 'caption'),
      mkText(noteId, stateNote, 'caption'),
    );

    const actionIds: string[] = [];
    if (canApprove && isActionable) {
      rowComponents.push(
        mkText(`inbox_${index}_approve_text`, '승인'),
        mkButton(
          `inbox_${index}_approve_btn`,
          `inbox_${index}_approve_text`,
          'approve_deployment_request',
          {
            requestId: candidateId,
            candidateId,
            deploymentId: pickText(candidate, ['baseline_deployment_id', 'deployment_id'], ''),
            serviceId,
            environment,
            version,
            status,
          },
          !detailPrimary,
        ),
      );
      actionIds.push(`inbox_${index}_approve_btn`);
    }

    rowComponents.push(
      mkText(`inbox_${index}_detail_text`, '상세 보기'),
      mkButton(
        `inbox_${index}_detail_btn`,
        `inbox_${index}_detail_text`,
        'view_deployment_request',
        {
          requestId: candidateId,
          candidateId,
          deploymentId: pickText(candidate, ['baseline_deployment_id', 'deployment_id'], ''),
          serviceId,
          environment,
          version,
          status,
        },
        detailPrimary,
      ),
    );
    actionIds.push(`inbox_${index}_detail_btn`);

    rowComponents.push(
      mkRow(actionsRowId, actionIds, 'end'),
      mkCol(rowColId, [headerId, metaId, requesterId, riskId, noteId, actionsRowId]),
      mkCard(rowCardId, rowColId),
      mkDivider(`inbox_${index}_divider`),
    );
    rowCardIds.push(rowCardId);
    rowsData.push({
      id: candidateId,
      service_id: service,
      environment,
      version,
      status,
      requestor,
      requested_at: requestedAt,
      risk_summary: risk.text,
      change_size_summary: changeSize,
      recent_signal: recentSignal,
    });
  });

  const emptyComponents: A2UIComponent[] = [];
  let emptyChildId = '';
  if (candidates.length === 0) {
    emptyChildId = 'inbox_empty_col';
    emptyComponents.push(
      mkIcon('inbox_empty_icon', 'inbox'),
      mkText('inbox_empty_title', '현재 승인 대기 배포가 없습니다.', 'h4'),
      mkText('inbox_empty_detail', '새 승인 요청이 들어오면 이 카드에서 바로 처리할 수 있습니다.', 'caption'),
      mkText('inbox_empty_action_text', '배포 페이지로 이동'),
      mkButton(
        'inbox_empty_action_btn',
        'inbox_empty_action_text',
        'open_deployments_page',
        { view: 'approval_queue', scope: 'pending' },
        true,
      ),
      mkCol(emptyChildId, ['inbox_empty_icon', 'inbox_empty_title', 'inbox_empty_detail', 'inbox_empty_action_btn']),
    );
  }

  const listChildren = candidates.length > 0 ? rowCardIds : [emptyChildId];

  const components: A2UIComponent[] = [
    ...headerComponents,
    ...rowComponents,
    ...emptyComponents,
    mkList('inbox_list', listChildren, 'vertical'),
    mkCol('main_col', [
      'inbox_header_col',
      'inbox_list',
    ]),
    mkCard('root_card', 'main_col'),
  ];

  return {
    root: 'root_card',
    components,
    data: {
      queue: {
        state: queueState,
        totalCount,
        actionableCount,
        service: serviceScope,
        environment: envScope,
      },
      approvals: rowsData,
    },
  };
}

// ─── 8. Quick Deploy Launchpad ─────────────────────────────────────────────

function quickDeployStateLabel(state: string) {
  switch (state) {
    case 'ready':
      return '이미지 준비 완료';
    case 'artifact_ready':
      return '이미지 준비 완료';
    case 'building':
      return '이미지 생성 중';
    case 'deploying':
      return '배포 진행 중';
    case 'verifying':
      return '결과 확인 중';
    case 'succeeded':
      return '배포 성공';
    case 'failed':
      return '배포 실패';
    case 'rolled_back':
      return '롤백 완료';
    case 'pending':
    default:
      return '대기';
  }
}

function renderQuickDeployProgressBar(percent: number) {
  const width = 16;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.max(0, Math.min(width, Math.round((clamped / 100) * width)));
  return `[${'='.repeat(filled)}${'-'.repeat(width - filled)}] ${clamped}%`;
}

function toQuickDeployServiceSlug(serviceId: string, serviceName: string) {
  const base = serviceId.replace(/^svc_/, '') || serviceName;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'service';
}

function formatQuickDeployImageTag(serviceSlug: string, sourceVersion: string, revision: number) {
  const normalizedVersion = sourceVersion.replace(/^v/, '') || 'latest';
  return `${serviceSlug}:${normalizedVersion}-r${revision}`;
}

function quickDeployLastEventText(runEvents: Array<Record<string, unknown>>) {
  const lastEvent = runEvents[runEvents.length - 1];
  if (!lastEvent) {
    return '아직 실행 이벤트가 없습니다.';
  }

  const stage = asText(lastEvent['stage'], 'event');
  const detail = asText(lastEvent['detail'], '');
  return detail ? `${stage} · ${detail}` : stage;
}

type QuickDeployStepStatus = 'locked' | 'current' | 'complete';

interface QuickDeployUiHints {
  focusStep?: 1 | 2 | 3;
  flashCompletedStep?: 1 | 2 | 3;
  collapseCompletedSteps?: boolean;
  animateProgress?: boolean;
}

interface QuickDeployLocalActionState {
  pendingAction?: string;
  pendingStep?: 1 | 2 | 3;
  label?: string;
}

interface QuickDeployActionFeedback {
  status?: 'idle' | 'pending' | 'success' | 'error';
  message?: string;
}

interface QuickDeployUiState {
  overallState: string;
  progressPercent: number;
  currentStage: string;
  activeStep: 1 | 2 | 3;
  step1: {
    status: QuickDeployStepStatus;
    showAction: boolean;
    showCompletedBadge: boolean;
  };
  step2: {
    status: QuickDeployStepStatus;
    showAction: boolean;
    showCompletedBadge: boolean;
  };
  step3: {
    status: QuickDeployStepStatus;
    showAction: boolean;
    showCompletedBadge: boolean;
    expanded: boolean;
    showRollbackHandoff: boolean;
  };
}

function asQuickDeployUiHints(value: unknown): QuickDeployUiHints | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const focusStep = Number(source['focusStep']);
  const flashCompletedStep = Number(source['flashCompletedStep']);

  return {
    focusStep: focusStep === 1 || focusStep === 2 || focusStep === 3 ? focusStep : undefined,
    flashCompletedStep:
      flashCompletedStep === 1 || flashCompletedStep === 2 || flashCompletedStep === 3
        ? flashCompletedStep
        : undefined,
    collapseCompletedSteps: source['collapseCompletedSteps'] !== false,
    animateProgress: source['animateProgress'] !== false,
  };
}

function quickDeployStageLabel(stage: string): string {
  switch (stage) {
    case 'artifact_ready':
      return '이미지 준비';
    case 'building':
      return '이미지 생성';
    case 'canary_10':
      return '카나리 10%';
    case 'canary_50':
      return '카나리 50%';
    case 'verifying':
      return '검증';
    case 'completed':
      return '완료';
    case 'pending':
      return '대기';
    default:
      return statusLabel(stage);
  }
}

function quickDeployStageDetail(stage: string): string {
  switch (stage) {
    case 'artifact_ready':
      return '배포 가능한 이미지가 준비되었습니다.';
    case 'building':
      return '이미지를 생성 중입니다.';
    case 'canary_10':
      return '첫 롤아웃 구간';
    case 'canary_50':
      return '중간 확장 구간';
    case 'verifying':
      return '안정성 검증 구간';
    case 'completed':
      return '최종 완료';
    case 'pending':
      return '아직 시작하지 않음';
    default:
      return statusLabel(stage);
  }
}

function deriveQuickDeployUiState(input: {
  artifactStatus: string;
  runStatus: string;
  progressPercent: number;
  currentStage: string;
  uiHints?: QuickDeployUiHints | null;
  localActionState?: QuickDeployLocalActionState | null;
}): QuickDeployUiState {
  const terminalRun = ['succeeded', 'failed', 'rolled_back'].includes(input.runStatus);
  const hasRun = Boolean(input.runStatus && input.runStatus !== 'pending');
  const computedActiveStep: 1 | 2 | 3 = hasRun
    ? 3
    : input.artifactStatus === 'ready'
      ? 2
      : 1;
  const hintedStep =
    input.localActionState?.pendingStep ??
    input.uiHints?.focusStep ??
    computedActiveStep;
  const activeStep = Math.max(computedActiveStep, hintedStep) as 1 | 2 | 3;
  const step1Status: QuickDeployStepStatus =
    activeStep > 1 || input.artifactStatus === 'ready' ? 'complete' : 'current';
  const step2Status: QuickDeployStepStatus =
    activeStep > 2 || hasRun
      ? 'complete'
      : activeStep === 2
        ? 'current'
        : 'locked';
  const step3Status: QuickDeployStepStatus =
    activeStep < 3
      ? 'locked'
      : terminalRun
        ? 'complete'
        : 'current';

  return {
    overallState:
      input.runStatus && input.runStatus !== 'pending'
        ? input.runStatus
        : input.artifactStatus || 'pending',
    progressPercent: Math.max(0, Math.min(100, Math.round(input.progressPercent || 0))),
    currentStage: input.currentStage || 'pending',
    activeStep,
    step1: {
      status: step1Status,
      showAction: step1Status === 'current',
      showCompletedBadge: step1Status === 'complete',
    },
    step2: {
      status: step2Status,
      showAction: step2Status === 'current',
      showCompletedBadge: step2Status === 'complete',
    },
    step3: {
      status: step3Status,
      showAction: true,
      showCompletedBadge: step3Status === 'complete',
      expanded: activeStep === 3,
      showRollbackHandoff: terminalRun,
    },
  };
}

function asQuickDeployLocalActionState(
  value: unknown,
): QuickDeployLocalActionState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const pendingStep = Number(source['pendingStep']);

  return {
    pendingAction:
      typeof source['pendingAction'] === 'string' ? String(source['pendingAction']) : undefined,
    pendingStep:
      pendingStep === 1 || pendingStep === 2 || pendingStep === 3 ? pendingStep : undefined,
    label: typeof source['label'] === 'string' ? String(source['label']) : undefined,
  };
}

function asQuickDeployActionFeedback(
  value: unknown,
): QuickDeployActionFeedback | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const status = String(source['status'] ?? '');

  return {
    status:
      status === 'idle' || status === 'pending' || status === 'success' || status === 'error'
        ? status
        : undefined,
    message: typeof source['message'] === 'string' ? String(source['message']) : undefined,
  };
}

function buildQuickDeployProgressComponents(input: {
  progressPercent: number;
  currentStage: string;
  runStatus: string;
}) {
  const milestones = [
    { threshold: 10, percent: '10%', stage: 'canary_10', label: '준비' },
    { threshold: 40, percent: '40%', stage: 'canary_50', label: '확장' },
    { threshold: 70, percent: '70%', stage: 'verifying', label: '검증' },
    { threshold: 85, percent: '85%', stage: 'stabilizing', label: '안정화' },
    { threshold: 100, percent: '100%', stage: 'completed', label: '완료' },
  ];

  const normalizedPercent = Math.max(0, Math.min(100, Math.round(input.progressPercent)));
  const normalizedStage = input.currentStage || 'pending';
  const currentIndex = (() => {
    switch (normalizedStage) {
      case 'canary_10':
        return 0;
      case 'canary_50':
        return 1;
      case 'verifying':
        return 2;
      case 'stabilizing':
        return 3;
      case 'completed':
        return 4;
      default:
        for (let index = milestones.length - 1; index >= 0; index -= 1) {
          if (normalizedPercent >= milestones[index].threshold) {
            return index;
          }
        }
        return 0;
    }
  })();

  const totalSegments = 12;
  const filledSegments = Math.max(0, Math.min(totalSegments, Math.round((normalizedPercent / 100) * totalSegments)));
  const barSegmentIds: string[] = [];
  const laneIds: string[] = [];
  const components: A2UIComponent[] = [
    mkText('launch_progress_title', '진행 바', 'caption'),
    mkText(
      'launch_progress_summary',
      `현재 단계: ${quickDeployStageLabel(normalizedStage)} · ${normalizedPercent}%`,
      'h4',
    ),
    mkText(
      'launch_progress_detail',
      `상태: ${quickDeployStateLabel(input.runStatus)} · ${quickDeployStageDetail(normalizedStage)}`,
      'caption',
    ),
    mkText('launch_progress_track_label', '진행 막대', 'caption'),
  ];

  for (let index = 0; index < totalSegments; index += 1) {
    const isFilled = index < filledSegments;
    const isHead = isFilled && index === filledSegments - 1;
    const symbol = isFilled ? (isHead ? '▣' : '█') : '░';
    const segmentId = `launch_progress_segment_${index}`;
    components.push(mkText(segmentId, symbol, 'caption'));
    barSegmentIds.push(segmentId);
  }

  components.push(mkRow('launch_progress_bar_track', barSegmentIds, 'start'));

  milestones.forEach((milestone, index) => {
    const reached = normalizedPercent >= milestone.threshold;
    const isCurrent = index === currentIndex;
    const iconName = isCurrent
      ? statusIcon('running')
      : reached
        ? statusIcon('succeeded')
        : statusIcon('pending');
    const rowId = `launch_progress_lane_${index}`;
    const infoId = `launch_progress_lane_${index}_info`;

    components.push(
      mkIcon(`launch_progress_lane_${index}_icon`, iconName),
      mkText(`launch_progress_lane_${index}_percent`, milestone.percent, 'caption'),
      mkText(
        `launch_progress_lane_${index}_stage`,
        `${milestone.label} · ${quickDeployStageLabel(milestone.stage)}`,
        'caption',
      ),
      mkText(
        `launch_progress_lane_${index}_state`,
        isCurrent ? '현재' : reached ? '완료' : '대기',
        'caption',
      ),
      mkCol(infoId, [
        `launch_progress_lane_${index}_percent`,
        `launch_progress_lane_${index}_stage`,
        `launch_progress_lane_${index}_state`,
      ]),
      mkRow(rowId, [`launch_progress_lane_${index}_icon`, infoId], 'spaceBetween'),
    );
    laneIds.push(rowId);
  });

  components.push(
    mkDivider('launch_progress_div'),
    mkText('launch_progress_legend', '채워진 칸은 현재까지 완료된 구간입니다.', 'caption'),
    mkRow('launch_progress_lanes', laneIds, 'spaceBetween'),
  );

  return components;
}

function buildQuickDeployInlineRollbackPreview(
  rollbackPreview: Record<string, unknown>,
  serviceName: string,
): { components: A2UIComponent[]; childId: string } | null {
  const candidates = normalizeRollbackCandidates(rollbackPreview).slice(0, 2);
  const childId = 'launch_rollback_inline_col';
  const components: A2UIComponent[] = [
    mkText('launch_rollback_inline_title', '롤백 후보', 'h3'),
    mkText(
      'launch_rollback_inline_detail',
      '배포 실패 직후 바로 이어서 확인할 수 있도록 같은 카드 안에 펼쳐 둡니다.',
      'caption',
    ),
  ];

  if (candidates.length === 0) {
    components.push(
      mkText('launch_rollback_inline_empty', '롤백 가능한 후보가 없습니다.', 'caption'),
      mkCol(childId, [
        'launch_rollback_inline_title',
        'launch_rollback_inline_detail',
        'launch_rollback_inline_empty',
      ]),
    );
    components.push(mkCard('launch_rollback_inline_card', childId));
    return { components, childId: 'launch_rollback_inline_card' };
  }

  const candidateCardIds: string[] = [];

  candidates.forEach((candidate, index) => {
    const candidateId = String(candidate['id'] ?? candidate['deployment_id'] ?? `candidate-${index}`);
    const currentVersion = pickText(candidate, ['version', 'current_version', 'currentVersion']);
    const previousVersion = pickText(candidate, ['previous_version', 'previousVersion', 'target_version']);
    const environment = pickText(candidate, ['environment', 'env'], 'production');
    const status = pickText(candidate, ['state', 'candidate_state', 'rollback_state', 'status'], 'candidate');
    const deployedAt = pickText(candidate, ['deployed_at', 'created_at', 'updated_at', 'started_at'], '');
    const signals = normalizeSignalList(candidate);
    const actionable = candidateActionable(candidate);
    const candidateRole = pickText(candidate, ['candidate_role'], 'history');
    const roleLabel = rollbackCandidateRoleLabel(candidateRole);
    const rowId = `launch_rollback_inline_row_${index}`;
    const actionRowId = `launch_rollback_inline_actions_${index}`;

    components.push(
      mkText(`launch_rollback_inline_${index}_title`, buildCandidateLabel(candidate), 'h4'),
      mkIcon(`launch_rollback_inline_${index}_icon`, statusIcon(status)),
      mkText(`launch_rollback_inline_${index}_status`, candidateStatusLabel(candidate), 'caption'),
      mkRow(`launch_rollback_inline_${index}_header`, [
        `launch_rollback_inline_${index}_title`,
        `launch_rollback_inline_${index}_icon`,
        `launch_rollback_inline_${index}_status`,
      ], 'spaceBetween'),
      mkText(`launch_rollback_inline_${index}_role`, roleLabel, 'caption'),
      mkText(`launch_rollback_inline_${index}_version`, `현재 ${currentVersion} → 이전 ${previousVersion || 'N/A'}`, 'body'),
      mkText(`launch_rollback_inline_${index}_env`, `환경: ${environment}`, 'caption'),
      mkText(`launch_rollback_inline_${index}_time`, deployedAt ? `배포 시각: ${deployedAt}` : '배포 시각: -', 'caption'),
      mkText(
        `launch_rollback_inline_${index}_signals`,
        signals.length > 0 ? `최근 신호: ${signals.join(' · ')}` : '최근 신호: -',
        'caption',
      ),
      mkText(
        `launch_rollback_inline_${index}_note`,
        candidateRole === 'current_target'
          ? '실패한 배포입니다. 이 카드 안에서 바로 롤백을 이어갈 수 있습니다.'
          : candidateRole === 'recovery_target'
            ? '복구될 버전입니다.'
            : previousVersion
              ? '참고용 이전 배포 이력입니다.'
              : '이전 버전이 없어 롤백 불가',
        'caption',
      ),
      mkDivider(`launch_rollback_inline_${index}_divider`),
      mkText(`launch_rollback_inline_${index}_detail_text`, '상세 보기'),
      mkButton(
        `launch_rollback_inline_${index}_detail_btn`,
        `launch_rollback_inline_${index}_detail_text`,
        'view_rollback_candidate',
        {
          candidateId,
          deploymentId: candidateId,
          serviceId: pickText(candidate, ['service_id', 'service', 'service_name'], serviceName),
          environment,
        },
      ),
    );

    const actionChildren = [`launch_rollback_inline_${index}_detail_btn`];
    if (actionable) {
      components.push(
        mkText(`launch_rollback_inline_${index}_rollback_text`, '이 배포 롤백'),
        mkButton(
          `launch_rollback_inline_${index}_rollback_btn`,
          `launch_rollback_inline_${index}_rollback_text`,
          'execute_rollback',
          {
            candidateId,
            deploymentId: candidateId,
            planId: asText(candidate['plan_id'] ?? candidate['rollback_plan_id'] ?? ''),
            serviceId: pickText(candidate, ['service_id', 'service', 'service_name'], serviceName),
            environment,
          },
          true,
        ),
      );
      actionChildren.push(`launch_rollback_inline_${index}_rollback_btn`);
    }

    components.push(
      mkRow(actionRowId, actionChildren, 'end'),
      mkCol(rowId, [
        `launch_rollback_inline_${index}_header`,
        `launch_rollback_inline_${index}_role`,
        `launch_rollback_inline_${index}_version`,
        `launch_rollback_inline_${index}_env`,
        `launch_rollback_inline_${index}_time`,
        `launch_rollback_inline_${index}_signals`,
        `launch_rollback_inline_${index}_note`,
        `launch_rollback_inline_${index}_divider`,
        actionRowId,
      ]),
      mkCard(`launch_rollback_inline_${index}_card`, rowId),
    );
    candidateCardIds.push(`launch_rollback_inline_${index}_card`);
  });

  components.push(
    mkList('launch_rollback_inline_list', candidateCardIds, 'vertical'),
    mkCol(childId, [
      'launch_rollback_inline_title',
      'launch_rollback_inline_detail',
      'launch_rollback_inline_list',
    ]),
    mkCard('launch_rollback_inline_card', childId),
  );

  return { components, childId: 'launch_rollback_inline_card' };
}

export function buildQuickDeployLaunchpadCard(cardData: Record<string, unknown>): A2UICardDef {
  const baseline =
    asRecord(cardData['baseline']) ??
    asRecord(cardData['pipeline']) ??
    asRecord(cardData['deployment']);
  const artifact =
    asRecord(cardData['artifact']) ?? asRecord(baseline ? baseline['artifact'] : null);
  const deployRun =
    asRecord(cardData['deployRun']) ?? asRecord(baseline ? baseline['deployRun'] : null);
  const runEvents = asRecordList(cardData['runEvents'] ?? cardData['events']);

  if (!baseline) {
    return {
      root: 'root_card',
      components: [
        mkText('launch_empty_title', '기준 배포를 찾을 수 없습니다.', 'h2'),
        mkText('launch_empty_detail', 'quick deploy 카드를 렌더링하려면 baseline deployment가 필요합니다.', 'caption'),
        mkCard('root_card', 'launch_empty_col'),
        mkCol('launch_empty_col', ['launch_empty_title', 'launch_empty_detail']),
      ],
      data: {},
    };
  }

  const serviceName = pickText(
    baseline,
    ['serviceName', 'service_name', 'service'],
    '대상 서비스',
  );
  const serviceId = pickText(baseline, ['serviceId', 'service_id'], serviceName);
  const environment = pickText(baseline, ['environment', 'env'], 'production');
  const sourceDeploymentId = pickText(
    baseline,
    ['sourceDeploymentId', 'source_deployment_id', 'baseline_deployment_id', 'id'],
    '',
  );
  const sourceVersion = pickText(
    baseline,
    ['sourceVersion', 'source_version', 'baseline_version', 'version'],
    'latest',
  );
  const strategy = pickText(
    baseline,
    ['strategy', 'suggested_strategy'],
    'canary_10_50_100',
  );
  const artifactStatus = pickText(artifact ?? {}, ['status', 'state'], 'pending');
  const artifactId = pickText(artifact ?? baseline, ['id', 'latest_artifact_id'], '');
  const imageTag = pickText(
    artifact ?? {},
    ['imageTag', 'image_tag'],
    formatQuickDeployImageTag(
      toQuickDeployServiceSlug(serviceId, serviceName),
      sourceVersion,
      1,
    ),
  );
  const imageUri = pickText(
    artifact ?? {},
    ['imageUri', 'image_uri'],
    `registry.local/${imageTag}`,
  );
  const deployRunId = pickText(deployRun ?? baseline, ['id', 'latest_run_id'], '');
  const runStatus = pickText(deployRun ?? {}, ['status'], artifactStatus === 'ready' ? 'pending' : 'pending');
  const progressPercent = Number(
    deployRun?.['progressPercent'] ??
      deployRun?.['progress_percent'] ??
      baseline['progress_percent'] ??
      (artifactStatus === 'ready' ? 20 : 0),
  );
  const currentStage = pickText(
    deployRun ?? baseline,
    ['currentStage', 'current_stage'],
    artifactStatus === 'ready' ? 'artifact_ready' : 'pending',
  );
  const resultDeploymentId = pickText(
    deployRun ?? baseline,
    ['resultDeploymentId', 'result_deployment_id'],
    '',
  );
  const state =
    runStatus === 'succeeded'
      ? 'succeeded'
      : ['failed', 'rolled_back'].includes(runStatus)
        ? 'failed'
        : ['deploying', 'verifying'].includes(runStatus)
          ? 'deploying'
          : artifactStatus === 'ready'
            ? 'artifact_ready'
            : artifactStatus === 'building'
              ? 'building'
              : 'pending';
  const lastMessage = pickText(
    deployRun ?? baseline,
    ['last_message', 'message'],
    runEvents.length > 0
      ? quickDeployLastEventText(runEvents)
      : state === 'pending'
        ? '아직 배포 실행 전입니다.'
        : state === 'artifact_ready'
          ? '이미지가 준비되었습니다.'
          : '배포 파이프라인을 진행 중입니다.',
  );
  const uiHints = asQuickDeployUiHints(cardData['uiHints']);
  const localActionState = asQuickDeployLocalActionState(cardData['localActionState']);
  const actionFeedback = asQuickDeployActionFeedback(cardData['actionFeedback']);
  const rollbackPreview = asRecord(cardData['rollbackPreview']);
  const uiState = deriveQuickDeployUiState({
    artifactStatus,
    runStatus,
    progressPercent,
    currentStage,
    uiHints,
    localActionState,
  });
  const progressComponents = buildQuickDeployProgressComponents({
    progressPercent: uiState.progressPercent,
    currentStage: uiState.currentStage,
    runStatus,
  });
  const inlineRollback = rollbackPreview
    ? buildQuickDeployInlineRollbackPreview(rollbackPreview, serviceName)
    : null;
  const rollbackReady = ['failed', 'rolled_back'].includes(state);
  const stateForIcon = String(state);
  const flashCompletedStep = uiHints?.flashCompletedStep;
  const step3BadgeText = uiState.step3.showCompletedBadge
    ? statusLabel(uiState.overallState)
    : '진행 중';
  const step1ActionText = artifactStatus === 'ready' ? '이미지 재생성' : '이미지 생성';
  const step2ActionText = '배포 시작';
  const isStep1Pending = localActionState?.pendingAction === 'build_deploy_artifact';
  const isStep2Pending = localActionState?.pendingAction === 'start_deploy_run';
  const step1FeedbackMessage =
    actionFeedback?.message ?? (isStep1Pending ? localActionState?.label : undefined);
  const step2FeedbackMessage =
    actionFeedback?.message ?? (isStep2Pending ? localActionState?.label : undefined);

  const headerComponents: A2UIComponent[] = [
    mkIcon('launch_icon', 'rocket_launch'),
    mkText('launch_eyebrow', 'A2UI · quick deploy pipeline', 'caption'),
    mkText('launch_title', '이미지 생성 → 배포 실행 → 결과 확인', 'h2'),
    mkText(
      'launch_summary',
      `${serviceName} · ${environment} · 기준 ${sourceVersion}`,
      'caption',
    ),
    mkText(
      'launch_status',
      `${quickDeployStateLabel(uiState.overallState)} · ${uiState.progressPercent}% · ${quickDeployLastEventText(runEvents)}`,
      'caption',
    ),
    mkDivider('launch_div_top'),
    mkCol('launch_header_col', [
      'launch_icon',
      'launch_eyebrow',
      'launch_title',
      'launch_summary',
      'launch_status',
      'launch_div_top',
    ]),
  ];

  const step1Rows = [
    mkInfoRow('launch_step_1_base', 'dns', '기준 배포', {
      kind: 'text',
      text: sourceDeploymentId || serviceId,
    }),
    mkInfoRow('launch_step_1_img', 'tag', '이미지 태그', {
      kind: 'text',
      text: imageTag,
    }),
    mkInfoRow(
      'launch_step_1_status',
      statusIcon(artifactStatus === 'ready' ? 'succeeded' : artifactStatus === 'building' ? 'running' : artifactStatus),
      'build 상태',
    {
      kind: 'text',
      text: quickDeployStateLabel(artifactStatus),
    }),
  ];

  const step1Components: A2UIComponent[] =
    uiState.step1.status === 'current'
      ? [
          mkText('launch_step_1_label', 'Step 1', 'caption'),
          mkText('launch_step_1_title', '이미지 생성', 'h3'),
          mkText(
            'launch_step_1_detail',
            '기준 배포를 바탕으로 배포 가능한 이미지를 만든 뒤 다음 단계에서 바로 사용합니다.',
            'caption',
          ),
          ...step1Rows.flatMap((row) => row.components),
          mkText('launch_step_1_uri_label', '이미지 URI', 'caption'),
          mkText('launch_step_1_uri', imageUri, 'body'),
          ...(isStep1Pending
            ? [
                mkIcon('launch_step_1_pending_icon', statusIcon('running')),
                mkText(
                  'launch_step_1_pending_text',
                  localActionState?.label ?? '이미지 생성 중...',
                  'caption',
                ),
                mkRow('launch_step_1_pending_row', [
                  'launch_step_1_pending_icon',
                  'launch_step_1_pending_text',
                ], 'start'),
              ]
            : [
                mkText('launch_step_1_action_text', step1ActionText),
                mkButton(
                  'launch_step_1_action_btn',
                  'launch_step_1_action_text',
                  'build_deploy_artifact',
                  {
                    baselineDeploymentId: sourceDeploymentId,
                    deploymentId: sourceDeploymentId,
                    serviceId,
                    environment,
                    sourceVersion,
                  },
                  true,
                ),
              ]),
          ...(step1FeedbackMessage
            ? [mkText('launch_step_1_feedback', step1FeedbackMessage, 'caption')]
            : []),
          mkCol('launch_step_1_col', [
            'launch_step_1_label',
            'launch_step_1_title',
            'launch_step_1_detail',
            ...step1Rows.map((row) => row.rowId),
            'launch_step_1_uri_label',
            'launch_step_1_uri',
            ...(isStep1Pending ? ['launch_step_1_pending_row'] : ['launch_step_1_action_btn']),
            ...(step1FeedbackMessage ? ['launch_step_1_feedback'] : []),
          ]),
          mkCard('launch_step_1_card', 'launch_step_1_col'),
        ]
      : [
          mkText('launch_step_1_label', 'Step 1', 'caption'),
          mkText('launch_step_1_title', '이미지 생성 완료', 'h3'),
          mkText(
            'launch_step_1_done',
            flashCompletedStep === 1
              ? '방금 완료됨'
              : '배포 가능한 이미지가 준비되어 Step 2로 넘어갈 수 있습니다.',
            'caption',
          ),
          mkIcon('launch_step_1_done_icon', 'check_circle'),
          mkText('launch_step_1_done_status', '완료', 'caption'),
          mkText('launch_step_1_uri_label', '이미지 URI', 'caption'),
          mkText('launch_step_1_uri', imageUri, 'body'),
          mkText('launch_step_1_img_label', '이미지 태그', 'caption'),
          mkText('launch_step_1_img', imageTag, 'body'),
          mkCol('launch_step_1_col', [
            'launch_step_1_label',
            'launch_step_1_title',
            'launch_step_1_done',
            'launch_step_1_done_icon',
            'launch_step_1_done_status',
            'launch_step_1_uri_label',
            'launch_step_1_uri',
            'launch_step_1_img_label',
            'launch_step_1_img',
          ]),
          mkCard('launch_step_1_card', 'launch_step_1_col'),
        ];

  const step2Rows = [
    mkInfoRow('launch_step_2_artifact', 'smart_toy', '사용할 이미지', {
      kind: 'text',
      text: imageTag,
    }),
    mkInfoRow('launch_step_2_strategy', 'speed', '배포 전략', {
      kind: 'text',
      text: strategy,
    }),
    mkInfoRow(
      'launch_step_2_status',
      statusIcon(runStatus === 'deploying' || runStatus === 'verifying' ? 'running' : runStatus),
      'run 상태',
    {
      kind: 'text',
      text: quickDeployStateLabel(runStatus),
    }),
  ];

  const step2Components: A2UIComponent[] =
    uiState.step2.status === 'locked'
      ? [
          mkText('launch_step_2_label', 'Step 2', 'caption'),
          mkText('launch_step_2_title', '배포 실행 잠금', 'h3'),
          mkIcon('launch_step_2_locked_icon', 'lock'),
          mkText(
            'launch_step_2_locked_status',
            '대기',
            'caption',
          ),
          mkText(
            'launch_step_2_locked_detail',
            'Step 1에서 배포 이미지를 먼저 만들어야 이 단계가 열립니다.',
            'caption',
          ),
          mkText('launch_step_2_locked_summary', imageTag, 'body'),
          mkCol('launch_step_2_col', [
            'launch_step_2_label',
            'launch_step_2_title',
            'launch_step_2_locked_icon',
            'launch_step_2_locked_status',
            'launch_step_2_locked_detail',
            'launch_step_2_locked_summary',
          ]),
          mkCard('launch_step_2_card', 'launch_step_2_col'),
        ]
      : uiState.step2.status === 'current'
      ? [
          mkText('launch_step_2_label', 'Step 2', 'caption'),
          mkText('launch_step_2_title', '배포 실행', 'h3'),
          mkText(
            'launch_step_2_detail',
            '이미지가 준비되면 즉시 배포를 시작합니다. 승인 단계는 이 카드에서 제외됩니다.',
            'caption',
          ),
          ...step2Rows.flatMap((row) => row.components),
          ...(isStep2Pending
            ? [
                mkIcon('launch_step_2_pending_icon', statusIcon('running')),
                mkText(
                  'launch_step_2_pending_text',
                  localActionState?.label ?? '배포 시작 중...',
                  'caption',
                ),
                mkRow('launch_step_2_pending_row', [
                  'launch_step_2_pending_icon',
                  'launch_step_2_pending_text',
                ], 'start'),
              ]
            : [
                mkText('launch_step_2_action_text', step2ActionText),
                mkButton(
                  'launch_step_2_action_btn',
                  'launch_step_2_action_text',
                  'start_deploy_run',
                  {
                    artifactId,
                    baselineDeploymentId: sourceDeploymentId,
                    deploymentId: sourceDeploymentId,
                    serviceId,
                    environment,
                    strategy,
                  },
                  true,
                ),
              ]),
          ...(step2FeedbackMessage
            ? [mkText('launch_step_2_feedback', step2FeedbackMessage, 'caption')]
            : []),
          mkCol('launch_step_2_col', [
            'launch_step_2_label',
            'launch_step_2_title',
            'launch_step_2_detail',
            ...step2Rows.map((row) => row.rowId),
            ...(isStep2Pending ? ['launch_step_2_pending_row'] : ['launch_step_2_action_btn']),
            ...(step2FeedbackMessage ? ['launch_step_2_feedback'] : []),
          ]),
          mkCard('launch_step_2_card', 'launch_step_2_col'),
        ]
      : [
          mkText('launch_step_2_label', 'Step 2', 'caption'),
          mkText('launch_step_2_title', '배포 실행 완료', 'h3'),
          mkText(
            'launch_step_2_done',
            flashCompletedStep === 2
              ? '방금 배포가 시작됨'
              : '배포가 시작되어 Step 3에서 진행률과 이벤트를 확인합니다.',
            'caption',
          ),
          mkIcon('launch_step_2_done_icon', 'check_circle'),
          mkText('launch_step_2_done_status', '완료', 'caption'),
          mkText('launch_step_2_image_label', '사용한 이미지', 'caption'),
          mkText('launch_step_2_image', imageTag, 'body'),
          mkText('launch_step_2_strategy_label', '배포 전략', 'caption'),
          mkText('launch_step_2_strategy', strategy, 'body'),
          mkCol('launch_step_2_col', [
            'launch_step_2_label',
            'launch_step_2_title',
            'launch_step_2_done',
            'launch_step_2_done_icon',
            'launch_step_2_done_status',
            'launch_step_2_image_label',
            'launch_step_2_image',
            'launch_step_2_strategy_label',
            'launch_step_2_strategy',
          ]),
          mkCard('launch_step_2_card', 'launch_step_2_col'),
        ];

  const eventRows: A2UIComponent[] = [];
  const eventRowIds: string[] = [];
  const recentRunEvents = [...runEvents].slice(-3).reverse();

  if (recentRunEvents.length === 0) {
    eventRows.push(mkText('launch_step_3_empty', '아직 실행 이벤트가 없습니다.', 'caption'));
    eventRowIds.push('launch_step_3_empty');
  } else {
    recentRunEvents.forEach((event, index) => {
      const rowId = `launch_step_3_event_row_${index}`;
      const stage = asText(event['stage'], 'event');
      const detail = asText(event['detail'], '');
      eventRows.push(
        mkIcon(`launch_step_3_event_icon_${index}`, statusIcon(stage)),
        mkText(`launch_step_3_event_stage_${index}`, stage, 'caption'),
        mkText(`launch_step_3_event_detail_${index}`, detail || '-', 'body'),
        mkRow(rowId, [
          `launch_step_3_event_icon_${index}`,
          `launch_step_3_event_stage_${index}`,
          `launch_step_3_event_detail_${index}`,
        ], 'spaceBetween'),
      );
      eventRowIds.push(rowId);
    });
  }

  const step3Components: A2UIComponent[] = uiState.step3.expanded
    ? (() => {
        const step3ActionIds: string[] = ['launch_step_3_detail_btn', 'launch_step_3_refresh_btn'];
        const step3CardChildren: string[] = [
          'launch_step_3_label',
          'launch_step_3_title',
          'launch_step_3_detail',
          'launch_step_3_done_icon',
          'launch_step_3_done_status',
          'launch_progress_title',
          'launch_progress_summary',
          'launch_progress_detail',
          'launch_progress_div',
          'launch_progress_lanes',
          'launch_step_3_state_row',
          'launch_step_3_stage_row',
          'launch_step_3_last_row',
          'launch_step_3_div_events',
          'launch_step_3_events_title',
          ...eventRowIds,
          'launch_step_3_actions',
        ];

        const components: A2UIComponent[] = [
          mkText('launch_step_3_label', 'Step 3', 'caption'),
          mkText('launch_step_3_title', rollbackReady ? '결과 확인 및 롤백 준비' : '결과 확인', 'h3'),
          mkText(
            'launch_step_3_detail',
            rollbackReady
              ? '배포가 실패했습니다. 롤백 후보를 바로 확인할 수 있습니다.'
              : '실행 진행률과 최근 이벤트를 보고 다음 상태 전이를 확인합니다.',
            'caption',
          ),
          mkIcon('launch_step_3_done_icon', uiState.step3.showCompletedBadge ? statusIcon(uiState.overallState) : statusIcon('running')),
          mkText('launch_step_3_done_status', step3BadgeText, 'caption'),
          ...progressComponents,
          ...mkInfoRow('launch_step_3_state', statusIcon(stateForIcon === 'deploying' || stateForIcon === 'verifying' ? 'running' : stateForIcon), '결과', {
            kind: 'text',
            text: quickDeployStateLabel(state),
          }).components,
          ...mkInfoRow('launch_step_3_stage', 'route', '현재 단계', {
            kind: 'text',
            text: quickDeployStageLabel(currentStage),
          }).components,
          ...mkInfoRow('launch_step_3_last', 'history', '최근 메시지', {
            kind: 'text',
            text: lastMessage,
          }).components,
          mkDivider('launch_step_3_div_events'),
          mkText('launch_step_3_events_title', '최근 이벤트', 'h4'),
          ...eventRows,
          mkText('launch_step_3_detail_text', '상세 보기'),
          mkButton(
            'launch_step_3_detail_btn',
            'launch_step_3_detail_text',
            'open_deployments_page',
            {
              deploymentId: resultDeploymentId || sourceDeploymentId,
              deployRunId,
              serviceId,
              environment,
              view: 'quick_deploy_result',
            },
            false,
          ),
          mkText('launch_step_3_refresh_text', '상태 갱신'),
          mkButton(
            'launch_step_3_refresh_btn',
            'launch_step_3_refresh_text',
            'refresh_deploy_status',
            {
              deployRunId,
              deploymentId: resultDeploymentId || sourceDeploymentId,
              serviceId,
              environment,
            },
            true,
          ),
        ];

        if (rollbackReady && !inlineRollback) {
          step3ActionIds.push('launch_step_3_rollback_btn');
          components.push(
            mkText('launch_step_3_rollback_text', '롤백 후보 보기'),
            mkButton(
              'launch_step_3_rollback_btn',
              'launch_step_3_rollback_text',
              'open_rollback_candidates',
              {
                deploymentId: resultDeploymentId || sourceDeploymentId,
                deployRunId,
                serviceId,
                environment,
              },
            ),
          );
        }

        if (inlineRollback) {
          step3CardChildren.push(inlineRollback.childId);
          components.push(...inlineRollback.components);
        }

        components.push(
          mkRow('launch_step_3_actions', step3ActionIds, 'end'),
          mkCol('launch_step_3_col', step3CardChildren),
          mkCard('launch_step_3_card', 'launch_step_3_col'),
        );
        return components;
      })()
    : [
        mkText('launch_step_3_label', 'Step 3', 'caption'),
        mkText('launch_step_3_title', rollbackReady ? '결과 대기 및 롤백 준비' : '결과 확인', 'h3'),
        mkText(
          'launch_step_3_detail',
          rollbackReady
            ? '배포가 실패했습니다. 롤백 후보를 바로 확인할 수 있습니다.'
            : '배포가 시작되면 진행률과 최근 이벤트가 여기에 표시됩니다.',
          'caption',
        ),
        mkText(
          'launch_step_3_summary',
          `${quickDeployStateLabel(uiState.overallState)} · ${uiState.progressPercent}% · ${quickDeployStageLabel(uiState.currentStage)}`,
          'body',
        ),
        mkIcon('launch_step_3_done_icon', uiState.step3.showCompletedBadge ? statusIcon(uiState.overallState) : statusIcon('running')),
        mkText('launch_step_3_done_status', step3BadgeText, 'caption'),
        mkCol('launch_step_3_col', [
          'launch_step_3_label',
          'launch_step_3_title',
          'launch_step_3_detail',
          'launch_step_3_summary',
          'launch_step_3_done_icon',
          'launch_step_3_done_status',
        ]),
        mkCard('launch_step_3_card', 'launch_step_3_col'),
      ];

  const components: A2UIComponent[] = [
    ...headerComponents,
    ...step1Components,
    ...step2Components,
    ...step3Components,
    mkList('launch_steps_list', ['launch_step_1_card', 'launch_step_2_card', 'launch_step_3_card'], 'vertical'),
    mkCol('launch_main_col', [
      'launch_header_col',
      'launch_steps_list',
    ]),
    mkCard('root_card', 'launch_main_col'),
  ];

  return {
    root: 'root_card',
    components,
    data: {
      pipeline: {
        serviceId,
        serviceName,
        environment,
        sourceDeploymentId,
        sourceVersion,
        strategy,
        state: uiState.overallState,
        progressPercent: uiState.progressPercent,
        currentStage: uiState.currentStage,
        lastMessage,
      },
      uiHints: uiHints
        ? {
            focusStep: uiHints.focusStep ?? null,
            flashCompletedStep: uiHints.flashCompletedStep ?? null,
            collapseCompletedSteps: uiHints.collapseCompletedSteps ?? true,
            animateProgress: uiHints.animateProgress ?? true,
          }
        : null,
      localActionState: localActionState
        ? {
            pendingAction: localActionState.pendingAction ?? null,
            pendingStep: localActionState.pendingStep ?? null,
            label: localActionState.label ?? null,
          }
        : null,
      actionFeedback: actionFeedback
        ? {
            status: actionFeedback.status ?? null,
            message: actionFeedback.message ?? null,
          }
        : null,
      artifact: {
        id: artifactId || null,
        imageTag,
        imageUri,
        status: artifactStatus,
      },
      deployRun: {
        id: deployRunId || null,
        status: runStatus,
        progressPercent: uiState.progressPercent,
        currentStage: uiState.currentStage,
        lastMessage,
        resultDeploymentId: resultDeploymentId || null,
      },
      rollbackPreview: rollbackPreview
        ? {
            candidates: normalizeRollbackCandidates(rollbackPreview).map((candidate) => ({
              id: candidate['id'] ?? candidate['deployment_id'] ?? '',
              service_id: pickText(candidate, ['service_id', 'service', 'service_name'], serviceName),
              version: pickText(candidate, ['version', 'current_version', 'currentVersion']),
              previous_version: pickText(candidate, ['previous_version', 'previousVersion', 'target_version']),
              environment: pickText(candidate, ['environment', 'env'], environment),
              status: candidateStatusLabel(candidate),
              candidate_role: pickText(candidate, ['candidate_role'], 'history'),
            })),
          }
        : null,
      runEvents: runEvents.map((event) => ({
        stage: asText(event['stage'], 'event'),
        detail: asText(event['detail'], ''),
        progressPercent: Number(event['progress_percent'] ?? event['progressPercent'] ?? 0),
      })),
    },
  };
}
