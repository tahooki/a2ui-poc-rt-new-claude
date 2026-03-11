// A2UI Bridge — pure data/JSON generation, no React imports
// Returns { root, components, data } ready for <A2UIViewer />

export interface A2UIComponent {
  id: string;
  component: Record<string, unknown>;
}

export interface A2UICardDef {
  root: string;
  components: A2UIComponent[];
  data: Record<string, unknown>;
}

// ─── buildRollbackSummaryCard ────────────────────────────────────────────────

export function buildRollbackSummaryCard(
  deployment: Record<string, unknown>,
  riskChecks: Array<Record<string, unknown>>,
  rollbackPlan: Record<string, unknown> | null,
): A2UICardDef {
  const riskRows: A2UIComponent[] = riskChecks.map((check, i) => {
    const status = check['status'] as string;
    const indicator =
      status === 'pass' ? '[PASS]' : status === 'warn' ? '[WARN]' : '[FAIL]';
    const rowId = `risk_row_${i}`;
    const labelId = `risk_label_${i}`;
    const statusId = `risk_status_${i}`;

    return [
      {
        id: rowId,
        component: {
          Row: { children: [labelId, statusId] },
        },
      },
      {
        id: labelId,
        component: {
          Text: { text: { literal: String(check['check_name'] ?? `Check ${i + 1}`) } },
        },
      },
      {
        id: statusId,
        component: {
          Text: { text: { literal: indicator } },
        },
      },
    ];
  }).flat();

  const riskRowIds = riskChecks.map((_, i) => `risk_row_${i}`);

  // Action buttons based on plan status
  const planStatus = rollbackPlan?.['status'] as string | undefined;
  const deploymentId = String(deployment['id'] ?? '');
  const planId = String(rollbackPlan?.['id'] ?? '');

  const buttonComponents: A2UIComponent[] = [];
  const buttonIds: string[] = [];

  if (!planStatus || planStatus === 'draft') {
    buttonComponents.push({
      id: 'btn_dryrun',
      component: {
        Button: {
          label: { literal: 'Dry-Run 실행' },
          actions: [
            {
              name: 'execute_dry_run',
              context: { deploymentId, planId },
            },
          ],
        },
      },
    });
    buttonIds.push('btn_dryrun');
  }

  if (planStatus === 'dry_run_passed' || planStatus === 'draft') {
    buttonComponents.push({
      id: 'btn_approve',
      component: {
        Button: {
          label: { literal: '승인 요청' },
          actions: [
            {
              name: 'request_approval',
              context: { deploymentId, planId },
            },
          ],
        },
      },
    });
    buttonIds.push('btn_approve');
  }

  if (planStatus === 'approved') {
    buttonComponents.push({
      id: 'btn_rollback',
      component: {
        Button: {
          label: { literal: '롤백 실행' },
          actions: [
            {
              name: 'execute_rollback',
              context: { deploymentId, planId },
            },
          ],
        },
      },
    });
    buttonIds.push('btn_rollback');
  }

  if (buttonIds.length === 0) {
    buttonComponents.push({
      id: 'btn_dryrun',
      component: {
        Button: {
          label: { literal: 'Dry-Run 실행' },
          actions: [
            {
              name: 'execute_dry_run',
              context: { deploymentId, planId },
            },
          ],
        },
      },
    });
    buttonIds.push('btn_dryrun');
  }

  const components: A2UIComponent[] = [
    {
      id: 'root_card',
      component: { Card: { child: 'main_col' } },
    },
    {
      id: 'main_col',
      component: {
        Column: {
          children: [
            'card_title',
            'divider_1',
            'deploy_info_col',
            'divider_2',
            'risk_title',
            'risk_list',
            'divider_3',
            'plan_info_col',
            'btn_row',
          ],
        },
      },
    },
    {
      id: 'card_title',
      component: { Text: { text: { literal: '롤백 판단 요약' } } },
    },
    {
      id: 'divider_1',
      component: { Divider: {} },
    },
    {
      id: 'deploy_info_col',
      component: {
        Column: { children: ['deploy_version_row', 'deploy_service_row', 'deploy_status_row'] },
      },
    },
    {
      id: 'deploy_version_row',
      component: { Row: { children: ['deploy_version_label', 'deploy_version_val'] } },
    },
    {
      id: 'deploy_version_label',
      component: { Text: { text: { literal: '버전:' } } },
    },
    {
      id: 'deploy_version_val',
      component: { Text: { text: { path: '/deployment/version' } } },
    },
    {
      id: 'deploy_service_row',
      component: { Row: { children: ['deploy_service_label', 'deploy_service_val'] } },
    },
    {
      id: 'deploy_service_label',
      component: { Text: { text: { literal: '서비스:' } } },
    },
    {
      id: 'deploy_service_val',
      component: { Text: { text: { path: '/deployment/service_id' } } },
    },
    {
      id: 'deploy_status_row',
      component: { Row: { children: ['deploy_status_label', 'deploy_status_val'] } },
    },
    {
      id: 'deploy_status_label',
      component: { Text: { text: { literal: '상태:' } } },
    },
    {
      id: 'deploy_status_val',
      component: { Text: { text: { path: '/deployment/status' } } },
    },
    {
      id: 'divider_2',
      component: { Divider: {} },
    },
    {
      id: 'risk_title',
      component: { Text: { text: { literal: '위험 체크 결과' } } },
    },
    {
      id: 'risk_list',
      component: { Column: { children: riskRowIds } },
    },
    ...riskRows,
    {
      id: 'divider_3',
      component: { Divider: {} },
    },
    {
      id: 'plan_info_col',
      component: { Column: { children: ['plan_status_row', 'plan_target_row'] } },
    },
    {
      id: 'plan_status_row',
      component: { Row: { children: ['plan_status_label', 'plan_status_val'] } },
    },
    {
      id: 'plan_status_label',
      component: { Text: { text: { literal: '롤백 계획:' } } },
    },
    {
      id: 'plan_status_val',
      component: { Text: { text: { path: '/plan/status' } } },
    },
    {
      id: 'plan_target_row',
      component: { Row: { children: ['plan_target_label', 'plan_target_val'] } },
    },
    {
      id: 'plan_target_label',
      component: { Text: { text: { literal: '대상 버전:' } } },
    },
    {
      id: 'plan_target_val',
      component: { Text: { text: { path: '/plan/target_version' } } },
    },
    {
      id: 'btn_row',
      component: { Row: { children: buttonIds } },
    },
    ...buttonComponents,
  ];

  return {
    root: 'root_card',
    components,
    data: {
      deployment: {
        id: deployment['id'],
        version: deployment['version'],
        service_id: deployment['service_id'],
        status: deployment['status'],
      },
      plan: rollbackPlan
        ? {
            id: rollbackPlan['id'],
            status: rollbackPlan['status'] ?? 'none',
            target_version: rollbackPlan['target_version'] ?? deployment['previous_version'] ?? 'N/A',
          }
        : {
            id: null,
            status: '없음',
            target_version: deployment['previous_version'] ?? 'N/A',
          },
    },
  };
}

