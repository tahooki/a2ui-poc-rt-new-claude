import Database from 'better-sqlite3';

/**
 * Scenario: healthy-rollout
 * staging 환경 search 서비스 v3.1.0 정상 배포 진행 중
 * 모든 risk checks pass, 인시던트 없음
 *
 * 이 시나리오는 다음 데모 흐름을 지원한다:
 *   1. Dashboard → 특이 사항 없음 확인
 *   2. Deployments → 정상 진행 중인 배포 확인
 *   3. Risk checks all pass 확인
 *   4. 챗봇 "지금 배포 상태 어때?" → "정상 진행 중, 특이 사항 없음"
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
    id: 'svc_search',
    name: 'search-service',
    tier: 'standard',
    owner: 'search-team',
  });
  insertService.run({
    id: 'svc_catalog',
    name: 'catalog-service',
    tier: 'standard',
    owner: 'catalog-team',
  });
  insertService.run({
    id: 'svc_recommendation',
    name: 'recommendation-service',
    tier: 'internal',
    owner: 'ml-team',
  });

  // ─── Deployment (running / 60% rollout) ─────────────────────────────────
  const insertDeployment = db.prepare(`
    INSERT OR IGNORE INTO deployments
      (id, service_id, environment, version, previous_version, status, rollout_percent, deployed_by, created_at, updated_at)
    VALUES
      (@id, @service_id, @environment, @version, @previous_version, @status, @rollout_percent, @deployed_by, @created_at, @updated_at)
  `);

  insertDeployment.run({
    id: 'dep_search_stg_17',
    service_id: 'svc_search',
    environment: 'staging',
    version: 'v3.1.0',
    previous_version: 'v3.0.9',
    status: 'running',
    rollout_percent: 60,
    deployed_by: 'op_minji_lee',
    created_at: '2026-03-10T09:00:00Z',
    updated_at: '2026-03-10T09:20:00Z',
  });

  // 이전 성공 배포 이력
  insertDeployment.run({
    id: 'dep_search_stg_16',
    service_id: 'svc_search',
    environment: 'staging',
    version: 'v3.0.9',
    previous_version: 'v3.0.8',
    status: 'succeeded',
    rollout_percent: 100,
    deployed_by: 'op_minji_lee',
    created_at: '2026-03-07T14:00:00Z',
    updated_at: '2026-03-07T14:25:00Z',
  });

  // catalog staging 배포도 정상
  insertDeployment.run({
    id: 'dep_catalog_stg_09',
    service_id: 'svc_catalog',
    environment: 'staging',
    version: 'v2.0.1',
    previous_version: 'v2.0.0',
    status: 'succeeded',
    rollout_percent: 100,
    deployed_by: 'op_seungho_park',
    created_at: '2026-03-09T11:00:00Z',
    updated_at: '2026-03-09T11:18:00Z',
  });

  // ─── Deployment Diffs ─────────────────────────────────────────────────────
  const insertDiff = db.prepare(`
    INSERT OR IGNORE INTO deployment_diffs
      (id, deployment_id, file_path, change_type, additions, deletions, content)
    VALUES
      (@id, @deployment_id, @file_path, @change_type, @additions, @deletions, @content)
  `);

  insertDiff.run({
    id: 'diff_s17_01',
    deployment_id: 'dep_search_stg_17',
    file_path: 'src/search/ranking/scorer.py',
    change_type: 'modified',
    additions: 34,
    deletions: 18,
    content: JSON.stringify({
      hunks: [
        {
          header: '@@ -201,18 +201,34 @@',
          lines: [
            ' def compute_relevance_score(query: str, document: Document) -> float:',
            '-    base_score = bm25_score(query, document.text)',
            '+    base_score = bm25_score(query, document.text, k1=1.5, b=0.75)',
            '+    # v3.1.0: BM25 파라미터 튜닝 (검색팀 A/B 테스트 결과 반영)',
            '+    title_boost = 1.2 if query.lower() in document.title.lower() else 1.0',
            '+    recency_boost = compute_recency_boost(document.updated_at)',
            '+    return base_score * title_boost * recency_boost',
            '-    return base_score',
          ],
        },
      ],
    }),
  });

  insertDiff.run({
    id: 'diff_s17_02',
    deployment_id: 'dep_search_stg_17',
    file_path: 'src/search/indexer/pipeline.py',
    change_type: 'modified',
    additions: 12,
    deletions: 4,
    content: JSON.stringify({
      hunks: [
        {
          header: '@@ -88,4 +88,12 @@',
          lines: [
            ' class IndexPipeline:',
            '+    # v3.1.0: 인덱스 배치 크기 동적 조정',
            '+    def _get_batch_size(self) -> int:',
            '+        load = self.metrics.get_current_load()',
            '+        if load > 0.8:',
            '+            return max(50, self.batch_size // 2)',
            '+        return self.batch_size',
          ],
        },
      ],
    }),
  });

  insertDiff.run({
    id: 'diff_s17_03',
    deployment_id: 'dep_search_stg_17',
    file_path: 'tests/ranking/test_scorer.py',
    change_type: 'added',
    additions: 45,
    deletions: 0,
    content: JSON.stringify({
      hunks: [
        {
          header: '@@ -0,0 +1,45 @@',
          lines: [
            '+import pytest',
            '+from search.ranking.scorer import compute_relevance_score',
            '+',
            '+def test_title_boost_applied_when_query_in_title():',
            '+    doc = Document(title="파이썬 튜토리얼", text="...", updated_at=datetime.now())',
            '+    score_with_title = compute_relevance_score("파이썬", doc)',
            '+    doc_no_title = Document(title="무관한 제목", text="파이썬...", updated_at=datetime.now())',
            '+    score_without = compute_relevance_score("파이썬", doc_no_title)',
            '+    assert score_with_title > score_without',
          ],
        },
      ],
    }),
  });

  // ─── Risk Checks (모두 pass) ──────────────────────────────────────────────
  const insertRiskCheck = db.prepare(`
    INSERT OR IGNORE INTO deployment_risk_checks
      (id, deployment_id, check_name, status, detail)
    VALUES
      (@id, @deployment_id, @check_name, @status, @detail)
  `);

  insertRiskCheck.run({
    id: 'risk_s17_01',
    deployment_id: 'dep_search_stg_17',
    check_name: '단위 테스트 커버리지',
    status: 'pass',
    detail: '커버리지 91.2% (기준: 80%). 신규 테스트 45건 추가.',
  });
  insertRiskCheck.run({
    id: 'risk_s17_02',
    deployment_id: 'dep_search_stg_17',
    check_name: '설정 변경 감지',
    status: 'pass',
    detail: '설정 파일 변경 없음. 코드 로직만 변경.',
  });
  insertRiskCheck.run({
    id: 'risk_s17_03',
    deployment_id: 'dep_search_stg_17',
    check_name: 'DB 마이그레이션',
    status: 'pass',
    detail: 'DB 스키마 변경 없음.',
  });
  insertRiskCheck.run({
    id: 'risk_s17_04',
    deployment_id: 'dep_search_stg_17',
    check_name: '외부 의존성 변경',
    status: 'pass',
    detail: '외부 API 변경 없음. 내부 알고리즘 파라미터 튜닝만 포함.',
  });
  insertRiskCheck.run({
    id: 'risk_s17_05',
    deployment_id: 'dep_search_stg_17',
    check_name: 'Rollback 가능성',
    status: 'pass',
    detail: 'v3.0.9로 즉시 롤백 가능. DB 변경 없어 롤백 시 데이터 정합성 문제 없음.',
  });
  insertRiskCheck.run({
    id: 'risk_s17_06',
    deployment_id: 'dep_search_stg_17',
    check_name: 'Staging 24h 검증',
    status: 'pass',
    detail: 'dev 환경 72시간 정상 운영. staging 현재 60% 트래픽 정상.',
  });

  // ─── Audit Logs ───────────────────────────────────────────────────────────
  const insertAudit = db.prepare(`
    INSERT OR IGNORE INTO audit_logs
      (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
    VALUES
      (@id, @request_id, @actor_id, @actor_role, @action_type, @target_type, @target_id, @reason, @result, @created_at)
  `);

  insertAudit.run({
    id: 'aud_hr_001',
    request_id: 'req_hr_001',
    actor_id: 'op_minji_lee',
    actor_role: 'release_manager',
    action_type: 'deployment.create',
    target_type: 'deployment',
    target_id: 'dep_search_stg_17',
    reason: 'search-service v3.1.0 staging 배포: BM25 파라미터 튜닝, 재순위화 로직 개선',
    result: 'success',
    created_at: '2026-03-10T09:00:00Z',
  });
  insertAudit.run({
    id: 'aud_hr_002',
    request_id: 'req_hr_002',
    actor_id: 'op_minji_lee',
    actor_role: 'release_manager',
    action_type: 'deployment.rollout_progress',
    target_type: 'deployment',
    target_id: 'dep_search_stg_17',
    reason: '초기 20% 트래픽 정상 확인 후 60%로 증가',
    result: 'success',
    created_at: '2026-03-10T09:20:00Z',
  });
}
