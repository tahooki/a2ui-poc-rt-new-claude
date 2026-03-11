import Database from 'better-sqlite3';

/**
 * Scenario: incident-handover
 * 이미 mitigated된 인시던트 → 핸드오버 보고서 + postmortem 작성
 *
 * 이 시나리오는 다음 데모 흐름을 지원한다:
 *   1. Incidents → mitigated 상태 인시던트 확인
 *   2. Reports → 핸드오버 보고서 생성 (인시던트 링크)
 *   3. 섹션 추가: 현재 상태, 원인 요약, 남은 작업
 *   4. Action items 추가
 *   5. 챗봇 "postmortem 초안 만들어줘" → A2UI Report Template Card
 *   6. 보고서 finalize → export (markdown)
 */
export function seed(db: Database.Database): void {
  // ─── Operators ───────────────────────────────────────────────────────────
  const insertOperator = db.prepare(`
    INSERT OR IGNORE INTO operators (id, name, role, avatar_url, is_active)
    VALUES (@id, @name, @role, @avatar_url, @is_active)
  `);

  insertOperator.run({
    id: 'op_jungsoo_kim',
    name: '김정수',
    role: 'oncall_engineer',
    avatar_url: 'https://api.dicebear.com/7.x/initials/svg?seed=KJS',
    is_active: 1,
  });
  insertOperator.run({
    id: 'op_minji_lee',
    name: '이민지',
    role: 'release_manager',
    avatar_url: 'https://api.dicebear.com/7.x/initials/svg?seed=LMJ',
    is_active: 1,
  });
  insertOperator.run({
    id: 'op_seungho_park',
    name: '박승호',
    role: 'ops_engineer',
    avatar_url: 'https://api.dicebear.com/7.x/initials/svg?seed=PSH',
    is_active: 1,
  });
  insertOperator.run({
    id: 'op_yuna_choi',
    name: '최유나',
    role: 'support_lead',
    avatar_url: 'https://api.dicebear.com/7.x/initials/svg?seed=CYN',
    is_active: 1,
  });

  // ─── Services ─────────────────────────────────────────────────────────────
  const insertService = db.prepare(`
    INSERT OR IGNORE INTO services (id, name, tier, owner)
    VALUES (@id, @name, @tier, @owner)
  `);

  insertService.run({
    id: 'svc_auth',
    name: 'auth-service',
    tier: 'critical',
    owner: 'platform-team',
  });
  insertService.run({
    id: 'svc_user',
    name: 'user-service',
    tier: 'critical',
    owner: 'platform-team',
  });

  // ─── Deployment (rolled back - 미티게이션 원인) ────────────────────────────
  const insertDeployment = db.prepare(`
    INSERT OR IGNORE INTO deployments
      (id, service_id, environment, version, previous_version, status, rollout_percent, deployed_by, created_at, updated_at)
    VALUES
      (@id, @service_id, @environment, @version, @previous_version, @status, @rollout_percent, @deployed_by, @created_at, @updated_at)
  `);

  insertDeployment.run({
    id: 'dep_auth_prod_38',
    service_id: 'svc_auth',
    environment: 'production',
    version: 'v4.2.0',
    previous_version: 'v4.1.9',
    status: 'rolled_back',
    rollout_percent: 100,
    deployed_by: 'op_seungho_park',
    created_at: '2026-03-09T22:00:00Z',
    updated_at: '2026-03-10T00:45:00Z',
  });

  // ─── Incident (mitigated 상태) ────────────────────────────────────────────
  const insertIncident = db.prepare(`
    INSERT OR IGNORE INTO incidents
      (id, title, description, service_id, environment, severity, status, assignee_id, linked_deployment_id, created_at, updated_at)
    VALUES
      (@id, @title, @description, @service_id, @environment, @severity, @status, @assignee_id, @linked_deployment_id, @created_at, @updated_at)
  `);

  insertIncident.run({
    id: 'inc_auth_prod_05',
    title: '[P1] auth-service JWT 검증 실패 급증 → v4.2.0 롤백 완료',
    description:
      'v4.2.0 배포 후 JWT 토큰 검증 실패율이 급증하였습니다. ' +
      '원인: RS256 → ES256 알고리즘 마이그레이션 시 구버전 토큰 호환성 처리 누락. ' +
      'v4.1.9로 롤백하여 서비스 복구. 현재 mitigated 상태이며 postmortem 작성이 필요합니다. ' +
      '영향: 약 23분간 신규 로그인 불가 (기존 세션 사용자는 영향 없음).',
    service_id: 'svc_auth',
    environment: 'production',
    severity: 'critical',
    status: 'mitigated',
    assignee_id: 'op_jungsoo_kim',
    linked_deployment_id: 'dep_auth_prod_38',
    created_at: '2026-03-09T22:18:00Z',
    updated_at: '2026-03-10T00:47:00Z',
  });

  // ─── Incident Events (전체 타임라인) ──────────────────────────────────────
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO incident_events
      (id, incident_id, actor_id, action, detail, created_at)
    VALUES
      (@id, @incident_id, @actor_id, @action, @detail, @created_at)
  `);

  insertEvent.run({
    id: 'iev_05_001',
    incident_id: 'inc_auth_prod_05',
    actor_id: 'op_jungsoo_kim',
    action: 'opened',
    detail: 'Datadog 알림: auth-service JWT validation_failed 비율 0.01% → 34.7% 급증. 인시던트 생성.',
    created_at: '2026-03-09T22:18:00Z',
  });
  insertEvent.run({
    id: 'iev_05_002',
    incident_id: 'inc_auth_prod_05',
    actor_id: 'op_jungsoo_kim',
    action: 'status_changed',
    detail: 'open → investigating. v4.2.0 배포(22:00) 직후 에러 발생. JWT 알고리즘 변경 코드 확인 시작.',
    created_at: '2026-03-09T22:20:00Z',
  });
  insertEvent.run({
    id: 'iev_05_003',
    incident_id: 'inc_auth_prod_05',
    actor_id: 'op_jungsoo_kim',
    action: 'comment',
    detail: '원인 확인: v4.2.0에서 JWT 서명 알고리즘을 RS256 → ES256으로 변경했으나, 기존에 발급된 RS256 토큰에 대한 fallback 검증 로직 누락. 기존 세션 토큰 소유자가 새 요청 시 검증 실패.',
    created_at: '2026-03-09T22:28:00Z',
  });
  insertEvent.run({
    id: 'iev_05_004',
    incident_id: 'inc_auth_prod_05',
    actor_id: 'op_minji_lee',
    action: 'comment',
    detail: 'RM 확인: v4.1.9 롤백 승인. 롤백 후 ES256 토큰 마이그레이션 로직 추가 후 재배포 계획.',
    created_at: '2026-03-09T22:31:00Z',
  });
  insertEvent.run({
    id: 'iev_05_005',
    incident_id: 'inc_auth_prod_05',
    actor_id: 'op_seungho_park',
    action: 'comment',
    detail: '롤백 실행 시작. v4.2.0 → v4.1.9. 예상 소요 시간 10분.',
    created_at: '2026-03-09T22:35:00Z',
  });
  insertEvent.run({
    id: 'iev_05_006',
    incident_id: 'inc_auth_prod_05',
    actor_id: 'op_seungho_park',
    action: 'comment',
    detail: '롤백 완료. JWT 검증 실패율 0.02%로 복구. 신규 로그인 정상.',
    created_at: '2026-03-09T22:45:00Z',
  });
  insertEvent.run({
    id: 'iev_05_007',
    incident_id: 'inc_auth_prod_05',
    actor_id: 'op_jungsoo_kim',
    action: 'status_changed',
    detail: 'investigating → mitigated. 롤백으로 서비스 복구 완료. postmortem 작성 필요.',
    created_at: '2026-03-09T22:47:00Z',
  });

  // ─── Incident Evidence ────────────────────────────────────────────────────
  const insertEvidence = db.prepare(`
    INSERT OR IGNORE INTO incident_evidence
      (id, incident_id, type, title, content, created_at)
    VALUES
      (@id, @incident_id, @type, @title, @content, @created_at)
  `);

  insertEvidence.run({
    id: 'evi_05_error_rate',
    incident_id: 'inc_auth_prod_05',
    type: 'error_rate',
    title: 'JWT 검증 실패율 타임라인 (장애 발생 ~ 복구)',
    content: JSON.stringify({
      unit: 'percent',
      baseline: 0.01,
      datapoints: [
        { time: '2026-03-09T22:00:00Z', value: 0.01, annotation: 'v4.2.0 배포 시작' },
        { time: '2026-03-09T22:10:00Z', value: 0.01 },
        { time: '2026-03-09T22:15:00Z', value: 0.8 },
        { time: '2026-03-09T22:18:00Z', value: 11.3, annotation: '알림 발생' },
        { time: '2026-03-09T22:20:00Z', value: 22.1 },
        { time: '2026-03-09T22:25:00Z', value: 34.7 },
        { time: '2026-03-09T22:30:00Z', value: 34.9 },
        { time: '2026-03-09T22:35:00Z', value: 35.1, annotation: '롤백 시작' },
        { time: '2026-03-09T22:40:00Z', value: 28.3 },
        { time: '2026-03-09T22:45:00Z', value: 1.2, annotation: '롤백 완료' },
        { time: '2026-03-09T22:50:00Z', value: 0.02 },
        { time: '2026-03-09T23:00:00Z', value: 0.01 },
      ],
      summary: '총 장애 지속 시간: 약 27분. 신규 로그인 완전 불가 구간: 22:18 ~ 22:45 (27분). 기존 세션 사용자 영향 없음.',
    }),
    created_at: '2026-03-09T22:50:00Z',
  });

  insertEvidence.run({
    id: 'evi_05_log_sample',
    incident_id: 'inc_auth_prod_05',
    type: 'log_sample',
    title: '장애 구간 JWT 검증 에러 로그 샘플',
    content: JSON.stringify({
      sample_window: '2026-03-09T22:20:00Z ~ 2026-03-09T22:45:00Z',
      top_errors: [
        {
          count: 284910,
          level: 'WARN',
          message: 'jwt: signature verification failed: algorithm mismatch: expected ES256 got RS256',
          labels: {
            service: 'auth-service',
            version: 'v4.2.0',
            endpoint: '/api/v1/auth/verify',
          },
        },
        {
          count: 12,
          level: 'ERROR',
          message: 'critical: jwt public key rotation in progress, some requests may fail',
          labels: {
            service: 'auth-service',
            version: 'v4.2.0',
          },
        },
      ],
    }),
    created_at: '2026-03-09T22:52:00Z',
  });

  // ─── Rollback Plan (executed) ─────────────────────────────────────────────
  const insertRollbackPlan = db.prepare(`
    INSERT OR IGNORE INTO rollback_plans
      (id, deployment_id, target_version, status, created_by, approved_by, dry_run_result, created_at, updated_at)
    VALUES
      (@id, @deployment_id, @target_version, @status, @created_by, @approved_by, @dry_run_result, @created_at, @updated_at)
  `);

  insertRollbackPlan.run({
    id: 'rbp_auth_38_01',
    deployment_id: 'dep_auth_prod_38',
    target_version: 'v4.1.9',
    status: 'executed',
    created_by: 'op_jungsoo_kim',
    approved_by: 'op_minji_lee',
    dry_run_result: JSON.stringify({
      estimated_duration_seconds: 600,
      affected_pods: 8,
      traffic_impact: '롤백 중 약 30초 간 일부 요청 지연 가능 (maxUnavailable: 1)',
      risk_assessment: 'low',
    }),
    created_at: '2026-03-09T22:30:00Z',
    updated_at: '2026-03-09T22:45:00Z',
  });

  // ─── Rollback Steps (모두 done) ───────────────────────────────────────────
  const insertStep = db.prepare(`
    INSERT OR IGNORE INTO rollback_steps
      (id, rollback_plan_id, step_order, action, status, detail)
    VALUES
      (@id, @rollback_plan_id, @step_order, @action, @status, @detail)
  `);

  insertStep.run({
    id: 'rbs_auth_38_01',
    rollback_plan_id: 'rbp_auth_38_01',
    step_order: 1,
    action: 'image_rollback',
    status: 'done',
    detail: 'auth-service v4.2.0 → v4.1.9 이미지 교체 완료',
  });
  insertStep.run({
    id: 'rbs_auth_38_02',
    rollback_plan_id: 'rbp_auth_38_01',
    step_order: 2,
    action: 'health_check',
    status: 'done',
    detail: 'JWT 검증 실패율 0.02% 확인. 정상 복구.',
  });
  insertStep.run({
    id: 'rbs_auth_38_03',
    rollback_plan_id: 'rbp_auth_38_01',
    step_order: 3,
    action: 'notify',
    status: 'done',
    detail: '#auth-incidents 슬랙 공지 완료. 인시던트 mitigated 전이.',
  });

  // ─── Reports (handover: draft, postmortem: draft) ─────────────────────────
  const insertReport = db.prepare(`
    INSERT OR IGNORE INTO reports
      (id, type, title, incident_id, status, created_by, created_at, updated_at)
    VALUES
      (@id, @type, @title, @incident_id, @status, @created_by, @created_at, @updated_at)
  `);

  insertReport.run({
    id: 'rep_auth_05_handover',
    type: 'handover',
    title: '[핸드오버] auth-service JWT 알고리즘 장애 대응 현황 인수인계',
    incident_id: 'inc_auth_prod_05',
    status: 'draft',
    created_by: 'op_jungsoo_kim',
    created_at: '2026-03-10T00:00:00Z',
    updated_at: '2026-03-10T00:30:00Z',
  });

  insertReport.run({
    id: 'rep_auth_05_postmortem',
    type: 'postmortem',
    title: '[Postmortem] auth-service v4.2.0 JWT 알고리즘 마이그레이션 장애',
    incident_id: 'inc_auth_prod_05',
    status: 'draft',
    created_by: 'op_jungsoo_kim',
    created_at: '2026-03-10T01:00:00Z',
    updated_at: '2026-03-10T01:00:00Z',
  });

  // ─── Report Sections (handover) ───────────────────────────────────────────
  const insertSection = db.prepare(`
    INSERT OR IGNORE INTO report_sections
      (id, report_id, section_order, title, content)
    VALUES
      (@id, @report_id, @section_order, @title, @content)
  `);

  insertSection.run({
    id: 'rs_ho_01',
    report_id: 'rep_auth_05_handover',
    section_order: 1,
    title: '현재 상황 요약',
    content:
      '2026-03-09 22:18 발생한 auth-service JWT 검증 실패 장애는 22:47에 v4.1.9 롤백으로 mitigated 되었습니다.\n\n' +
      '- **장애 지속**: 약 29분\n' +
      '- **영향**: 신규 로그인 불가 (기존 세션 사용자 영향 없음)\n' +
      '- **현재 서비스 상태**: 정상 (JWT 검증 실패율 0.01% 이하)\n' +
      '- **롤백 버전**: v4.2.0 → v4.1.9',
  });
  insertSection.run({
    id: 'rs_ho_02',
    report_id: 'rep_auth_05_handover',
    section_order: 2,
    title: '원인 요약',
    content:
      'v4.2.0에서 JWT 서명 알고리즘을 RS256 → ES256으로 변경하였으나, 기존에 발급된 RS256 토큰에 대한 fallback 검증 로직이 누락되었습니다.\n\n' +
      '배포 후 기존 토큰을 가진 사용자가 새 요청 시 알고리즘 불일치로 검증 실패가 발생하였습니다.\n\n' +
      '**근본 원인**: 마이그레이션 계획에서 구버전 토큰 호환성 기간(grace period) 설계가 빠짐.',
  });
  insertSection.run({
    id: 'rs_ho_03',
    report_id: 'rep_auth_05_handover',
    section_order: 3,
    title: '남은 작업 및 다음 단계',
    content:
      '## 즉시 필요한 조치\n' +
      '- [ ] v4.2.1 개발: ES256 + RS256 dual 검증 지원 (호환성 기간 30일)\n' +
      '- [ ] staging 충분한 검증 후 재배포 계획 수립\n\n' +
      '## 인수인계 시 확인 사항\n' +
      '- 현재 서비스 상태: 정상 (모니터링 계속)\n' +
      '- JWT 검증 실패율 대시보드 링크: Datadog > auth-service > jwt_validation\n' +
      '- v4.2.1 PR 진행 중: github.com/company/auth-service/pull/847',
  });

  // ─── Report Action Items (handover) ──────────────────────────────────────
  const insertActionItem = db.prepare(`
    INSERT OR IGNORE INTO report_action_items
      (id, report_id, description, assignee_id, due_date, is_done)
    VALUES
      (@id, @report_id, @description, @assignee_id, @due_date, @is_done)
  `);

  insertActionItem.run({
    id: 'rai_ho_01',
    report_id: 'rep_auth_05_handover',
    description: 'v4.2.1 개발: RS256/ES256 dual 검증 fallback 로직 구현 및 코드 리뷰',
    assignee_id: 'op_seungho_park',
    due_date: '2026-03-12',
    is_done: 0,
  });
  insertActionItem.run({
    id: 'rai_ho_02',
    report_id: 'rep_auth_05_handover',
    description: 'JWT 알고리즘 마이그레이션 가이드라인 문서 작성 (grace period 표준 포함)',
    assignee_id: 'op_minji_lee',
    due_date: '2026-03-14',
    is_done: 0,
  });
  insertActionItem.run({
    id: 'rai_ho_03',
    report_id: 'rep_auth_05_handover',
    description: '릴리즈 체크리스트에 "토큰 호환성 기간 설계" 항목 추가',
    assignee_id: 'op_minji_lee',
    due_date: '2026-03-11',
    is_done: 0,
  });
  insertActionItem.run({
    id: 'rai_ho_04',
    report_id: 'rep_auth_05_handover',
    description: 'postmortem 보고서 작성 및 팀 공유',
    assignee_id: 'op_jungsoo_kim',
    due_date: '2026-03-13',
    is_done: 0,
  });

  // postmortem 섹션 초안 (챗봇이 보완할 수 있는 상태)
  insertSection.run({
    id: 'rs_pm_01',
    report_id: 'rep_auth_05_postmortem',
    section_order: 1,
    title: '인시던트 요약',
    content: '(초안 - 챗봇 지원을 통해 작성 예정)',
  });

  // ─── Audit Logs ───────────────────────────────────────────────────────────
  const insertAudit = db.prepare(`
    INSERT OR IGNORE INTO audit_logs
      (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
    VALUES
      (@id, @request_id, @actor_id, @actor_role, @action_type, @target_type, @target_id, @reason, @result, @created_at)
  `);

  insertAudit.run({
    id: 'aud_ih_001',
    request_id: 'req_ih_001',
    actor_id: 'op_seungho_park',
    actor_role: 'ops_engineer',
    action_type: 'deployment.create',
    target_type: 'deployment',
    target_id: 'dep_auth_prod_38',
    reason: 'auth-service v4.2.0 배포: JWT 알고리즘 RS256 → ES256 마이그레이션',
    result: 'success',
    created_at: '2026-03-09T22:00:00Z',
  });
  insertAudit.run({
    id: 'aud_ih_002',
    request_id: 'req_ih_002',
    actor_id: 'op_jungsoo_kim',
    actor_role: 'oncall_engineer',
    action_type: 'incident.create',
    target_type: 'incident',
    target_id: 'inc_auth_prod_05',
    reason: 'JWT 검증 실패율 34.7% 급증. v4.2.0 배포와 시간적 상관관계 확인.',
    result: 'success',
    created_at: '2026-03-09T22:18:00Z',
  });
  insertAudit.run({
    id: 'aud_ih_003',
    request_id: 'req_ih_003',
    actor_id: 'op_minji_lee',
    actor_role: 'release_manager',
    action_type: 'rollback_plan.approve',
    target_type: 'rollback_plan',
    target_id: 'rbp_auth_38_01',
    reason: 'JWT 검증 실패율 35% 수준. 즉시 롤백 필요. v4.1.9 롤백 승인.',
    result: 'success',
    created_at: '2026-03-09T22:31:00Z',
  });
  insertAudit.run({
    id: 'aud_ih_004',
    request_id: 'req_ih_004',
    actor_id: 'op_seungho_park',
    actor_role: 'ops_engineer',
    action_type: 'rollback_plan.execute',
    target_type: 'rollback_plan',
    target_id: 'rbp_auth_38_01',
    reason: 'RM 승인 완료. v4.2.0 → v4.1.9 롤백 실행.',
    result: 'success',
    created_at: '2026-03-09T22:35:00Z',
  });
  insertAudit.run({
    id: 'aud_ih_005',
    request_id: 'req_ih_005',
    actor_id: 'op_jungsoo_kim',
    actor_role: 'oncall_engineer',
    action_type: 'incident.status_changed',
    target_type: 'incident',
    target_id: 'inc_auth_prod_05',
    reason: '롤백 완료. JWT 검증 실패율 0.02%로 정상 복구. mitigated 전이.',
    result: 'success',
    created_at: '2026-03-09T22:47:00Z',
  });
  insertAudit.run({
    id: 'aud_ih_006',
    request_id: 'req_ih_006',
    actor_id: 'op_jungsoo_kim',
    actor_role: 'oncall_engineer',
    action_type: 'report.create',
    target_type: 'report',
    target_id: 'rep_auth_05_handover',
    reason: '교대 근무 핸드오버 보고서 작성. 다음 온콜에게 현황 전달.',
    result: 'success',
    created_at: '2026-03-10T00:00:00Z',
  });
  insertAudit.run({
    id: 'aud_ih_007',
    request_id: 'req_ih_007',
    actor_id: 'op_jungsoo_kim',
    actor_role: 'oncall_engineer',
    action_type: 'report.create',
    target_type: 'report',
    target_id: 'rep_auth_05_postmortem',
    reason: 'Postmortem 초안 생성. 챗봇 지원으로 작성 예정.',
    result: 'success',
    created_at: '2026-03-10T01:00:00Z',
  });
}