// ─── buildEvidenceComparisonCard ─────────────────────────────────────────────

export function buildEvidenceComparisonCard(
  incident: Record<string, unknown>,
  evidence: Array<Record<string, unknown>>,
): A2UICardDef {
  const evidenceRows: A2UIComponent[] = evidence.flatMap((ev, i) => {
    const rowId = `ev_row_${i}`;
    const typeId = `ev_type_${i}`;
    const titleId = `ev_title_${i}`;
    return [
      {
        id: rowId,
        component: { Row: { children: [typeId, titleId] } },
      },
      {
        id: typeId,
        component: { Text: { text: { literal: `[${String(ev['type'] ?? '').toUpperCase()}]` } } },
      },
      {
        id: titleId,
        component: { Text: { text: { literal: String(ev['title'] ?? '제목 없음') } } },
      },
    ];
  });

  const evidenceRowIds = evidence.map((_, i) => `ev_row_${i}`);

  const keyFindings = evidence
    .slice(0, 3)
    .map((ev) => String(ev['title'] ?? ''))
    .filter(Boolean)
    .join(' / ');

  const components: A2UIComponent[] = [
    {
      id: 'root_card',
      component: { Card: { child: 'main_col' } },
    },
    {
      id: 'main_col',
      component: {
        Column: {
          children: [
            'card_title',
            'divider_1',
            'incident_info_col',
            'divider_2',
            'evidence_title',
            'evidence_list',
            'divider_3',
            'findings_row',
          ],
        },
      },
    },
    {
      id: 'card_title',
      component: { Text: { text: { literal: '증거 비교 분석' } } },
    },
    {
      id: 'divider_1',
      component: { Divider: {} },
    },
    {
      id: 'incident_info_col',
      component: {
        Column: { children: ['inc_severity_row', 'inc_status_row', 'inc_service_row'] },
      },
    },
    {
      id: 'inc_severity_row',
      component: { Row: { children: ['inc_severity_label', 'inc_severity_val'] } },
    },
    {
      id: 'inc_severity_label',
      component: { Text: { text: { literal: '심각도:' } } },
    },
    {
      id: 'inc_severity_val',
      component: { Text: { text: { path: '/incident/severity' } } },
    },
    {
      id: 'inc_status_row',
      component: { Row: { children: ['inc_status_label', 'inc_status_val'] } },
    },
    {
      id: 'inc_status_label',
      component: { Text: { text: { literal: '상태:' } } },
    },
    {
      id: 'inc_status_val',
      component: { Text: { text: { path: '/incident/status' } } },
    },
    {
      id: 'inc_service_row',
      component: { Row: { children: ['inc_service_label', 'inc_service_val'] } },
    },
    {
      id: 'inc_service_label',
      component: { Text: { text: { literal: '서비스:' } } },
    },
    {
      id: 'inc_service_val',
      component: { Text: { text: { path: '/incident/service_id' } } },
    },
    {
      id: 'divider_2',
      component: { Divider: {} },
    },
    {
      id: 'evidence_title',
      component: { Text: { text: { literal: `증거 항목 (총 ${evidence.length}개)` } } },
    },
    {
      id: 'evidence_list',
      component: { Column: { children: evidenceRowIds } },
    },
    ...evidenceRows,
    {
      id: 'divider_3',
      component: { Divider: {} },
    },
    {
      id: 'findings_row',
      component: { Row: { children: ['findings_label', 'findings_val'] } },
    },
    {
      id: 'findings_label',
      component: { Text: { text: { literal: '주요 발견:' } } },
    },
    {
      id: 'findings_val',
      component: { Text: { text: { literal: keyFindings || '분석 중' } } },
    },
  ];

  return {
    root: 'root_card',
    components,
    data: {
      incident: {
        id: incident['id'],
        severity: incident['severity'],
        status: incident['status'],
        service_id: incident['service_id'],
      },
    },
  };
}

