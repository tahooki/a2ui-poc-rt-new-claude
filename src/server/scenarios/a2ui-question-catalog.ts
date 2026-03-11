import type { A2UITemplateToolName } from '@/server/ai/template-config';
import type { ScenarioId } from '@/server/scenarios';
import type { OperatorRole } from '@/types/domain';

export type ScenarioQuestionPage =
  | 'dashboard'
  | 'incidents'
  | 'deployments'
  | 'jobs'
  | 'reports';

export interface A2UIScenarioQuestionCase {
  id: string;
  scenarioId: ScenarioId;
  page: ScenarioQuestionPage;
  operatorRole: OperatorRole;
  question: string;
  expectedToolName: A2UITemplateToolName;
  expectedCardType:
    | 'rollback_summary'
    | 'evidence_comparison'
    | 'dry_run_stepper'
    | 'confirm_action'
    | 'job_spec_review'
    | 'report_template';
  toolArgs: Record<string, unknown>;
  note?: string;
}

export const A2UI_SCENARIO_QUESTION_CASES: A2UIScenarioQuestionCase[] = [
  {
    id: 'checkout-rollback-summary',
    scenarioId: 'checkout-5xx',
    page: 'deployments',
    operatorRole: 'release_manager',
    question: 'checkout 배포 리스크를 요약하고 롤백해야 하는지 카드로 보여줘',
    expectedToolName: 'renderRollbackCard',
    expectedCardType: 'rollback_summary',
    toolArgs: { deploymentId: 'dep_checkout_prod_42' },
    note: 'dep_checkout_prod_42 기준 롤백 판단 요약 카드',
  },
  {
    id: 'checkout-evidence-comparison',
    scenarioId: 'checkout-5xx',
    page: 'incidents',
    operatorRole: 'oncall_engineer',
    question: '현재 인시던트의 로그, 메트릭, trace 증거 비교 카드로 보여줘',
    expectedToolName: 'renderEvidenceCard',
    expectedCardType: 'evidence_comparison',
    toolArgs: { incidentId: 'inc_checkout_prod_01' },
    note: 'inc_checkout_prod_01 기준 증거 비교 카드',
  },
  {
    id: 'checkout-dry-run-stepper',
    scenarioId: 'checkout-5xx',
    page: 'deployments',
    operatorRole: 'release_manager',
    question: '롤백 dry-run 단계 진행 상황을 stepper로 보여줘',
    expectedToolName: 'renderDryRunStepperCard',
    expectedCardType: 'dry_run_stepper',
    toolArgs: { deploymentId: 'dep_checkout_prod_42' },
    note: 'rbp_checkout_42_01 기준 dry-run stepper 카드',
  },
  {
    id: 'checkout-confirm-rollback',
    scenarioId: 'checkout-5xx',
    page: 'deployments',
    operatorRole: 'release_manager',
    question: '롤백 실행 전에 확인해야 할 체크리스트 카드로 보여줘',
    expectedToolName: 'renderConfirmCard',
    expectedCardType: 'confirm_action',
    toolArgs: { actionType: 'rollback', targetId: 'dep_checkout_prod_42' },
    note: '롤백 전 최종 확인 카드',
  },
  {
    id: 'billing-job-review',
    scenarioId: 'billing-backfill',
    page: 'jobs',
    operatorRole: 'ops_engineer',
    question: '이 backfill job spec 검토 카드로 보여줘',
    expectedToolName: 'renderJobReviewCard',
    expectedCardType: 'job_spec_review',
    toolArgs: { jobRunId: 'job_billing_backfill_01' },
    note: 'job_billing_backfill_01 기준 Job Spec Review 카드',
  },
  {
    id: 'billing-job-confirm',
    scenarioId: 'billing-backfill',
    page: 'jobs',
    operatorRole: 'ops_engineer',
    question: '잡 실행 전에 확인해야 할 체크리스트 카드로 보여줘',
    expectedToolName: 'renderConfirmCard',
    expectedCardType: 'confirm_action',
    toolArgs: { actionType: 'job_execute', targetId: 'job_billing_backfill_01' },
    note: '백필 job 실행 전 체크리스트 카드',
  },
  {
    id: 'healthy-rollout-summary',
    scenarioId: 'healthy-rollout',
    page: 'deployments',
    operatorRole: 'release_manager',
    question: '현재 search staging 배포 리스크를 카드로 요약해줘',
    expectedToolName: 'renderRollbackCard',
    expectedCardType: 'rollback_summary',
    toolArgs: { deploymentId: 'dep_search_stg_17' },
    note: 'dep_search_stg_17 기준 정상 rollout 요약 카드',
  },
  {
    id: 'healthy-confirm-rollout',
    scenarioId: 'healthy-rollout',
    page: 'deployments',
    operatorRole: 'release_manager',
    question: '이 배포를 계속 진행하기 전에 확인해야 할 체크리스트 카드로 보여줘',
    expectedToolName: 'renderConfirmCard',
    expectedCardType: 'confirm_action',
    toolArgs: { actionType: 'rollback', targetId: 'dep_search_stg_17' },
    note: '정상 rollout 상황에서도 확인 카드가 나오는지 검증',
  },
  {
    id: 'handover-report-template',
    scenarioId: 'incident-handover',
    page: 'reports',
    operatorRole: 'support_lead',
    question: 'postmortem 초안 템플릿 카드로 보여줘',
    expectedToolName: 'renderReportTemplateCard',
    expectedCardType: 'report_template',
    toolArgs: { incidentId: 'inc_auth_prod_05', reportType: 'incident_postmortem' },
    note: 'inc_auth_prod_05 기준 postmortem 템플릿 카드',
  },
  {
    id: 'handover-evidence-comparison',
    scenarioId: 'incident-handover',
    page: 'incidents',
    operatorRole: 'oncall_engineer',
    question: '현재 장애 증거를 비교 분석하는 카드로 보여줘',
    expectedToolName: 'renderEvidenceCard',
    expectedCardType: 'evidence_comparison',
    toolArgs: { incidentId: 'inc_auth_prod_05' },
    note: 'mitigated 인시던트 증거 비교 카드',
  },
  {
    id: 'handover-confirm-close',
    scenarioId: 'incident-handover',
    page: 'incidents',
    operatorRole: 'support_lead',
    question: '이 인시던트를 닫기 전에 확인해야 할 체크리스트 카드로 보여줘',
    expectedToolName: 'renderConfirmCard',
    expectedCardType: 'confirm_action',
    toolArgs: { actionType: 'incident_close', targetId: 'inc_auth_prod_05' },
    note: '인시던트 종료 전 확인 카드',
  },
];

export function listScenarioA2UIQuestionCases(
  scenarioId: ScenarioId,
  page?: string,
) {
  return A2UI_SCENARIO_QUESTION_CASES.filter((item) => {
    if (item.scenarioId !== scenarioId) return false;
    if (page && item.page !== page) return false;
    return true;
  });
}

export function listScenarioQuestionSuggestions(
  scenarioId: ScenarioId,
  page?: string,
  limit = 4,
) {
  return listScenarioA2UIQuestionCases(scenarioId, page).slice(0, limit);
}
