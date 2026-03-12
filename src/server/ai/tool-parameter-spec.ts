/**
 * 각 A2UI render tool의 파라미터 스펙 정의
 * 2차 AI 호출 시 프롬프트에 포함하여 AI가 올바른 toolArgs를 생성하도록 안내
 */

export interface ToolParameterDef {
  name: string;
  type: 'string' | 'enum';
  description: string;
  enumValues?: string[];
  defaultAlias?: string;
}

export interface ToolParameterSpec {
  toolName: string;
  cardType: string;
  params: ToolParameterDef[];
}

export const TOOL_PARAMETER_SPECS: Record<string, ToolParameterSpec> = {
  renderRollbackCard: {
    toolName: 'renderRollbackCard',
    cardType: 'rollback_summary',
    params: [
      {
        name: 'deploymentId',
        type: 'string',
        description: '롤백 카드를 렌더링할 배포의 ID. latest, recent_deployment 같은 별칭도 허용',
        defaultAlias: 'latest',
      },
    ],
  },
  renderEvidenceCard: {
    toolName: 'renderEvidenceCard',
    cardType: 'evidence_comparison',
    params: [
      {
        name: 'incidentId',
        type: 'string',
        description: '증거 카드를 렌더링할 인시던트의 ID. latest_incident, active_incident 같은 별칭도 허용',
        defaultAlias: 'active_incident',
      },
    ],
  },
  renderDryRunStepperCard: {
    toolName: 'renderDryRunStepperCard',
    cardType: 'dry_run_stepper',
    params: [
      {
        name: 'deploymentId',
        type: 'string',
        description: 'dry-run 카드를 렌더링할 배포의 ID. latest, recent_deployment 같은 별칭도 허용',
        defaultAlias: 'latest',
      },
    ],
  },
  renderConfirmCard: {
    toolName: 'renderConfirmCard',
    cardType: 'confirm_action',
    params: [
      {
        name: 'actionType',
        type: 'enum',
        description: '확인할 작업 유형',
        enumValues: ['rollback', 'job_execute', 'incident_close'],
      },
      {
        name: 'targetId',
        type: 'string',
        description: '작업 대상 ID (배포 ID, Job ID, 또는 인시던트 ID)',
        defaultAlias: 'latest',
      },
    ],
  },
  renderJobReviewCard: {
    toolName: 'renderJobReviewCard',
    cardType: 'job_spec_review',
    params: [
      {
        name: 'jobRunId',
        type: 'string',
        description: 'Job spec 검토 카드를 렌더링할 잡 실행의 ID. latest_job, current_job 같은 별칭도 허용',
        defaultAlias: 'latest_job',
      },
    ],
  },
  renderReportTemplateCard: {
    toolName: 'renderReportTemplateCard',
    cardType: 'report_template',
    params: [
      {
        name: 'incidentId',
        type: 'string',
        description: '보고서 대상 인시던트의 ID. latest_incident, active_incident 같은 별칭도 허용',
        defaultAlias: 'active_incident',
      },
      {
        name: 'reportType',
        type: 'enum',
        description: '보고서 유형',
        enumValues: ['incident_postmortem', 'deployment_review', 'weekly_ops', 'default'],
      },
    ],
  },
};

export function getToolParameterSpec(toolName: string): ToolParameterSpec | null {
  return TOOL_PARAMETER_SPECS[toolName] ?? null;
}

export function formatToolParamSpecForPrompt(spec: ToolParameterSpec): string {
  const paramLines = spec.params.map((p) => {
    let line = `  - ${p.name} (${p.type}): ${p.description}`;
    if (p.enumValues) {
      line += `\n    허용 값: ${p.enumValues.join(', ')}`;
    }
    if (p.defaultAlias) {
      line += `\n    ID를 특정할 수 없으면 "${p.defaultAlias}" 사용`;
    }
    return line;
  });

  return [
    `tool: ${spec.toolName}`,
    `cardType: ${spec.cardType}`,
    '파라미터:',
    ...paramLines,
  ].join('\n');
}