// ─── buildDryRunStepperCard ───────────────────────────────────────────────────

export function buildDryRunStepperCard(
  rollbackPlan: Record<string, unknown>,
  steps: Array<Record<string, unknown>>,
): A2UICardDef {
  const currentStepOrder = steps.find((s) => s['status'] === 'pending')?.['step_order'] as number | undefined;

  const stepRows: A2UIComponent[] = steps.flatMap((step, i) => {
    const rowId = `step_row_${i}`;
    const numId = `step_num_${i}`;
    const actionId = `step_action_${i}`;
    const statusId = `step_status_${i}`;
    const status = step['status'] as string;
    const indicator =
      status === 'completed'
        ? '[완료]'
        : status === 'running'
          ? '[진행중]'
          : status === 'failed'
            ? '[실패]'
            : '[대기]';
    const isCurrentStep = step['step_order'] === currentStepOrder;
    const stepLabel = isCurrentStep ? `>> ${step['step_order']}` : String(step['step_order'] ?? i + 1);

    return [
      {
        id: rowId,
        component: { Row: { children: [numId, actionId, statusId] } },
      },
      {
        id: numId,
        component: { Text: { text: { literal: stepLabel } } },
      },
      {
        id: actionId,
        component: { Text: { text: { literal: String(step['action'] ?? step['description'] ?? `단계 ${i + 1}`) } } },
      },
      {
        id: statusId,
        component: { Text: { text: { literal: indicator } } },
      },
    ];
  });

  const stepRowIds = steps.map((_, i) => `step_row_${i}`);
  const planId = String(rollbackPlan['id'] ?? '');
  const deploymentId = String(rollbackPlan['deployment_id'] ?? '');

  const components: A2UIComponent[] = [
    {
      id: 'root_card',
      component: { Card: { child: 'main_col' } },
    },
    {
      id: 'main_col',
      component: {
        Column: {
          children: [
            'card_title',
            'divider_1',
            'plan_info_row',
            'divider_2',
            'steps_title',
            'steps_list',
            'divider_3',
            'btn_row',
          ],
        },
      },
    },
    {
      id: 'card_title',
      component: { Text: { text: { literal: 'Dry-Run 단계별 확인' } } },
    },
    {
      id: 'divider_1',
      component: { Divider: {} },
    },
    {
      id: 'plan_info_row',
      component: { Row: { children: ['plan_id_label', 'plan_id_val'] } },
    },
    {
      id: 'plan_id_label',
      component: { Text: { text: { literal: '계획 ID:' } } },
    },
    {
      id: 'plan_id_val',
      component: { Text: { text: { literal: planId } } },
    },
    {
      id: 'divider_2',
      component: { Divider: {} },
    },
    {
      id: 'steps_title',
      component: { Text: { text: { literal: `단계 목록 (총 ${steps.length}단계)` } } },
    },
    {
      id: 'steps_list',
      component: { Column: { children: stepRowIds } },
    },
    ...stepRows,
    {
      id: 'divider_3',
      component: { Divider: {} },
    },
    {
      id: 'btn_row',
      component: { Row: { children: ['btn_next', 'btn_confirm'] } },
    },
    {
      id: 'btn_next',
      component: {
        Button: {
          label: { literal: '다음 단계' },
          actions: [
            {
              name: 'dry_run_next_step',
              context: { planId, deploymentId },
            },
          ],
        },
      },
    },
    {
      id: 'btn_confirm',
      component: {
        Button: {
          label: { literal: '실행 확인' },
          actions: [
            {
              name: 'dry_run_confirm',
              context: { planId, deploymentId },
            },
          ],
        },
      },
    },
  ];

  return {
    root: 'root_card',
    components,
    data: {
      plan: {
        id: rollbackPlan['id'],
        status: rollbackPlan['status'],
        deployment_id: rollbackPlan['deployment_id'],
      },
    },
  };
}

