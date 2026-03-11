import Database from 'better-sqlite3';

/**
 * Scenario: billing-backfill
 * billing 파트너 quota 동기화 실패 → backfill job 실행 필요
 *
 * 이 시나리오는 다음 데모 흐름을 지원한다:
 *   1. Jobs → billing_partner_quota_backfill 템플릿 선택
 *   2. Spec 입력: fromDate, toDate, targetMerchantIds
 *   3. Dry-run → sample rows, 예상 건수, 비용 확인
 *   4. 챗봇 "이 job spec 맞는지 확인해줘" → A2UI Job Spec Review Card
 *   5. Production이므로 RM 승인 → 실행
 */
export function seed(db: Database.Database): void {
  // ─── Operators (공통 - 이미 존재하면 IGNORE) ─────────────────────────────
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
    id: 'svc_billing',
    name: 'billing-service',
    tier: 'critical',
    owner: 'billing-team',
  });
  insertService.run({
    id: 'svc_partner_gateway',
    name: 'partner-gateway',
    tier: 'standard',
    owner: 'partner-team',
  });

  // ─── Incident (낮은 심각도 - customer impact는 낮지만 운영 부담 높음) ──────
  const insertIncident = db.prepare(`
    INSERT OR IGNORE INTO incidents
      (id, title, description, service_id, environment, severity, status, assignee_id, linked_deployment_id, created_at, updated_at)
    VALUES
      (@id, @title, @description, @service_id, @environment, @severity, @status, @assignee_id, @linked_deployment_id, @created_at, @updated_at)
  `);

  insertIncident.run({
    id: 'inc_billing_prod_07',
    title: '[P3] billing-service 파트너 quota 동기화 실패 (2일치 누락)',
    description:
      '2026-03-08 04:00 ~ 2026-03-10 04:00 (48시간) 동안 partner-gateway → billing-service quota 동기화 배치가 반복 실패하였습니다. ' +
      '원인: partner-gateway의 rate limit API 응답 형식 변경(v2 → v3)으로 인해 파싱 오류 발생. ' +
      '고객 결제는 정상이나 파트너사 quota 리포팅이 2일치 미반영 상태입니다. ' +
      'billing-team이 수동 backfill job 실행을 요청하였습니다.',
    service_id: 'svc_billing',
    environment: 'production',
    severity: 'medium',
    status: 'investigating',
    assignee_id: 'op_seungho_park',
    linked_deployment_id: null,
    created_at: '2026-03-10T04:30:00Z',
    updated_at: '2026-03-10T05:00:00Z',
  });

  // ─── Incident Events ──────────────────────────────────────────────────────
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO incident_events
      (id, incident_id, actor_id, action, detail, created_at)
    VALUES
      (@id, @incident_id, @actor_id, @action, @detail, @created_at)
  `);

  insertEvent.run({
    id: 'iev_07_001',
    incident_id: 'inc_billing_prod_07',
    actor_id: 'op_seungho_park',
    action: 'opened',
    detail: 'billing-team 슬랙 #billing-alerts에서 quota 동기화 실패 알림 48회 누적 확인. 인시던트 생성.',
    created_at: '2026-03-10T04:30:00Z',
  });
  insertEvent.run({
    id: 'iev_07_002',
    incident_id: 'inc_billing_prod_07',
    actor_id: 'op_seungho_park',
    action: 'status_changed',
    detail: 'open → investigating. partner-gateway 로그에서 rate limit API v3 파싱 오류 확인.',
    created_at: '2026-03-10T04:45:00Z',
  });
  insertEvent.run({
    id: 'iev_07_003',
    incident_id: 'inc_billing_prod_07',
    actor_id: 'op_seungho_park',
    action: 'comment',
    detail: '영향 범위 확인: 파트너 347개사, 미반영 quota 트랜잭션 약 18,400건. 고객 결제 차단 없음. backfill job으로 데이터 복구 가능.',
    created_at: '2026-03-10T05:00:00Z',
  });

  // ─── Job Template ─────────────────────────────────────────────────────────
  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO job_templates
      (id, name, type, description, spec_schema)
    VALUES
      (@id, @name, @type, @description, @spec_schema)
  `);

  insertTemplate.run({
    id: 'jt_billing_quota_backfill',
    name: '파트너 Quota 백필',
    type: 'backfill',
    description:
      '파트너 quota 동기화 실패 구간의 데이터를 partner-gateway API를 통해 재수집하여 billing-service에 반영합니다. ' +
      '대상 기간과 파트너 ID 목록을 지정하면 해당 구간의 quota 트랜잭션을 배치로 재처리합니다.',
    spec_schema: JSON.stringify({
      type: 'object',
      required: ['fromDate', 'toDate', 'batchSize'],
      properties: {
        fromDate: {
          type: 'string',
          format: 'date',
          title: '시작 날짜',
          description: '백필 대상 시작 날짜 (YYYY-MM-DD)',
          example: '2026-03-08',
        },
        toDate: {
          type: 'string',
          format: 'date',
          title: '종료 날짜',
          description: '백필 대상 종료 날짜 (YYYY-MM-DD, 포함)',
          example: '2026-03-09',
        },
        targetMerchantIds: {
          type: 'array',
          items: { type: 'string' },
          title: '대상 파트너 ID 목록',
          description: '비워두면 전체 파트너 대상. 특정 파트너만 지정 가능.',
          maxItems: 500,
        },
        batchSize: {
          type: 'integer',
          title: '배치 크기',
          description: '한 번에 처리할 트랜잭션 수 (기본값: 100)',
          default: 100,
          minimum: 10,
          maximum: 500,
        },
        dryRun: {
          type: 'boolean',
          title: 'Dry-run 모드',
          description: 'true이면 실제 반영 없이 대상 건수만 계산',
          default: false,
        },
      },
    }),
  });

  // 추가 템플릿: 재사용성을 위해 2개 더
  insertTemplate.run({
    id: 'jt_audit_log_cleanup',
    name: '감사 로그 정리',
    type: 'cleanup',
    description: '보관 기간(기본 90일)이 지난 감사 로그를 아카이브하고 원본 테이블에서 삭제합니다.',
    spec_schema: JSON.stringify({
      type: 'object',
      required: ['retentionDays'],
      properties: {
        retentionDays: {
          type: 'integer',
          title: '보관 기간 (일)',
          default: 90,
          minimum: 30,
        },
        archiveBucket: {
          type: 'string',
          title: 'S3 아카이브 버킷',
          default: 's3://ops-audit-archive',
        },
      },
    }),
  });

  insertTemplate.run({
    id: 'jt_payment_event_replay',
    name: '결제 이벤트 재처리',
    type: 'replay',
    description: '처리 실패한 결제 이벤트를 DLQ에서 재처리합니다.',
    spec_schema: JSON.stringify({
      type: 'object',
      required: ['queueName', 'fromTime', 'toTime'],
      properties: {
        queueName: {
          type: 'string',
          title: 'DLQ 이름',
          enum: ['payment-events-dlq', 'billing-events-dlq'],
        },
        fromTime: { type: 'string', format: 'date-time', title: '시작 시각' },
        toTime: { type: 'string', format: 'date-time', title: '종료 시각' },
        maxMessages: { type: 'integer', default: 1000, title: '최대 재처리 건수' },
      },
    }),
  });

  // ─── Job Run (draft 상태 - 데모 시작 지점) ────────────────────────────────
  const insertJobRun = db.prepare(`
    INSERT OR IGNORE INTO job_runs
      (id, template_id, service_id, environment, spec, status, dry_run_result, created_by, approved_by, progress, created_at, updated_at)
    VALUES
      (@id, @template_id, @service_id, @environment, @spec, @status, @dry_run_result, @created_by, @approved_by, @progress, @created_at, @updated_at)
  `);

  insertJobRun.run({
    id: 'job_billing_backfill_01',
    template_id: 'jt_billing_quota_backfill',
    service_id: 'svc_billing',
    environment: 'production',
    spec: JSON.stringify({
      fromDate: '2026-03-08',
      toDate: '2026-03-09',
      targetMerchantIds: [],
      batchSize: 100,
      dryRun: false,
    }),
    status: 'draft',
    dry_run_result: null,
    created_by: 'op_seungho_park',
    approved_by: null,
    progress: 0,
    created_at: '2026-03-10T05:10:00Z',
    updated_at: '2026-03-10T05:10:00Z',
  });

  // ─── Job Run Events ───────────────────────────────────────────────────────
  const insertJobEvent = db.prepare(`
    INSERT OR IGNORE INTO job_run_events
      (id, job_run_id, type, detail, created_at)
    VALUES
      (@id, @job_run_id, @type, @detail, @created_at)
  `);

  insertJobEvent.run({
    id: 'jre_bb_001',
    job_run_id: 'job_billing_backfill_01',
    type: 'created',
    detail: JSON.stringify({
      message: 'billing-team 요청으로 파트너 quota 백필 job 생성',
      incident_ref: 'inc_billing_prod_07',
      created_by: 'op_seungho_park',
    }),
    created_at: '2026-03-10T05:10:00Z',
  });

  // ─── Audit Logs ───────────────────────────────────────────────────────────
  const insertAudit = db.prepare(`
    INSERT OR IGNORE INTO audit_logs
      (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
    VALUES
      (@id, @request_id, @actor_id, @actor_role, @action_type, @target_type, @target_id, @reason, @result, @created_at)
  `);

  insertAudit.run({
    id: 'aud_bb_001',
    request_id: 'req_bb_001',
    actor_id: 'op_seungho_park',
    actor_role: 'ops_engineer',
    action_type: 'incident.create',
    target_type: 'incident',
    target_id: 'inc_billing_prod_07',
    reason: '파트너 quota 동기화 48시간 실패. billing-team 요청.',
    result: 'success',
    created_at: '2026-03-10T04:30:00Z',
  });
  insertAudit.run({
    id: 'aud_bb_002',
    request_id: 'req_bb_002',
    actor_id: 'op_seungho_park',
    actor_role: 'ops_engineer',
    action_type: 'job.create',
    target_type: 'job_run',
    target_id: 'job_billing_backfill_01',
    reason: 'inc_billing_prod_07 대응. 2일치 quota 데이터 백필 목적.',
    result: 'success',
    created_at: '2026-03-10T05:10:00Z',
  });
}
