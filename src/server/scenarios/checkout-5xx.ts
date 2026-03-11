import Database from 'better-sqlite3';

/**
 * Scenario: checkout-5xx
 * checkout 서비스 production 5xx 에러 급증 → 배포 v2.4.1 실패 → rollback 후보 v2.3.8
 *
 * 이 시나리오는 다음 데모 흐름을 지원한다:
 *   1. Dashboard → 활성 인시던트 확인
 *   2. Incidents → inc_checkout_prod_01 상세 조사
 *   3. Evidence 탭 → 에러 패턴 확인
 *   4. Linked deployment dep_checkout_prod_42 확인
 *   5. Deployments → diff viewer, risk checks 확인
 *   6. 챗봇 "이거 롤백해야 해?" → A2UI Rollback Summary Card
 *   7. Rollback dry-run → RM 승인 → 실행
 *   8. Reports → postmortem 초안
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
    id: 'svc_checkout',
    name: 'checkout-service',
    tier: 'critical',
    owner: 'platform-team',
  });
  insertService.run({
    id: 'svc_payment',
    name: 'payment-service',
    tier: 'critical',
    owner: 'payment-team',
  });
  insertService.run({
    id: 'svc_cart',
    name: 'cart-service',
    tier: 'standard',
    owner: 'platform-team',
  });
  insertService.run({
    id: 'svc_notification',
    name: 'notification-service',
    tier: 'standard',
    owner: 'infra-team',
  });

  // ─── Deployment (failed) ──────────────────────────────────────────────────
  const insertDeployment = db.prepare(`
    INSERT OR IGNORE INTO deployments
      (id, service_id, environment, version, previous_version, status, rollout_percent, deployed_by, created_at, updated_at)
    VALUES
      (@id, @service_id, @environment, @version, @previous_version, @status, @rollout_percent, @deployed_by, @created_at, @updated_at)
  `);

  insertDeployment.run({
    id: 'dep_checkout_prod_42',
    service_id: 'svc_checkout',
    environment: 'production',
    version: 'v2.4.1',
    previous_version: 'v2.3.8',
    status: 'failed',
    rollout_percent: 100,
    deployed_by: 'op_seungho_park',
    created_at: '2026-03-10T02:15:00Z',
    updated_at: '2026-03-10T02:47:00Z',
  });

  // previous successful deployment for context
  insertDeployment.run({
    id: 'dep_checkout_prod_41',
    service_id: 'svc_checkout',
    environment: 'production',
    version: 'v2.3.8',
    previous_version: 'v2.3.7',
    status: 'succeeded',
    rollout_percent: 100,
    deployed_by: 'op_seungho_park',
    created_at: '2026-03-08T10:00:00Z',
    updated_at: '2026-03-08T10:30:00Z',
  });

  // ─── Deployment Diffs ─────────────────────────────────────────────────────
  const insertDiff = db.prepare(`
    INSERT OR IGNORE INTO deployment_diffs
      (id, deployment_id, file_path, change_type, additions, deletions, content)
    VALUES
      (@id, @deployment_id, @file_path, @change_type, @additions, @deletions, @content)
  `);

  insertDiff.run({
    id: 'diff_42_01',
    deployment_id: 'dep_checkout_prod_42',
    file_path: 'src/checkout/cart_handler.go',
    change_type: 'modified',
    additions: 47,
    deletions: 12,
    content: JSON.stringify({
      hunks: [
        {
          header: '@@ -128,12 +128,47 @@',
          lines: [
            ' func (h *CartHandler) ProcessGuestCart(ctx context.Context, req *CartRequest) (*CartResponse, error) {',
            '-\tsession, err := h.sessionStore.Get(req.SessionID)',
            '+\tsession, err := h.sessionStore.GetWithFallback(req.SessionID, req.GuestToken)',
            '+\tif err != nil && !errors.Is(err, ErrSessionNotFound) {',
            '+\t\treturn nil, fmt.Errorf("session lookup failed: %w", err)',
            '+\t}',
            '+\t// NEW: guest cart migration logic',
            '+\tif session == nil && req.GuestToken != "" {',
            '+\t\tsession, err = h.migrateGuestSession(ctx, req.GuestToken)',
            '+\t\tif err != nil {',
            '+\t\t\th.metrics.Inc("guest_cart_migration_error")',
            '+\t\t\treturn nil, fmt.Errorf("guest cart migration: %w", err)',
            '+\t\t}',
            '+\t}',
            ' \titems, err := h.cartRepo.GetItems(ctx, session.ID)',
          ],
        },
      ],
    }),
  });

  insertDiff.run({
    id: 'diff_42_02',
    deployment_id: 'dep_checkout_prod_42',
    file_path: 'config/feature_flags.yaml',
    change_type: 'modified',
    additions: 3,
    deletions: 1,
    content: JSON.stringify({
      hunks: [
        {
          header: '@@ -42,4 +42,6 @@',
          lines: [
            ' feature_flags:',
            '-  guest_cart_v2: false',
            '+  guest_cart_v2: true',
            '+  guest_cart_migration_batch_size: 500',
            '+  guest_cart_session_ttl_minutes: 30',
          ],
        },
      ],
    }),
  });

  insertDiff.run({
    id: 'diff_42_03',
    deployment_id: 'dep_checkout_prod_42',
    file_path: 'src/checkout/session_store.go',
    change_type: 'modified',
    additions: 31,
    deletions: 5,
    content: JSON.stringify({
      hunks: [
        {
          header: '@@ -89,5 +89,31 @@',
          lines: [
            ' func (s *SessionStore) GetWithFallback(sessionID, guestToken string) (*Session, error) {',
            '+\t// Primary lookup',
            '+\tsession, err := s.cache.Get(sessionID)',
            '+\tif err == nil {',
            '+\t\treturn session, nil',
            '+\t}',
            '+\t// Fallback: guest token lookup (NEW - 레디스 키 패턴 변경)',
            '+\tkey := fmt.Sprintf("guest:%s", guestToken)',
            '+\treturn s.cache.Get(key)',
            ' }',
          ],
        },
      ],
    }),
  });

  insertDiff.run({
    id: 'diff_42_04',
    deployment_id: 'dep_checkout_prod_42',
    file_path: 'src/checkout/metrics.go',
    change_type: 'added',
    additions: 18,
    deletions: 0,
    content: JSON.stringify({
      hunks: [
        {
          header: '@@ -0,0 +1,18 @@',
          lines: [
            '+func (m *Metrics) RecordGuestCartMigration(duration time.Duration, success bool) {',
            '+\tlabels := prometheus.Labels{"success": strconv.FormatBool(success)}',
            '+\tm.guestCartMigrationDuration.With(labels).Observe(duration.Seconds())',
            '+\tif !success {',
            '+\t\tm.guestCartMigrationErrors.Inc()',
            '+\t}',
            '+}',
          ],
        },
      ],
    }),
  });

  // ─── Deployment Risk Checks ───────────────────────────────────────────────
  const insertRiskCheck = db.prepare(`
    INSERT OR IGNORE INTO deployment_risk_checks
      (id, deployment_id, check_name, status, detail)
    VALUES
      (@id, @deployment_id, @check_name, @status, @detail)
  `);

  insertRiskCheck.run({
    id: 'risk_42_01',
    deployment_id: 'dep_checkout_prod_42',
    check_name: '단위 테스트 커버리지',
    status: 'pass',
    detail: '커버리지 87.4% (기준: 80%)',
  });
  insertRiskCheck.run({
    id: 'risk_42_02',
    deployment_id: 'dep_checkout_prod_42',
    check_name: 'Staging 검증',
    status: 'pass',
    detail: 'staging에서 24시간 정상 운영 확인',
  });
  insertRiskCheck.run({
    id: 'risk_42_03',
    deployment_id: 'dep_checkout_prod_42',
    check_name: '설정 변경 감지',
    status: 'warn',
    detail: 'feature_flags.yaml 변경 포함: guest_cart_v2 플래그 활성화. Production에서 첫 활성화이며 사전 검토 권고.',
  });
  insertRiskCheck.run({
    id: 'risk_42_04',
    deployment_id: 'dep_checkout_prod_42',
    check_name: '외부 의존성 변경',
    status: 'pass',
    detail: '외부 API 변경 없음',
  });
  insertRiskCheck.run({
    id: 'risk_42_05',
    deployment_id: 'dep_checkout_prod_42',
    check_name: 'DB 마이그레이션',
    status: 'pass',
    detail: 'DB 스키마 변경 없음',
  });
  insertRiskCheck.run({
    id: 'risk_42_06',
    deployment_id: 'dep_checkout_prod_42',
    check_name: 'Redis 키 패턴 변경',
    status: 'warn',
    detail: 'session_store.go에서 레디스 키 패턴 변경 감지: "guest:{token}". 기존 세션과의 충돌 가능성 검토 필요.',
  });

  // ─── Incident ─────────────────────────────────────────────────────────────
  const insertIncident = db.prepare(`
    INSERT OR IGNORE INTO incidents
      (id, title, description, service_id, environment, severity, status, assignee_id, linked_deployment_id, created_at, updated_at)
    VALUES
      (@id, @title, @description, @service_id, @environment, @severity, @status, @assignee_id, @linked_deployment_id, @created_at, @updated_at)
  `);

  insertIncident.run({
    id: 'inc_checkout_prod_01',
    title: '[P1] checkout-service 5xx 에러율 급증 (현재 23.4%)',
    description:
      'v2.4.1 배포 직후 checkout-service의 5xx 에러율이 0.1%에서 23.4%로 급증하였습니다. ' +
      'guest_cart_migration 관련 로그 스택트레이스 다수 발생 중. ' +
      '현재 약 2,300 RPS 중 537 RPS가 5xx로 반환되고 있으며 결제 전환율이 78% 감소한 상태입니다.',
    service_id: 'svc_checkout',
    environment: 'production',
    severity: 'critical',
    status: 'investigating',
    assignee_id: 'op_jungsoo_kim',
    linked_deployment_id: 'dep_checkout_prod_42',
    created_at: '2026-03-10T02:51:00Z',
    updated_at: '2026-03-10T03:10:00Z',
  });

  // ─── Incident Events ──────────────────────────────────────────────────────
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO incident_events
      (id, incident_id, actor_id, action, detail, created_at)
    VALUES
      (@id, @incident_id, @actor_id, @action, @detail, @created_at)
  `);

  insertEvent.run({
    id: 'iev_01_001',
    incident_id: 'inc_checkout_prod_01',
    actor_id: 'op_jungsoo_kim',
    action: 'opened',
    detail: 'PagerDuty 알림 수신. checkout-service HTTP 5xx 에러율 임계치(5%) 초과. 즉시 조사 시작.',
    created_at: '2026-03-10T02:51:00Z',
  });
  insertEvent.run({
    id: 'iev_01_002',
    incident_id: 'inc_checkout_prod_01',
    actor_id: 'op_jungsoo_kim',
    action: 'status_changed',
    detail: 'open → investigating. 배포 이력 확인 중. v2.4.1이 02:15에 배포됨. 에러 시작 시각과 일치.',
    created_at: '2026-03-10T02:53:00Z',
  });
  insertEvent.run({
    id: 'iev_01_003',
    incident_id: 'inc_checkout_prod_01',
    actor_id: 'op_jungsoo_kim',
    action: 'linked_deployment',
    detail: 'dep_checkout_prod_42 (v2.4.1)를 linked deployment으로 연결. 에러 패턴이 guest_cart_migration 코드 경로와 일치.',
    created_at: '2026-03-10T02:55:00Z',
  });
  insertEvent.run({
    id: 'iev_01_004',
    incident_id: 'inc_checkout_prod_01',
    actor_id: 'op_seungho_park',
    action: 'comment',
    detail: '레디스 모니터링 확인: "guest:*" 키 패턴 조회 급증. get_command_calls 초당 12,000 → 280,000으로 증가. 세션 캐시 미스율 94%.',
    created_at: '2026-03-10T03:02:00Z',
  });
  insertEvent.run({
    id: 'iev_01_005',
    incident_id: 'inc_checkout_prod_01',
    actor_id: 'op_jungsoo_kim',
    action: 'comment',
    detail: '원인 잠정 확인: guest_cart_v2 feature flag 활성화로 인해 모든 guest 세션이 신규 레디스 키 패턴을 사용하나, 기존 세션 데이터가 마이그레이션되지 않아 캐시 미스 → DB fallback → 타임아웃 발생.',
    created_at: '2026-03-10T03:08:00Z',
  });

  // ─── Incident Evidence ────────────────────────────────────────────────────
  const insertEvidence = db.prepare(`
    INSERT OR IGNORE INTO incident_evidence
      (id, incident_id, type, title, content, created_at)
    VALUES
      (@id, @incident_id, @type, @title, @content, @created_at)
  `);

  insertEvidence.run({
    id: 'evi_01_error_rate',
    incident_id: 'inc_checkout_prod_01',
    type: 'error_rate',
    title: 'HTTP 5xx 에러율 시계열 (최근 3시간)',
    content: JSON.stringify({
      unit: 'percent',
      baseline: 0.08,
      threshold: 5.0,
      spike_start: '2026-03-10T02:47:00Z',
      datapoints: [
        { time: '2026-03-10T00:00:00Z', value: 0.07 },
        { time: '2026-03-10T00:30:00Z', value: 0.09 },
        { time: '2026-03-10T01:00:00Z', value: 0.08 },
        { time: '2026-03-10T01:30:00Z', value: 0.10 },
        { time: '2026-03-10T02:00:00Z', value: 0.09 },
        { time: '2026-03-10T02:15:00Z', value: 0.08 },
        { time: '2026-03-10T02:30:00Z', value: 0.12 },
        { time: '2026-03-10T02:45:00Z', value: 1.40 },
        { time: '2026-03-10T02:47:00Z', value: 8.30 },
        { time: '2026-03-10T02:50:00Z', value: 15.70 },
        { time: '2026-03-10T02:55:00Z', value: 21.20 },
        { time: '2026-03-10T03:00:00Z', value: 23.40 },
        { time: '2026-03-10T03:05:00Z', value: 23.80 },
        { time: '2026-03-10T03:10:00Z', value: 23.40 },
      ],
      annotation: 'v2.4.1 배포 완료(02:15) 후 32분 뒤 에러 급증 시작. guest_cart 트래픽이 증가하는 시간대와 상관 관계 있음.',
    }),
    created_at: '2026-03-10T03:05:00Z',
  });

  insertEvidence.run({
    id: 'evi_01_log_sample',
    incident_id: 'inc_checkout_prod_01',
    type: 'log_sample',
    title: '에러 로그 샘플 (최근 50건 중 대표 패턴)',
    content: JSON.stringify({
      total_errors_sampled: 50,
      sample_window: '2026-03-10T02:50:00Z ~ 2026-03-10T03:00:00Z',
      top_errors: [
        {
          count: 38,
          level: 'ERROR',
          message: 'guest cart migration: session lookup failed: context deadline exceeded',
          stack: [
            'checkout/cart_handler.go:143 CartHandler.ProcessGuestCart',
            'checkout/session_store.go:97 SessionStore.GetWithFallback',
            'cache/redis_client.go:234 RedisClient.Get',
          ],
          labels: {
            service: 'checkout-service',
            version: 'v2.4.1',
            pod: 'checkout-7d8f9b-*',
            env: 'production',
          },
        },
        {
          count: 9,
          level: 'ERROR',
          message: 'guest_cart_migration_error: redis: connection pool timeout',
          stack: [
            'checkout/cart_handler.go:151 CartHandler.ProcessGuestCart',
            'cache/redis_client.go:189 RedisClient.getConn',
          ],
          labels: {
            service: 'checkout-service',
            version: 'v2.4.1',
            pod: 'checkout-7d8f9b-*',
            env: 'production',
          },
        },
        {
          count: 3,
          level: 'ERROR',
          message: 'cart repo: pq: canceling statement due to conflict with recovery',
          stack: [
            'checkout/cart_handler.go:159 CartHandler.ProcessGuestCart',
            'checkout/cart_repo.go:82 CartRepo.GetItems',
          ],
          labels: {
            service: 'checkout-service',
            version: 'v2.4.1',
            pod: 'checkout-7d8f9b-*',
            env: 'production',
          },
        },
      ],
    }),
    created_at: '2026-03-10T03:06:00Z',
  });

  insertEvidence.run({
    id: 'evi_01_metric_chart',
    incident_id: 'inc_checkout_prod_01',
    type: 'metric_chart',
    title: '레디스 커넥션 풀 / 캐시 미스율 (최근 3시간)',
    content: JSON.stringify({
      metrics: [
        {
          name: 'redis_cache_miss_rate',
          unit: 'percent',
          datapoints: [
            { time: '2026-03-10T00:00:00Z', value: 2.1 },
            { time: '2026-03-10T01:00:00Z', value: 2.3 },
            { time: '2026-03-10T02:00:00Z', value: 2.2 },
            { time: '2026-03-10T02:30:00Z', value: 2.4 },
            { time: '2026-03-10T02:47:00Z', value: 41.0 },
            { time: '2026-03-10T02:50:00Z', value: 78.3 },
            { time: '2026-03-10T02:55:00Z', value: 91.2 },
            { time: '2026-03-10T03:00:00Z', value: 93.8 },
            { time: '2026-03-10T03:10:00Z', value: 94.1 },
          ],
        },
        {
          name: 'redis_connection_pool_used',
          unit: 'connections',
          max_pool: 500,
          datapoints: [
            { time: '2026-03-10T00:00:00Z', value: 42 },
            { time: '2026-03-10T01:00:00Z', value: 38 },
            { time: '2026-03-10T02:00:00Z', value: 45 },
            { time: '2026-03-10T02:30:00Z', value: 47 },
            { time: '2026-03-10T02:47:00Z', value: 312 },
            { time: '2026-03-10T02:50:00Z', value: 498 },
            { time: '2026-03-10T02:55:00Z', value: 500 },
            { time: '2026-03-10T03:00:00Z', value: 500 },
            { time: '2026-03-10T03:10:00Z', value: 500 },
          ],
        },
      ],
    }),
    created_at: '2026-03-10T03:07:00Z',
  });

  insertEvidence.run({
    id: 'evi_01_config_diff',
    incident_id: 'inc_checkout_prod_01',
    type: 'config_diff',
    title: 'v2.4.1에서 변경된 feature flags (배포 전/후 비교)',
    content: JSON.stringify({
      file: 'config/feature_flags.yaml',
      environment: 'production',
      before: {
        guest_cart_v2: false,
      },
      after: {
        guest_cart_v2: true,
        guest_cart_migration_batch_size: 500,
        guest_cart_session_ttl_minutes: 30,
      },
      risk_note: 'guest_cart_v2 플래그가 production에서 처음 활성화됨. 기존 세션 데이터 마이그레이션 없이 활성화되어 캐시 미스 유발.',
    }),
    created_at: '2026-03-10T03:08:00Z',
  });

  // ─── Rollback Plan ────────────────────────────────────────────────────────
  const insertRollbackPlan = db.prepare(`
    INSERT OR IGNORE INTO rollback_plans
      (id, deployment_id, target_version, status, created_by, approved_by, dry_run_result, created_at, updated_at)
    VALUES
      (@id, @deployment_id, @target_version, @status, @created_by, @approved_by, @dry_run_result, @created_at, @updated_at)
  `);

  insertRollbackPlan.run({
    id: 'rbp_checkout_42_01',
    deployment_id: 'dep_checkout_prod_42',
    target_version: 'v2.3.8',
    status: 'draft',
    created_by: 'op_jungsoo_kim',
    approved_by: null,
    dry_run_result: null,
    created_at: '2026-03-10T03:12:00Z',
    updated_at: '2026-03-10T03:12:00Z',
  });

  // ─── Rollback Steps ───────────────────────────────────────────────────────
  const insertStep = db.prepare(`
    INSERT OR IGNORE INTO rollback_steps
      (id, rollback_plan_id, step_order, action, status, detail)
    VALUES
      (@id, @rollback_plan_id, @step_order, @action, @status, @detail)
  `);

  insertStep.run({
    id: 'rbs_42_01_01',
    rollback_plan_id: 'rbp_checkout_42_01',
    step_order: 1,
    action: 'feature_flag_disable',
    status: 'pending',
    detail: 'guest_cart_v2 feature flag를 false로 변경하여 즉시 신규 코드 경로 비활성화',
  });
  insertStep.run({
    id: 'rbs_42_01_02',
    rollback_plan_id: 'rbp_checkout_42_01',
    step_order: 2,
    action: 'image_rollback',
    status: 'pending',
    detail: 'checkout-service 이미지를 v2.4.1 → v2.3.8로 교체. Kubernetes rolling update (maxUnavailable: 0)',
  });
  insertStep.run({
    id: 'rbs_42_01_03',
    rollback_plan_id: 'rbp_checkout_42_01',
    step_order: 3,
    action: 'redis_flush',
    status: 'pending',
    detail: '"guest:*" 패턴의 레디스 키 삭제 (신규 패턴으로 오염된 캐시 정리)',
  });
  insertStep.run({
    id: 'rbs_42_01_04',
    rollback_plan_id: 'rbp_checkout_42_01',
    step_order: 4,
    action: 'health_check',
    status: 'pending',
    detail: '5xx 에러율 < 1% 확인. 레디스 캐시 미스율 < 5% 확인. P99 응답시간 < 500ms 확인.',
  });
  insertStep.run({
    id: 'rbs_42_01_05',
    rollback_plan_id: 'rbp_checkout_42_01',
    step_order: 5,
    action: 'notify',
    status: 'pending',
    detail: '롤백 완료 슬랙 #checkout-incidents 채널 공지 및 인시던트 상태 mitigated 전이',
  });

  // ─── Audit Logs ───────────────────────────────────────────────────────────
  const insertAudit = db.prepare(`
    INSERT OR IGNORE INTO audit_logs
      (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
    VALUES
      (@id, @request_id, @actor_id, @actor_role, @action_type, @target_type, @target_id, @reason, @result, @created_at)
  `);

  insertAudit.run({
    id: 'aud_co_001',
    request_id: 'req_co_001',
    actor_id: 'op_seungho_park',
    actor_role: 'ops_engineer',
    action_type: 'deployment.create',
    target_type: 'deployment',
    target_id: 'dep_checkout_prod_42',
    reason: 'checkout-service v2.4.1 배포: guest cart 세션 마이그레이션 기능 추가',
    result: 'success',
    created_at: '2026-03-10T02:15:00Z',
  });
  insertAudit.run({
    id: 'aud_co_002',
    request_id: 'req_co_002',
    actor_id: 'op_seungho_park',
    actor_role: 'ops_engineer',
    action_type: 'deployment.status_changed',
    target_type: 'deployment',
    target_id: 'dep_checkout_prod_42',
    reason: '배포 후 5xx 에러율 급증으로 실패 처리',
    result: 'success',
    created_at: '2026-03-10T02:47:00Z',
  });
  insertAudit.run({
    id: 'aud_co_003',
    request_id: 'req_co_003',
    actor_id: 'op_jungsoo_kim',
    actor_role: 'oncall_engineer',
    action_type: 'incident.create',
    target_type: 'incident',
    target_id: 'inc_checkout_prod_01',
    reason: '5xx 에러율 23.4% 초과. PagerDuty 알림 기반 인시던트 생성.',
    result: 'success',
    created_at: '2026-03-10T02:51:00Z',
  });
  insertAudit.run({
    id: 'aud_co_004',
    request_id: 'req_co_004',
    actor_id: 'op_jungsoo_kim',
    actor_role: 'oncall_engineer',
    action_type: 'incident.status_changed',
    target_type: 'incident',
    target_id: 'inc_checkout_prod_01',
    reason: 'v2.4.1 배포와 에러 상관관계 확인. 적극 조사 전환.',
    result: 'success',
    created_at: '2026-03-10T02:53:00Z',
  });
  insertAudit.run({
    id: 'aud_co_005',
    request_id: 'req_co_005',
    actor_id: 'op_jungsoo_kim',
    actor_role: 'oncall_engineer',
    action_type: 'incident.link_deployment',
    target_type: 'incident',
    target_id: 'inc_checkout_prod_01',
    reason: 'dep_checkout_prod_42 (v2.4.1) 연결. 에러 패턴 일치.',
    result: 'success',
    created_at: '2026-03-10T02:55:00Z',
  });
  insertAudit.run({
    id: 'aud_co_006',
    request_id: 'req_co_006',
    actor_id: 'op_jungsoo_kim',
    actor_role: 'oncall_engineer',
    action_type: 'rollback_plan.create',
    target_type: 'rollback_plan',
    target_id: 'rbp_checkout_42_01',
    reason: 'v2.3.8 롤백 플랜 생성. guest_cart_v2 feature flag 비활성화 후 이미지 롤백.',
    result: 'success',
    created_at: '2026-03-10T03:12:00Z',
  });
}