// ─── buildJobSpecReviewCard ───────────────────────────────────────────────────

export function buildJobSpecReviewCard(
  jobRun: Record<string, unknown>,
  template: Record<string, unknown> | null,
  dryRunResult: Record<string, unknown> | null,
): A2UICardDef {
  const spec = jobRun['specParsed'] as Record<string, unknown> | null;
  const specParams = spec ? Object.entries(spec).slice(0, 5) : [];

  const paramRows: A2UIComponent[] = specParams.flatMap(([key, val], i) => {
    const rowId = `param_row_${i}`;
    const keyId = `param_key_${i}`;
    const valId = `param_val_${i}`;
    return [
      {
        id: rowId,
        component: { Row: { children: [keyId, valId] } },
      },
      {
        id: keyId,
        component: { Text: { text: { literal: key } } },
      },
      {
        id: valId,
        component: { Text: { text: { literal: String(val ?? '') } } },
      },
    ];
  });

  const paramRowIds = specParams.map((_, i) => `param_row_${i}`);
  const jobRunId = String(jobRun['id'] ?? '');

  const dryRunComponents: A2UIComponent[] = dryRunResult
    ? [
        { id: 'dryrun_divider', component: { Divider: {} } },
        {
          id: 'dryrun_title',
          component: { Text: { text: { literal: 'Dry-Run 결과' } } },
        },
        {
          id: 'dryrun_status_row',
          component: { Row: { children: ['dryrun_status_label', 'dryrun_status_val'] } },
        },
        {
          id: 'dryrun_status_label',
          component: { Text: { text: { literal: '결과:' } } },
        },
        {
          id: 'dryrun_status_val',
          component: {
            Text: {
              text: {
                literal: dryRunResult['status']
                  ? String(dryRunResult['status'])
                  : '완료',
              },
            },
          },
        },
      ]
    : [];

  const dryRunChildIds = dryRunResult
    ? ['dryrun_divider', 'dryrun_title', 'dryrun_status_row']
    : [];

  const components: A2UIComponent[] = [
    {
      id: 'root_card',
      component: { Card: { child: 'main_col' } },
    },
    {
      id: 'main_col',
      component: {
        Column: {
          children: [
            'card_title',
            'divider_1',
            'template_info_col',
            'divider_2',
            'params_title',
            'params_list',
            ...dryRunChildIds,
            'divider_final',
            'btn_row',
          ],
        },
      },
    },
    {
      id: 'card_title',
      component: { Text: { text: { literal: 'Job Spec 검토' } } },
    },
    {
      id: 'divider_1',
      component: { Divider: {} },
    },
    {
      id: 'template_info_col',
      component: { Column: { children: ['tmpl_name_row', 'tmpl_type_row'] } },
    },
    {
      id: 'tmpl_name_row',
      component: { Row: { children: ['tmpl_name_label', 'tmpl_name_val'] } },
    },
    {
      id: 'tmpl_name_label',
      component: { Text: { text: { literal: '템플릿:' } } },
    },
    {
      id: 'tmpl_name_val',
      component: {
        Text: {
          text: {
            literal: template ? String(template['name'] ?? '알 수 없음') : '알 수 없음',
          },
        },
      },
    },
    {
      id: 'tmpl_type_row',
      component: { Row: { children: ['tmpl_type_label', 'tmpl_type_val'] } },
    },
    {
      id: 'tmpl_type_label',
      component: { Text: { text: { literal: '유형:' } } },
    },
    {
      id: 'tmpl_type_val',
      component: {
        Text: {
          text: {
            literal: template ? String(template['type'] ?? template['job_type'] ?? '알 수 없음') : '알 수 없음',
          },
        },
      },
    },
    {
      id: 'divider_2',
      component: { Divider: {} },
    },
    {
      id: 'params_title',
      component: { Text: { text: { literal: 'Spec 파라미터' } } },
    },
    {
      id: 'params_list',
      component: { Column: { children: paramRowIds } },
    },
    ...paramRows,
    ...dryRunComponents,
    {
      id: 'divider_final',
      component: { Divider: {} },
    },
    {
      id: 'btn_row',
      component: { Row: { children: ['btn_approve', 'btn_execute'] } },
    },
    {
      id: 'btn_approve',
      component: {
        Button: {
          label: { literal: '승인' },
          actions: [{ name: 'approve_job', context: { jobRunId } }],
        },
      },
    },
    {
      id: 'btn_execute',
      component: {
        Button: {
          label: { literal: '실행' },
          actions: [{ name: 'execute_job', context: { jobRunId } }],
        },
      },
    },
  ];

  return {
    root: 'root_card',
    components,
    data: {
      jobRun: {
        id: jobRun['id'],
        status: jobRun['status'],
        progress: jobRun['progress'],
      },
    },
  };
}

// ─── buildReportTemplateCard ──────────────────────────────────────────────────

const REPORT_SECTIONS: Record<string, string[]> = {
  incident_postmortem: [
    '1. 인시던트 요약',
    '2. 타임라인',
    '3. 근본 원인 분석',
    '4. 영향 범위',
    '5. 대응 조치',
    '6. 재발 방지 계획',
  ],
  deployment_review: [
    '1. 배포 개요',
    '2. 변경 사항 요약',
    '3. 위험 체크 결과',
    '4. 롤백 계획',
    '5. 결론 및 권고 사항',
  ],
  weekly_ops: [
    '1. 이번 주 인시던트 현황',
    '2. 배포 현황',
    '3. 주요 지표 변화',
    '4. 다음 주 주요 작업',
  ],
  default: [
    '1. 개요',
    '2. 상세 내용',
    '3. 결론',
  ],
};

export function buildReportTemplateCard(
  incident: Record<string, unknown>,
  reportType: string,
): A2UICardDef {
  const sections = REPORT_SECTIONS[reportType] ?? REPORT_SECTIONS['default'];
  const incidentId = String(incident['id'] ?? '');

  const sectionRows: A2UIComponent[] = sections.flatMap((section, i) => {
    const rowId = `section_row_${i}`;
    const textId = `section_text_${i}`;
    return [
      {
        id: rowId,
        component: { Row: { children: [textId] } },
      },
      {
        id: textId,
        component: { Text: { text: { literal: section } } },
      },
    ];
  });

  const sectionRowIds = sections.map((_, i) => `section_row_${i}`);

  const components: A2UIComponent[] = [
    {
      id: 'root_card',
      component: { Card: { child: 'main_col' } },
    },
    {
      id: 'main_col',
      component: {
        Column: {
          children: [
            'card_title',
            'divider_1',
            'incident_info_col',
            'divider_2',
            'sections_title',
            'sections_list',
            'divider_3',
            'btn_row',
          ],
        },
      },
    },
    {
      id: 'card_title',
      component: { Text: { text: { literal: '보고서 템플릿' } } },
    },
    {
      id: 'divider_1',
      component: { Divider: {} },
    },
    {
      id: 'incident_info_col',
      component: { Column: { children: ['inc_id_row', 'inc_type_row'] } },
    },
    {
      id: 'inc_id_row',
      component: { Row: { children: ['inc_id_label', 'inc_id_val'] } },
    },
    {
      id: 'inc_id_label',
      component: { Text: { text: { literal: '인시던트:' } } },
    },
    {
      id: 'inc_id_val',
      component: { Text: { text: { literal: incidentId } } },
    },
    {
      id: 'inc_type_row',
      component: { Row: { children: ['inc_type_label', 'inc_type_val'] } },
    },
    {
      id: 'inc_type_label',
      component: { Text: { text: { literal: '보고서 유형:' } } },
    },
    {
      id: 'inc_type_val',
      component: { Text: { text: { literal: reportType } } },
    },
    {
      id: 'divider_2',
      component: { Divider: {} },
    },
    {
      id: 'sections_title',
      component: { Text: { text: { literal: '제안 섹션' } } },
    },
    {
      id: 'sections_list',
      component: { Column: { children: sectionRowIds } },
    },
    ...sectionRows,
    {
      id: 'divider_3',
      component: { Divider: {} },
    },
    {
      id: 'btn_row',
      component: { Row: { children: ['btn_generate'] } },
    },
    {
      id: 'btn_generate',
      component: {
        Button: {
          label: { literal: '생성' },
          actions: [
            {
              name: 'generate_report',
              context: { incidentId, reportType },
            },
          ],
        },
      },
    },
  ];

  return {
    root: 'root_card',
    components,
    data: {
      incident: {
        id: incident['id'],
        title: incident['title'],
        severity: incident['severity'],
        service_id: incident['service_id'],
      },
      reportType,
    },
  };
}
