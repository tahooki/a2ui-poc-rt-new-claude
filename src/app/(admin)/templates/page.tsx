"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Layers3,
  RefreshCw,
  Play,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Radar,
  WandSparkles,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Plus,
  X,
  Trash2,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { A2UICardRenderer } from "@/components/a2ui/a2ui-card-renderer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useOperator } from "@/lib/operators";

interface ScenarioInfo {
  id: string;
  title: string;
  description: string;
}

interface TemplateRule {
  id: string;
  rule_type: "keyword" | "prompt_hint" | "page" | "role";
  rule_value: string;
  priority: number;
}

interface TemplateOverride {
  id: string;
  scope_type: "global" | "scenario" | "page" | "role";
  scope_value: string;
  enabled: number;
}

interface TemplateDecisionInput {
  id: string;
  input_key: string;
  label: string;
  description: string;
  required: number;
  source: "user" | "context" | "derived";
  default_value: string | null;
  priority: number;
}

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  card_type: string;
  builder_key: string;
  tool_name: string;
  category: string;
  prompt_hint: string;
  is_enabled: number;
  rules: TemplateRule[];
  overrides: TemplateOverride[];
  decision_inputs: TemplateDecisionInput[];
  scenario_override_enabled: boolean | null;
  effective_scenario_enabled: boolean;
  bindings: Array<{
    id: string;
    slot: string;
    required: boolean;
    output_key: string;
    input_mapping: Record<string, string>;
    source: {
      id: string;
      kind: string;
      method?: string;
      url?: string;
      handlerKey?: string;
      pathParams?: Record<string, string>;
      queryParams?: Record<string, string>;
      bodyMapping?: Record<string, string>;
      resultPath?: string;
      timeoutMs: number;
    } | null;
  }>;
  sample_cases: Array<{
    id: string;
    question: string;
    page: string;
    operatorRole: string;
    args: Record<string, unknown>;
    note: string | null;
  }>;
  preview_args: Array<{
    name: string;
    sample_value: string;
  }>;
}

interface TemplatesResponse {
  currentScenarioId: string;
  scenarios: ScenarioInfo[];
  templates: TemplateItem[];
  counts: {
    total: number;
    enabled: number;
    effectiveForScenario: number;
  };
}

interface TemplatePreviewResponse {
  success: boolean;
  template: {
    id: string;
    name: string;
    cardType: string;
    toolName: string;
  };
  args: Record<string, string>;
  preview: Record<string, unknown>;
  diagnostics: {
    missingRequired: string[];
    warnings: string[];
    fallback: string | null;
    fallbackTemplateId: string | null;
  };
}

interface TemplateSimulationResponse {
  success: boolean;
  selectedTemplate: {
    id: string;
    name: string;
    toolName: string;
    cardType: string;
    promptHint?: string;
  } | null;
  preview: Record<string, unknown> | null;
  diagnostics: {
    reason?: string;
    missingRequired?: string[];
    warnings?: string[];
    fallback?: string | null;
    fallbackTemplateId?: string | null;
    candidates: Array<{
      id: string;
      name: string;
      matchedKeywordCount: number;
    }>;
  };
}

interface TemplateHistoryItem {
  id: string;
  page: string;
  scenarioId: string;
  operatorId: string | null;
  userMessage: string;
  selectionReason: string;
  status: string;
  decisionPayload: unknown;
  createdAt: string;
}

interface TemplateHistoryResponse {
  template: {
    id: string;
    name: string;
  };
  history: TemplateHistoryItem[];
}

interface SandboxEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  preview?: Record<string, unknown> | null;
  meta?: string;
}

interface PreviewInteractiveState {
  cardType: string;
  cardData: Record<string, unknown>;
}

interface EditableBindingConfig {
  bindingId: string;
  slot: string;
  required: boolean;
  outputKey: string;
  sourceId: string;
  inputMappingText: string;
  sourceKind: string;
  sourceMethod: string;
  sourceUrl: string;
  sourceHandlerKey: string;
  sourceResultPath: string;
  sourcePathParamsText: string;
  sourceQueryParamsText: string;
  sourceBodyMappingText: string;
  timeoutMs: string;
}

interface KeyValueRow {
  id: string;
  key: string;
  value: string;
}

// ─── Edit state interfaces ──────────────────────────────────────────────────

interface EditDecisionInput {
  input_key: string;
  label: string;
  description: string;
  required: boolean;
  source: "user" | "context" | "derived";
  default_value: string | null;
  priority: number;
}

interface EditState {
  keywords: string[];
  allowedPages: string[];
  allowedRoles: string[];
  promptHint: string;
  decisionInputs: EditDecisionInput[];
}

const ALL_PAGES = ["dashboard", "deployments", "incidents", "jobs", "reports", "audit"];
const ALL_ROLES = ["oncall_engineer", "release_manager", "ops_engineer", "support_lead"];
const ALL_SOURCES: Array<EditDecisionInput["source"]> = ["user", "context", "derived"];
const COMMON_EXPRESSION_SUGGESTIONS = [
  "$args.incidentId",
  "$args.deploymentId",
  "$args.jobRunId",
  "$args.actionType",
  "$args.targetId",
  "$context.selectedEntityId",
  "$context.page",
  "$session.actorId",
  "$session.actorRole",
];

const FRIENDLY_TERM_HELP = {
  outputKey: "카드 안에서 이 데이터가 표시될 이름입니다.",
  handlerKey: "내부 시스템에 이미 준비된 데이터 호출 이름입니다.",
  resultPath: "응답 JSON 중 실제로 쓸 부분의 경로입니다. 예: data.items",
  inputMapping: "질문/문맥 값을 어떤 입력 이름으로 넘길지 정합니다.",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRuleValues(
  rules: TemplateRule[],
  type: TemplateRule["rule_type"],
) {
  return rules
    .filter((rule) => rule.rule_type === type)
    .map((rule) => rule.rule_value);
}

function getCategoryBadgeClass(category: string) {
  switch (category) {
    case "deployments":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "incidents":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "jobs":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "reports":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function getScenarioOverrideLabel(value: boolean | null) {
  if (value === true) return "Force On";
  if (value === false) return "Force Off";
  return "Use Global";
}

function getFriendlyStatusLabel(status: string) {
  switch (status) {
    case "selected":
      return "정상 선택";
    case "fallback":
      return "대체 경로 사용";
    case "blocked":
      return "실행 차단";
    default:
      return status;
  }
}

function getFriendlySelectionReason(reason: string) {
  if (!reason) return "설명 없음";
  return reason
    .replace("admin template preview success", "미리보기가 정상적으로 생성되었습니다.")
    .replace("admin publish action", "현재 시나리오에 publish 되었습니다.")
    .replace("simulate route found no matching template", "질문에 맞는 템플릿을 찾지 못했습니다.")
    .replace("simulate route selected", "시뮬레이터가 템플릿을 선택했습니다.");
}

function buildEditStateFromTemplate(template: TemplateItem): EditState {
  return {
    keywords: getRuleValues(template.rules, "keyword"),
    allowedPages: getRuleValues(template.rules, "page"),
    allowedRoles: getRuleValues(template.rules, "role"),
    promptHint: template.prompt_hint,
    decisionInputs: template.decision_inputs.map((di) => ({
      input_key: di.input_key,
      label: di.label,
      description: di.description,
      required: di.required === 1,
      source: di.source,
      default_value: di.default_value,
      priority: di.priority,
    })),
  };
}

function editStateHasChanges(edit: EditState, template: TemplateItem): boolean {
  const orig = buildEditStateFromTemplate(template);
  return JSON.stringify(edit) !== JSON.stringify(orig);
}

function buildEditableBindings(template: TemplateItem): EditableBindingConfig[] {
  return template.bindings.map((binding) => ({
    bindingId: binding.id,
    slot: binding.slot,
    required: binding.required,
    outputKey: binding.output_key,
    sourceId: binding.source?.id ?? "",
    inputMappingText: JSON.stringify(binding.input_mapping ?? {}, null, 2),
    sourceKind: binding.source?.kind ?? "internal_db",
    sourceMethod: binding.source?.method ?? "GET",
    sourceUrl: binding.source?.url ?? "",
    sourceHandlerKey: binding.source?.handlerKey ?? "",
    sourceResultPath: binding.source?.resultPath ?? "",
    sourcePathParamsText: JSON.stringify(
      ((binding.source as Record<string, unknown> | null)?.pathParams as Record<string, string> | undefined) ?? {},
      null,
      2,
    ),
    sourceQueryParamsText: JSON.stringify(
      ((binding.source as Record<string, unknown> | null)?.queryParams as Record<string, string> | undefined) ?? {},
      null,
      2,
    ),
    sourceBodyMappingText: JSON.stringify(
      ((binding.source as Record<string, unknown> | null)?.bodyMapping as Record<string, string> | undefined) ?? {},
      null,
      2,
    ),
    timeoutMs: String(binding.source?.timeoutMs ?? 1500),
  }));
}

function parseJsonRecord(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON object 형식이어야 합니다.");
  }

  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
      key,
      String(value ?? ""),
    ]),
  );
}

function parseKeyValueRows(text: string) {
  try {
    const parsed = parseJsonRecord(text);
    return Object.entries(parsed).map(([key, value], index) => ({
      id: `${key}-${index}`,
      key,
      value,
    }));
  } catch {
    return [];
  }
}

function toJsonText(rows: KeyValueRow[]) {
  return JSON.stringify(
    Object.fromEntries(
      rows
        .filter((row) => row.key.trim().length > 0)
        .map((row) => [row.key.trim(), row.value]),
    ),
    null,
    2,
  );
}

function KeyValueEditor({
  label,
  hint,
  rows,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  suggestions,
}: {
  label: string;
  hint?: string;
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  suggestions?: string[];
}) {
  const safeRows = rows.length > 0 ? rows : [{ id: "empty-0", key: "", value: "" }];

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {hint && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{hint}</p>}
      </div>
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                const next = [...safeRows];
                const targetIndex = next.findIndex((row) => row.value.length === 0);
                if (targetIndex >= 0) {
                  next[targetIndex] = { ...next[targetIndex], value: suggestion };
                } else {
                  next.push({
                    id: `row-${Date.now()}-${suggestion}`,
                    key: "",
                    value: suggestion,
                  });
                }
                onChange(next);
              }}
              className="rounded-full border border-border/60 bg-background px-2 py-1 text-[10px] font-mono text-muted-foreground hover:border-emerald-400 hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {safeRows.map((row, index) => (
          <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <Input
              value={row.key}
              onChange={(e) => {
                const next = [...safeRows];
                next[index] = { ...next[index], key: e.target.value };
                onChange(next);
              }}
              className="h-8 font-mono text-xs"
              placeholder={keyPlaceholder}
            />
            <Input
              value={row.value}
              onChange={(e) => {
                const next = [...safeRows];
                next[index] = { ...next[index], value: e.target.value };
                onChange(next);
              }}
              className="h-8 font-mono text-xs"
              placeholder={valuePlaceholder}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => {
                const next = safeRows.filter((_, currentIndex) => currentIndex !== index);
                onChange(next);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() =>
            onChange([
              ...safeRows,
              { id: `row-${Date.now()}`, key: "", value: "" },
            ])
          }
        >
          <Plus className="mr-1 h-3 w-3" />
          항목 추가
        </Button>
      </div>
    </div>
  );
}

function buildDiagnosticSummary(input: {
  previewResult: TemplatePreviewResponse | null;
  simulationResult: TemplateSimulationResponse | null;
  history: TemplateHistoryItem[];
}) {
  const warningCount =
    (input.previewResult?.diagnostics.warnings.length ?? 0) +
    (input.simulationResult?.diagnostics.warnings?.length ?? 0);
  const missingRequiredCount =
    (input.previewResult?.diagnostics.missingRequired.length ?? 0) +
    (input.simulationResult?.diagnostics.missingRequired?.length ?? 0);
  const fallbackCount = input.history.filter((item) => item.status === "fallback").length;

  const nextAction =
    missingRequiredCount > 0
      ? "필수 데이터가 빠진 슬롯부터 수정하세요."
      : warningCount > 0
        ? "경고가 있는 source/result path를 먼저 확인하세요."
        : fallbackCount > 0
          ? "최근 대체 경로 사용 이력을 확인하고 매핑을 조정하세요."
          : "현재 설정은 비교적 안정적입니다. publish 전 sandbox를 한 번 더 확인하세요.";

  return {
    warningCount,
    missingRequiredCount,
    fallbackCount,
    nextAction,
  };
}

function getBindingSourceKindLabel(sourceKind: string) {
  switch (sourceKind) {
    case "internal_db":
      return "내부 데이터";
    case "internal_api":
      return "내부 API";
    case "external_http":
      return "외부 HTTP API";
    default:
      return sourceKind || "미지정";
  }
}

function getDecisionInputSourceLabel(source: EditDecisionInput["source"]) {
  switch (source) {
    case "user":
      return "사용자 질문";
    case "context":
      return "현재 문맥";
    case "derived":
      return "파생 값";
    default:
      return source;
  }
}

function clonePreviewInteractiveState(input: PreviewInteractiveState): PreviewInteractiveState {
  return JSON.parse(JSON.stringify(input)) as PreviewInteractiveState;
}

function applyPreviewCardAction(
  input: PreviewInteractiveState,
  actionName: string,
  actionContext: Record<string, unknown>,
): { next: PreviewInteractiveState; message: string } {
  const next = clonePreviewInteractiveState(input);
  const selectedCandidateId = String(
    actionContext.candidateId ?? actionContext.deploymentId ?? "",
  );

  const updateCandidateStatus = (
    collectionKey: "candidates" | "requests",
    matcher: (item: Record<string, unknown>) => boolean,
    patch: Record<string, unknown>,
  ) => {
    const items = Array.isArray(next.cardData[collectionKey])
      ? (next.cardData[collectionKey] as Array<Record<string, unknown>>)
      : [];
    next.cardData[collectionKey] = items.map((item) =>
      matcher(item) ? { ...item, ...patch } : item,
    );
  };

  switch (actionName) {
    case "dry_run_next_step": {
      if (next.cardType !== "dry_run_stepper") {
        return { next, message: "이 카드에서는 단계 진행 미리보기를 제공하지 않습니다." };
      }

      const steps = Array.isArray(next.cardData.steps)
        ? (next.cardData.steps as Array<Record<string, unknown>>)
        : [];
      const pendingIndex = steps.findIndex((step) => String(step.status ?? "") === "pending");
      if (pendingIndex === -1) {
        return { next, message: "모든 단계가 이미 완료된 상태로 표시되어 있습니다." };
      }

      steps[pendingIndex] = {
        ...steps[pendingIndex],
        status: "completed",
      };

      const isAllCompleted = steps.every((step) =>
        ["completed", "done"].includes(String(step.status ?? "")),
      );

      next.cardData.steps = steps;
      next.cardData.dryRunSummary = {
        ...(typeof next.cardData.dryRunSummary === "object" && next.cardData.dryRunSummary !== null
          ? (next.cardData.dryRunSummary as Record<string, unknown>)
          : {}),
        message: isAllCompleted
          ? "미리보기 기준으로 모든 dry-run 단계가 완료되었습니다."
          : `단계 ${String(steps[pendingIndex].step_order ?? pendingIndex + 1)} 미리보기를 완료했습니다.`,
      };

      return {
        next,
        message: isAllCompleted
          ? "미리보기에서 모든 단계가 완료된 상태로 갱신됐습니다."
          : "미리보기에서 다음 단계가 완료 상태로 반영됐습니다.",
      };
    }

    case "dry_run_confirm": {
      if (next.cardType === "dry_run_stepper") {
        next.cardData.rollbackPlan = {
          ...(typeof next.cardData.rollbackPlan === "object" && next.cardData.rollbackPlan !== null
            ? (next.cardData.rollbackPlan as Record<string, unknown>)
            : {}),
          status: "dry_run_passed",
        };
        next.cardData.dryRunSummary = {
          ...(typeof next.cardData.dryRunSummary === "object" && next.cardData.dryRunSummary !== null
            ? (next.cardData.dryRunSummary as Record<string, unknown>)
            : {}),
          message: "Dry-run 결과를 검토 완료한 상태로 표시했습니다.",
        };
      }

      return { next, message: "미리보기에서 Dry-run 확인 상태를 반영했습니다." };
    }

    case "execute_dry_run": {
      next.cardData.rollbackPlan = {
        ...(typeof next.cardData.rollbackPlan === "object" && next.cardData.rollbackPlan !== null
          ? (next.cardData.rollbackPlan as Record<string, unknown>)
          : {}),
        status: "dry_run_ready",
      };
      return { next, message: "미리보기에서 계획 상태를 Dry-Run 준비로 변경했습니다." };
    }

    case "request_approval": {
      next.cardData.rollbackPlan = {
        ...(typeof next.cardData.rollbackPlan === "object" && next.cardData.rollbackPlan !== null
          ? (next.cardData.rollbackPlan as Record<string, unknown>)
          : {}),
        status: "approved",
      };
      next.cardData.approvalStatus = {
        ...(typeof next.cardData.approvalStatus === "object" && next.cardData.approvalStatus !== null
          ? (next.cardData.approvalStatus as Record<string, unknown>)
          : {}),
        status: "approved",
        message: "미리보기에서 승인 완료 상태로 갱신했습니다.",
      };
      return { next, message: "미리보기에서 승인 상태를 갱신했습니다." };
    }

    case "execute_rollback":
    case "confirm_rollback": {
      updateCandidateStatus(
        "candidates",
        (item) => String(item.id ?? item.deployment_id ?? "") === selectedCandidateId,
        {
          status: "rolled_back",
          candidate_role: "rolled_back",
          rollbackable: false,
          available: false,
          recentSignals: ["미리보기에서 선택한 항목이 롤백 완료 상태로 변경됨"],
        },
      );
      return { next, message: "미리보기에서 선택한 롤백 후보가 롤백 완료 상태로 바뀌었습니다." };
    }

    case "approve_deployment_request":
    case "approve_deploy_request": {
      updateCandidateStatus(
        "requests",
        (item) => String(item.status ?? item.state ?? "") === "approval_requested",
        {
          status: "approved",
          state: "approved",
          recentSignals: ["승인완료"],
          recent_signal: "승인완료",
        },
      );
      return { next, message: "미리보기에서 배포 요청이 승인완료 상태로 변경됐습니다." };
    }

    case "hold_deployment_request":
    case "hold_deploy_request": {
      updateCandidateStatus(
        "requests",
        (item) => String(item.status ?? item.state ?? "") === "approval_requested",
        {
          status: "held",
          state: "held",
          recentSignals: ["승인 대기에서 보류 상태로 전환됨"],
          recent_signal: "승인 대기에서 보류 상태로 전환됨",
        },
      );
      return { next, message: "미리보기에서 배포 요청을 보류 상태로 변경했습니다." };
    }

    case "create_deploy_draft":
    case "quick_deploy_create_draft": {
      next.cardData.state = "draft_created";
      next.cardData.baseline = {
        ...(typeof next.cardData.baseline === "object" && next.cardData.baseline !== null
          ? (next.cardData.baseline as Record<string, unknown>)
          : {}),
        state: "draft_created",
        latest_request_status: "draft",
      };
      return { next, message: "Step 1이 완료되어 초안 생성이 끝났고, 이제 승인 요청 또는 즉시 시작 단계로 넘어갑니다." };
    }

    case "request_deploy_approval":
    case "quick_deploy_request_approval": {
      next.cardData.state = "approval_requested";
      next.cardData.baseline = {
        ...(typeof next.cardData.baseline === "object" && next.cardData.baseline !== null
          ? (next.cardData.baseline as Record<string, unknown>)
          : {}),
        state: "approval_requested",
        approvalRequired: true,
        latest_request_status: "approval_requested",
      };
      return { next, message: "Step 2에서 승인 요청이 완료된 상태로 변경했습니다." };
    }

    case "start_quick_deploy":
    case "quick_deploy_start_now": {
      next.cardData.state = "started";
      next.cardData.baseline = {
        ...(typeof next.cardData.baseline === "object" && next.cardData.baseline !== null
          ? (next.cardData.baseline as Record<string, unknown>)
          : {}),
        state: "started",
        canImmediateStart: false,
        latest_request_status: "started",
      };
      return { next, message: "Step 2에서 즉시 시작이 완료되어 새 배포가 시작된 상태로 변경했습니다." };
    }

    case "select_deploy_baseline":
    case "open_deployments_page":
    case "view_deployment_request":
    case "view_deploy_request":
      return { next, message: "미리보기에서는 화면 전환 없이 현재 카드 상태만 유지합니다." };

    case "confirm_job_execute":
    case "execute_job":
    case "execute_job_dryrun":
    case "approve_job":
    case "confirm_incident_close":
    case "generate_report":
    case "cancel_action":
      return { next, message: "미리보기에서는 액션 결과만 안내하고 서버 작업은 수행하지 않습니다." };

    default:
      return { next, message: `미리보기 액션 "${actionName}"을 수신했지만 별도 상태 변화는 없습니다.` };
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const { currentOperator } = useOperator();
  const [data, setData] = useState<TemplatesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [previewArgs, setPreviewArgs] = useState<Record<string, string>>({});
  const [selectedSampleCaseId, setSelectedSampleCaseId] = useState<string>("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<TemplatePreviewResponse | null>(null);
  const [previewInteractiveState, setPreviewInteractiveState] = useState<PreviewInteractiveState | null>(null);
  const [previewActionMessage, setPreviewActionMessage] = useState<string | null>(null);
  const [bindingEditState, setBindingEditState] = useState<EditableBindingConfig[]>([]);
  const [bindingSaveError, setBindingSaveError] = useState<string | null>(null);
  const [simulatorQuestion, setSimulatorQuestion] = useState("");
  const [simulatorPage, setSimulatorPage] = useState("deployments");
  const [simulatorRole, setSimulatorRole] = useState("ops_engineer");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<TemplateSimulationResponse | null>(null);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<TemplateHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [sandboxEntries, setSandboxEntries] = useState<SandboxEntry[]>([]);
  const [expandedBindingId, setExpandedBindingId] = useState<string | null>(null);
  const [expandedDecisionInputIndex, setExpandedDecisionInputIndex] = useState<number | null>(0);
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
  const pendingTemplateSelectionSyncRef = useRef<{
    templateId: string;
    sampleCaseId: string;
    previewArgs: Record<string, string>;
    simulatorQuestion: string;
    simulatorPage: string;
    simulatorRole: string;
  } | null>(null);

  function buildPreviewArgsFromSampleCase(
    template: TemplateItem,
    sampleCase: TemplateItem["sample_cases"][number] | null,
  ) {
    return Object.fromEntries(
      template.preview_args.map((arg) => [
        arg.name,
        sampleCase && typeof sampleCase.args[arg.name] !== "undefined"
          ? String(sampleCase.args[arg.name] ?? "")
          : arg.sample_value,
      ]),
    );
  }

  function queueTemplateSelectionSync(template: TemplateItem) {
    const sampleCase = template.sample_cases[0] ?? null;
    pendingTemplateSelectionSyncRef.current = {
      templateId: template.id,
      sampleCaseId: sampleCase?.id ?? "",
      previewArgs: buildPreviewArgsFromSampleCase(template, sampleCase),
      simulatorQuestion: sampleCase?.question ?? "",
      simulatorPage: sampleCase?.page ?? "deployments",
      simulatorRole: sampleCase?.operatorRole ?? "ops_engineer",
    };
    setSelectedId(template.id);
  }

  async function loadData(keepSelection = true) {
    try {
      setIsLoading(true);
      const res = await fetch("/api/a2ui-templates");
      const payload = (await res.json()) as TemplatesResponse;
      setData(payload);
      setSelectedId((prev) => {
        if (keepSelection && prev && payload.templates.some((item) => item.id === prev)) {
          return prev;
        }
        return payload.templates[0]?.id ?? "";
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData(false);
  }, []);

  const filteredTemplates = useMemo(() => {
    const templates = data?.templates ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter((template) => {
      const keywords = getRuleValues(template.rules, "keyword");
      return (
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.card_type.toLowerCase().includes(query) ||
        keywords.some((keyword) => keyword.toLowerCase().includes(query))
      );
    });
  }, [data?.templates, search]);

  const selectedTemplate = useMemo(
    () =>
      filteredTemplates.find((template) => template.id === selectedId) ??
      data?.templates.find((template) => template.id === selectedId) ??
      null,
    [data?.templates, filteredTemplates, selectedId],
  );

  const currentScenario = useMemo(
    () =>
      data?.scenarios.find((scenario) => scenario.id === data.currentScenarioId) ??
      null,
    [data],
  );

  // Initialize edit state when selected template changes
  useEffect(() => {
    if (selectedTemplate) {
      const pendingSync =
        pendingTemplateSelectionSyncRef.current?.templateId === selectedTemplate.id
          ? pendingTemplateSelectionSyncRef.current
          : null;

      setEditState(buildEditStateFromTemplate(selectedTemplate));
      setNewKeyword("");
      setPreviewArgs(
        pendingSync?.previewArgs ??
          Object.fromEntries(
            selectedTemplate.preview_args.map((arg) => [arg.name, arg.sample_value]),
          ),
      );
      setBindingEditState(buildEditableBindings(selectedTemplate));
      setBindingSaveError(null);
      setSelectedSampleCaseId(pendingSync?.sampleCaseId ?? selectedTemplate.sample_cases[0]?.id ?? "");
      setPreviewResult(null);
      setPreviewInteractiveState(null);
      setPreviewActionMessage(null);
      setExpandedBindingId(selectedTemplate.bindings[0]?.id ?? null);
      setExpandedDecisionInputIndex(selectedTemplate.decision_inputs[0] ? 0 : null);
      if (pendingSync) {
        setSimulatorQuestion(pendingSync.simulatorQuestion);
        setSimulatorPage(pendingSync.simulatorPage);
        setSimulatorRole(pendingSync.simulatorRole);
        pendingTemplateSelectionSyncRef.current = null;
      }
    } else {
      setEditState(null);
      setPreviewArgs({});
      setBindingEditState([]);
      setBindingSaveError(null);
      setSelectedSampleCaseId("");
      setPreviewResult(null);
      setPreviewInteractiveState(null);
      setPreviewActionMessage(null);
      setExpandedBindingId(null);
      setExpandedDecisionInputIndex(null);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (!previewResult) return;

    if ("error" in previewResult.preview) {
      setPreviewInteractiveState(null);
      setPreviewActionMessage(null);
    } else {
      setPreviewInteractiveState({
        cardType: String(previewResult.preview.cardType ?? ""),
        cardData: JSON.parse(
          JSON.stringify(
            (previewResult.preview.cardData as Record<string, unknown>) ?? {},
          ),
        ) as Record<string, unknown>,
      });
      setPreviewActionMessage(null);
    }

    requestAnimationFrame(() => {
      previewSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [previewResult]);

  const handlePreviewCardAction = useCallback((actionName: string, context: Record<string, unknown>) => {
    setPreviewInteractiveState((current) => {
      if (!current) return current;
      const result = applyPreviewCardAction(current, actionName, context);
      setPreviewActionMessage(result.message);
      return result.next;
    });
  }, []);

  const hasChanges = useMemo(() => {
    if (!editState || !selectedTemplate) return false;
    return editStateHasChanges(editState, selectedTemplate);
  }, [editState, selectedTemplate]);

  const updateTemplate = useCallback(
    async (templateId: string, body: Record<string, unknown>) => {
      setIsSaving(true);
      try {
        await fetch(`/api/a2ui-templates/${encodeURIComponent(templateId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        await loadData();
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  async function updateScenario(scenarioId: string) {
    setIsSaving(true);
    try {
      await fetch("/api/runtime/scenario", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      await loadData();
    } finally {
      setIsSaving(false);
    }
  }

  async function runPreview() {
    if (!selectedTemplate) return;

    setIsPreviewing(true);
    try {
      const res = await fetch(
        `/api/a2ui-templates/${encodeURIComponent(selectedTemplate.id)}/preview`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            args: previewArgs,
            sampleCaseId: selectedSampleCaseId || undefined,
            context: {
              actorId: currentOperator?.id,
              actorRole: currentOperator?.role,
              page: "templates",
            },
          }),
        },
      );

      const payload = (await res.json()) as TemplatePreviewResponse | { error: string };
      if (!res.ok || "error" in payload) {
        setPreviewResult({
          success: false,
          template: {
            id: selectedTemplate.id,
            name: selectedTemplate.name,
            cardType: selectedTemplate.card_type,
            toolName: selectedTemplate.tool_name,
          },
          args: previewArgs,
          preview: { error: "error" in payload ? payload.error : "Preview failed" },
          diagnostics: {
            missingRequired: [],
            warnings: [],
            fallback: null,
            fallbackTemplateId: null,
          },
        });
        return;
      }

      setPreviewResult(payload);
      await loadHistory(selectedTemplate.id);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function runSimulation() {
    if (!simulatorQuestion.trim()) return;

    setIsSimulating(true);
    try {
      const question = simulatorQuestion;
      setSandboxEntries((current) => [
        ...current,
        {
          id: `user-${Date.now()}`,
          role: "user",
          text: question,
        },
      ]);
      const res = await fetch("/api/a2ui-templates/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          page: simulatorPage,
          role: simulatorRole,
          scenarioId: data?.currentScenarioId,
          operatorId: currentOperator?.id,
        }),
      });
      const payload = (await res.json()) as TemplateSimulationResponse;
      setSimulationResult(payload);
      setSandboxEntries((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: payload.selectedTemplate
            ? `${payload.selectedTemplate.name} 템플릿이 선택되었습니다.`
            : "선택된 템플릿이 없습니다.",
          preview: payload.preview,
          meta: payload.selectedTemplate
            ? `${payload.selectedTemplate.toolName} / ${payload.selectedTemplate.cardType}`
            : payload.diagnostics.reason ?? undefined,
        },
      ]);
      if (payload.selectedTemplate?.id) {
        setSelectedId(payload.selectedTemplate.id);
      }
    } finally {
      setIsSimulating(false);
    }
  }

  async function loadHistory(templateId: string) {
    setIsHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/a2ui-templates/${encodeURIComponent(templateId)}/history?limit=12`,
      );
      const payload = (await res.json()) as TemplateHistoryResponse | { error: string };
      if (!res.ok || "error" in payload) {
        setHistory([]);
        return;
      }
      setHistory(payload.history);
    } finally {
      setIsHistoryLoading(false);
    }
  }

  function handleSampleCaseChange(sampleCaseId: string | null) {
    if (!sampleCaseId) {
      setSelectedSampleCaseId("");
      return;
    }

    setSelectedSampleCaseId(sampleCaseId);
    if (!selectedTemplate) return;

    const sampleCase = selectedTemplate.sample_cases.find((item) => item.id === sampleCaseId);
    if (!sampleCase) return;

    setPreviewArgs(buildPreviewArgsFromSampleCase(selectedTemplate, sampleCase));
    setSimulatorQuestion(sampleCase.question);
    setSimulatorPage(sampleCase.page || "deployments");
    setSimulatorRole(sampleCase.operatorRole || "ops_engineer");
  }

  const saveEditState = useCallback(async () => {
    if (!editState || !selectedTemplate) return;
    await updateTemplate(selectedTemplate.id, {
      keywords: editState.keywords,
      allowedPages: editState.allowedPages,
      allowedRoles: editState.allowedRoles,
      promptHint: editState.promptHint,
      decisionInputs: editState.decisionInputs,
    });
  }, [editState, selectedTemplate, updateTemplate]);

  async function saveBindingConfig() {
    if (!selectedTemplate) return;

    try {
      setBindingSaveError(null);
      await updateTemplate(selectedTemplate.id, {
        bindingOverrides: bindingEditState.map((binding) => ({
          binding_id: binding.bindingId,
          source_id: binding.sourceId,
          slot: binding.slot,
          required: binding.required,
          output_key: binding.outputKey,
          input_mapping: parseJsonRecord(binding.inputMappingText),
        })),
        sourceOverrides: bindingEditState.map((binding) => ({
          source_id: binding.sourceId,
          kind: binding.sourceKind,
          method: binding.sourceMethod || null,
          url: binding.sourceUrl || null,
          handler_key: binding.sourceHandlerKey || null,
          result_path: binding.sourceResultPath || null,
          path_params: parseJsonRecord(binding.sourcePathParamsText),
          query_params: parseJsonRecord(binding.sourceQueryParamsText),
          body_mapping: parseJsonRecord(binding.sourceBodyMappingText),
          timeout_ms: Number(binding.timeoutMs || "1500"),
        })),
      });
      await loadData();
    } catch (error) {
      setBindingSaveError(
        error instanceof Error
          ? error.message
          : "binding/source 설정 저장에 실패했습니다.",
      );
    }
  }

  function updateBindingConfig(
    bindingId: string,
    updates: Partial<EditableBindingConfig>,
  ) {
    setBindingEditState((current) =>
      current.map((binding) =>
        binding.bindingId === bindingId ? { ...binding, ...updates } : binding,
      ),
    );
  }

  function addKeyword() {
    if (!editState || !newKeyword.trim()) return;
    const kw = newKeyword.trim();
    if (editState.keywords.includes(kw)) return;
    setEditState({ ...editState, keywords: [...editState.keywords, kw] });
    setNewKeyword("");
  }

  function removeKeyword(kw: string) {
    if (!editState) return;
    setEditState({ ...editState, keywords: editState.keywords.filter((k) => k !== kw) });
  }

  function togglePage(page: string) {
    if (!editState) return;
    const pages = editState.allowedPages.includes(page)
      ? editState.allowedPages.filter((p) => p !== page)
      : [...editState.allowedPages, page];
    setEditState({ ...editState, allowedPages: pages });
  }

  function toggleRole(role: string) {
    if (!editState) return;
    const roles = editState.allowedRoles.includes(role)
      ? editState.allowedRoles.filter((r) => r !== role)
      : [...editState.allowedRoles, role];
    setEditState({ ...editState, allowedRoles: roles });
  }

  function updateDecisionInput(index: number, updates: Partial<EditDecisionInput>) {
    if (!editState) return;
    const inputs = [...editState.decisionInputs];
    inputs[index] = { ...inputs[index], ...updates };
    setEditState({ ...editState, decisionInputs: inputs });
  }

  function removeDecisionInput(index: number) {
    if (!editState) return;
    const inputs = editState.decisionInputs.filter((_, i) => i !== index);
    setEditState({ ...editState, decisionInputs: inputs });
    setExpandedDecisionInputIndex((current) => {
      if (current === null) return null;
      if (current === index) {
        return inputs.length > 0 ? Math.min(index, inputs.length - 1) : null;
      }
      return current > index ? current - 1 : current;
    });
  }

  function addDecisionInput() {
    if (!editState) return;
    const nextPriority = editState.decisionInputs.length > 0
      ? Math.max(...editState.decisionInputs.map((di) => di.priority)) + 10
      : 10;
    setEditState({
      ...editState,
      decisionInputs: [
        ...editState.decisionInputs,
        {
          input_key: `new_input_${Date.now()}`,
          label: "",
          description: "",
          required: false,
          source: "user",
          default_value: null,
          priority: nextPriority,
        },
      ],
    });
    setExpandedDecisionInputIndex(editState.decisionInputs.length);
  }

  function discardChanges() {
    if (selectedTemplate) {
      setEditState(buildEditStateFromTemplate(selectedTemplate));
    }
  }

  async function publishTemplate() {
    if (!selectedTemplate) return;

    setPublishMessage(null);
    await updateTemplate(selectedTemplate.id, {
      isEnabled: true,
      scenarioId: data?.currentScenarioId,
      scenarioEnabled: true,
      operatorId: currentOperator?.id,
      publishAction: true,
    });
    setPublishMessage(
      "현재 시나리오 기준으로 publish 완료했습니다. 챗봇에서 이 템플릿을 사용할 수 있습니다.",
    );
    await loadHistory(selectedTemplate.id);
  }

  const publishReady = Boolean(
    selectedTemplate &&
      bindingEditState.length > 0 &&
      previewResult &&
      !("error" in previewResult.preview),
  );
  const diagnosticSummary = useMemo(
    () =>
      buildDiagnosticSummary({
        previewResult,
        simulationResult,
        history,
      }),
    [previewResult, simulationResult, history],
  );
  const requiredBindingCount = useMemo(
    () => bindingEditState.filter((binding) => binding.required).length,
    [bindingEditState],
  );
  const requiredDecisionInputCount = useMemo(
    () => editState?.decisionInputs.filter((input) => input.required).length ?? 0,
    [editState],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      setHistory([]);
      setSandboxEntries([]);
      return;
    }
    void loadHistory(selectedTemplate.id);
    setSandboxEntries([]);
  }, [selectedTemplate]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-[#F7F2E7] via-white to-[#E8F3EC] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-emerald-700">
              <WandSparkles className="h-3.5 w-3.5" />
              Guided Builder
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              챗봇에 보여줄 A2UI를 단계별로 설정하세요
            </h1>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              starter를 선택하고, 연결된 데이터를 확인하고, 질문을 시뮬레이션한 뒤, preview와 publish까지 한 흐름으로 진행합니다.
            </p>
            <div className="mt-3 rounded-xl border border-emerald-200/70 bg-white/75 p-3">
              <p className="text-[11px] font-mono uppercase tracking-wider text-emerald-700">
                처음이라면 이렇게 시작하세요
              </p>
              <ol className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                <li>1. 위 starter 카드에서 가장 가까운 업무 유형을 고릅니다.</li>
                <li>2. 데이터 연결에서 “어떤 데이터를 어디서 가져올지”만 채웁니다.</li>
                <li>3. Preview와 질문 시뮬레이터로 결과를 확인한 뒤 publish 합니다.</li>
              </ol>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { label: "1. Starter 선택", value: "template 고르기" },
              { label: "2. 데이터 연결", value: "binding/source 저장" },
              { label: "3. Preview 확인", value: "질문 시뮬레이션 + render" },
              { label: "4. Publish", value: "챗봇 사용 가능" },
            ].map((step) => (
              <div
                key={step.label}
                className="rounded-xl border border-white/80 bg-white/80 p-3 shadow-sm"
              >
                <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  {step.label}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">{step.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-sm font-mono uppercase tracking-wider">
              빠른 가이드
            </CardTitle>
            <CardDescription>
              처음 보는 사람도 여기서 바로 흐름과 용어를 빠르게 익힐 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Tabs defaultValue="steps" className="gap-4">
              <TabsList
                variant="line"
                className="h-auto w-full flex-wrap justify-start rounded-xl border border-border/60 bg-muted/20 p-1"
              >
                <TabsTrigger value="steps" className="rounded-lg px-3 py-2 text-sm">
                  시작 순서
                </TabsTrigger>
                <TabsTrigger value="terms" className="rounded-lg px-3 py-2 text-sm">
                  용어 설명
                </TabsTrigger>
              </TabsList>

              <TabsContent value="steps" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    title: "어떤 화면을 띄울지",
                    body: "starter나 template를 먼저 고릅니다.",
                  },
                  {
                    title: "어디서 데이터를 가져올지",
                    body: "내부 데이터인지, API인지 선택합니다.",
                  },
                  {
                    title: "어떤 값을 넣을지",
                    body: "질문과 문맥 값을 입력 이름에 연결합니다.",
                  },
                  {
                    title: "정상인지 확인",
                    body: "preview와 sandbox로 실제 결과를 봅니다.",
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-xl border border-border/60 bg-card p-4">
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.body}</p>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="terms" className="grid gap-3 md:grid-cols-2">
                {[
                  { term: "Output Key", desc: FRIENDLY_TERM_HELP.outputKey },
                  { term: "Handler Key", desc: FRIENDLY_TERM_HELP.handlerKey },
                  { term: "Result Path", desc: FRIENDLY_TERM_HELP.resultPath },
                  { term: "Input Mapping", desc: FRIENDLY_TERM_HELP.inputMapping },
                ].map((item) => (
                  <div key={item.term} className="rounded-xl border border-border/60 bg-card p-4">
                    <p className="text-sm font-semibold text-foreground">{item.term}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-sm font-mono uppercase tracking-wider">
              현재 작업 맥락
            </CardTitle>
            <CardDescription>
              지금 어떤 시나리오를 기준으로 작업 중인지 한눈에 확인합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={data?.currentScenarioId ?? ""}
                onValueChange={(value) => {
                  if (value) {
                    updateScenario(value);
                  }
                }}
              >
                <SelectTrigger className="min-w-[240px] bg-card">
                  <SelectValue placeholder="현재 시나리오 선택" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.scenarios ?? []).map((scenario) => (
                    <SelectItem key={scenario.id} value={scenario.id}>
                      {scenario.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                className="font-mono"
                onClick={() => loadData()}
                disabled={isLoading || isSaving}
              >
                <RefreshCw className={cn("h-4 w-4", (isLoading || isSaving) && "animate-spin")} />
                Refresh
              </Button>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-sm font-semibold text-foreground">
                {currentScenario?.title ?? "시나리오를 선택하세요"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {currentScenario?.description ?? "현재 시나리오 기준으로 템플릿 우선순위와 활성 상태를 확인합니다."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">전체 템플릿</p>
                <p className="mt-1 font-mono text-2xl text-foreground">
                  {data?.counts.total ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">전역 활성화</p>
                <p className="mt-1 font-mono text-2xl text-emerald-500">
                  {data?.counts.enabled ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">시나리오 활성화</p>
                <p className="mt-1 font-mono text-2xl text-violet-500">
                  {data?.counts.effectiveForScenario ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">선택된 템플릿</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedTemplate?.name ?? "아직 선택되지 않음"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider">
              <Radar className="h-4 w-4 text-emerald-600" />
              Starter 선택
            </CardTitle>
            <CardDescription>
              템플릿을 raw inventory가 아니라 starter처럼 보고 먼저 고릅니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 md:grid-cols-2 xl:grid-cols-3">
            {(data?.templates ?? []).slice(0, 6).map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => queueTemplateSelectionSync(template)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-all hover:border-emerald-400 hover:bg-emerald-50/40",
                  selectedId === template.id
                    ? "border-emerald-500 bg-emerald-50/60 shadow-sm"
                    : "border-border/60 bg-card",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={cn("border", getCategoryBadgeClass(template.category))}
                  >
                    {template.category}
                  </Badge>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    {template.card_type}
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-sm font-semibold text-foreground">{template.name}</p>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {template.description}
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    예시 질문
                  </p>
                  <div className="space-y-1">
                    {template.sample_cases.slice(0, 2).map((sampleCase) => (
                      <div
                        key={sampleCase.id}
                        className="rounded-lg border border-border/40 bg-background/80 px-2.5 py-2 text-[11px] text-muted-foreground"
                      >
                        {sampleCase.question}
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider">
              <GitBranch className="h-4 w-4 text-violet-600" />
              검증 도구
            </CardTitle>
            <CardDescription>
              선택 결과, 챗봇 흐름, 최근 진단을 한곳에서 확인합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Tabs defaultValue="simulate" className="gap-4">
              <TabsList
                variant="line"
                className="h-auto w-full flex-wrap justify-start rounded-xl border border-border/60 bg-muted/20 p-1"
              >
                <TabsTrigger value="simulate" className="rounded-lg px-3 py-2 text-sm">
                  질문 시뮬레이터
                </TabsTrigger>
                <TabsTrigger value="sandbox" className="rounded-lg px-3 py-2 text-sm">
                  챗봇 샌드박스
                </TabsTrigger>
                <TabsTrigger value="activity" className="rounded-lg px-3 py-2 text-sm">
                  최근 활동
                </TabsTrigger>
              </TabsList>

              <TabsContent value="simulate" className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">질문</label>
                  <Input
                    value={simulatorQuestion}
                    onChange={(e) => setSimulatorQuestion(e.target.value)}
                    placeholder="예: 이 배포 rollback 해야 해?"
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">페이지</label>
                    <Select
                      value={simulatorPage}
                      onValueChange={(value) => setSimulatorPage(value ?? "deployments")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_PAGES.map((page) => (
                          <SelectItem key={page} value={page}>
                            {page}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">역할</label>
                    <Select
                      value={simulatorRole}
                      onValueChange={(value) => setSimulatorRole(value ?? "ops_engineer")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={runSimulation} disabled={isSimulating || !simulatorQuestion.trim()}>
                  <Play className="mr-1 h-3.5 w-3.5" />
                  {isSimulating ? "시뮬레이션 중..." : "질문 시뮬레이션"}
                </Button>

                {simulationResult && (
                  <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">선택된 템플릿</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {simulationResult.selectedTemplate?.name ?? "선택 없음"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">선택된 툴</p>
                        <p className="mt-1 font-mono text-sm text-foreground">
                          {simulationResult.selectedTemplate?.toolName ?? "—"}
                        </p>
                      </div>
                    </div>
                    {simulationResult.selectedTemplate?.promptHint && (
                      <p className="text-xs leading-5 text-muted-foreground">
                        {simulationResult.selectedTemplate.promptHint}
                      </p>
                    )}
                    {simulationResult.preview && !("error" in simulationResult.preview) && (
                      <A2UICardRenderer
                        cardType={String(simulationResult.preview.cardType ?? "")}
                        cardData={(simulationResult.preview.cardData as Record<string, unknown>) ?? {}}
                      />
                    )}
                    {simulationResult.preview && "error" in simulationResult.preview && (
                      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        {String(simulationResult.preview.error)}
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sandbox">
                <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                  <div className="space-y-3">
                    {sandboxEntries.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/60 bg-background/70 p-6 text-sm text-muted-foreground">
                        시뮬레이터에서 질문을 실행하면 여기에 챗봇 대화와 A2UI 결과가 쌓입니다.
                      </div>
                    ) : (
                      sandboxEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className={cn(
                            "rounded-xl border p-3",
                            entry.role === "user"
                              ? "ml-10 border-emerald-400/30 bg-emerald-50/60"
                              : "mr-10 border-border/60 bg-background",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                              {entry.role === "user" ? "User" : "Assistant"}
                            </span>
                            {entry.meta && (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {entry.meta}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-foreground">{entry.text}</p>
                          {entry.preview && !("error" in entry.preview) && (
                            <div className="mt-3">
                              <A2UICardRenderer
                                cardType={String(entry.preview.cardType ?? "")}
                                cardData={(entry.preview.cardData as Record<string, unknown>) ?? {}}
                              />
                            </div>
                          )}
                          {entry.preview && "error" in entry.preview && (
                            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                              {String(entry.preview.error)}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity">
                {isHistoryLoading ? (
                  <div className="rounded-xl border border-border/60 bg-muted/10 p-6 text-sm text-muted-foreground">
                    최근 활동을 불러오는 중입니다...
                  </div>
                ) : history.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 text-sm text-muted-foreground">
                    아직 기록된 preview/simulate/publish 활동이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                        <p className="text-xs font-medium text-muted-foreground">최근 경고 수</p>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {diagnosticSummary.warningCount}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                        <p className="text-xs font-medium text-muted-foreground">필수 누락 수</p>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {diagnosticSummary.missingRequiredCount}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                        <p className="text-xs font-medium text-muted-foreground">대체 경로 사용</p>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {diagnosticSummary.fallbackCount}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
                      <p className="text-sm font-medium text-sky-900">추천 다음 작업</p>
                      <p className="mt-2 text-sm text-sky-950/80">
                        {diagnosticSummary.nextAction}
                      </p>
                    </div>
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-border/60 bg-background/80 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge
                            variant={item.status === "selected" ? "default" : item.status === "fallback" ? "secondary" : "outline"}
                            className="text-[10px]"
                          >
                            {getFriendlyStatusLabel(item.status)}
                          </Badge>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {item.createdAt}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-foreground">
                          {item.userMessage || "메시지 없음"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {getFriendlySelectionReason(item.selectionReason)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10">
            <Layers3 className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground font-mono">
              템플릿 작업 공간
            </h2>
            <p className="text-sm text-muted-foreground">
              왼쪽 inventory에서 템플릿을 고르고, 오른쪽 detail에서 수정하세요.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-violet-500/20 bg-violet-500/5 text-violet-700">
          {currentScenario?.title ?? data?.currentScenarioId ?? "시나리오 없음"}
        </Badge>
      </div>

      <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
        {/* ── Template List ── */}
        <Card className="min-h-0">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="font-mono text-sm uppercase tracking-wider">
                  템플릿 목록
                </CardTitle>
                <CardDescription>
                  현재 시나리오: {currentScenario?.id ?? data?.currentScenarioId ?? "—"}
                </CardDescription>
              </div>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="템플릿 이름 / 키워드 검색"
                className="h-9 w-full sm:w-64"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>템플릿</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>전역</TableHead>
                  <TableHead>시나리오</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow
                    key={template.id}
                    className={cn(
                      "cursor-pointer",
                      selectedTemplate?.id === template.id && "bg-muted/40",
                    )}
                    onClick={() => queueTemplateSelectionSync(template)}
                  >
                    <TableCell className="max-w-[280px]">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">
                          {template.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {template.card_type} / {template.tool_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("border", getCategoryBadgeClass(template.category))}
                      >
                        {template.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {template.is_enabled === 1 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                          <ToggleRight className="h-3.5 w-3.5" />
                          On
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <ToggleLeft className="h-3.5 w-3.5" />
                          Off
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs",
                          template.effective_scenario_enabled
                            ? "text-violet-400"
                            : "text-muted-foreground",
                        )}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {getScenarioOverrideLabel(template.scenario_override_enabled)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && filteredTemplates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      검색 조건에 맞는 템플릿이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Template Detail (Editable) ── */}
        <Card className="min-h-0 max-h-[calc(100vh-280px)] overflow-y-auto py-0">
          <CardHeader className="sticky top-0 z-10 border-b bg-card/95 pt-4 backdrop-blur supports-[backdrop-filter]:bg-card/90 group-data-[size=sm]/card:pt-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="font-mono text-sm uppercase tracking-wider">
                  Template Detail
                </CardTitle>
                <CardDescription>
                  판단 기준과 데이터 연결을 단계별로 나눠서 편집하세요.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedTemplate && (
                  <>
                    <Badge
                      variant="outline"
                      className={cn("border", getCategoryBadgeClass(selectedTemplate.category))}
                    >
                      {selectedTemplate.category}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "border",
                        selectedTemplate.effective_scenario_enabled
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                          : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {selectedTemplate.effective_scenario_enabled
                        ? "현재 시나리오 노출"
                        : "현재 시나리오 숨김"}
                    </Badge>
                  </>
                )}
                {hasChanges && (
                  <>
                    <Badge className="border border-amber-500/30 bg-amber-500/10 text-amber-700">
                      미저장 변경
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={discardChanges} disabled={isSaving}>
                      취소
                    </Button>
                    <Button size="sm" onClick={saveEditState} disabled={isSaving}>
                      <Save className="mr-1 h-3.5 w-3.5" />
                      저장
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="py-4">
            {selectedTemplate && editState ? (
              <>
                <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/30 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                      <h3 className="text-lg font-semibold text-foreground">
                        {selectedTemplate.name}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {selectedTemplate.description}
                      </p>
                    </div>
                    <div className="grid min-w-[240px] gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                        <p className="text-xs font-medium text-muted-foreground">카드 타입</p>
                        <p className="mt-1 font-mono text-sm text-foreground">
                          {selectedTemplate.card_type}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                        <p className="text-xs font-medium text-muted-foreground">툴 이름</p>
                        <p className="mt-1 font-mono text-sm text-foreground">
                          {selectedTemplate.tool_name}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                        <p className="text-xs font-medium text-muted-foreground">데이터 연결</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {bindingEditState.length}개 슬롯
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                        <p className="text-xs font-medium text-muted-foreground">판단 기준</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {editState.decisionInputs.length}개 입력
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <Tabs defaultValue="setup" className="mt-4 gap-4">
                  <TabsList
                    variant="line"
                    className="h-auto w-full flex-wrap justify-start rounded-2xl border border-border/60 bg-muted/30 p-1"
                  >
                    <TabsTrigger value="setup" className="rounded-xl px-3 py-2 text-sm">
                      기본 설정
                    </TabsTrigger>
                    <TabsTrigger value="bindings" className="rounded-xl px-3 py-2 text-sm">
                      데이터 연결
                    </TabsTrigger>
                    <TabsTrigger value="decision" className="rounded-xl px-3 py-2 text-sm">
                      판단 기준
                    </TabsTrigger>
                    <TabsTrigger value="verify" className="rounded-xl px-3 py-2 text-sm">
                      검증 및 배포
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="setup" className="space-y-4">
                    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                      <div className="rounded-2xl border border-border/60 bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">활성화 설정</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              전역 기본값과 현재 시나리오 덮어쓰기를 먼저 정리하세요.
                            </p>
                          </div>
                          <Badge variant="secondary">
                            {getScenarioOverrideLabel(selectedTemplate.scenario_override_enabled)}
                          </Badge>
                        </div>

                        <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">Global Default</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                모든 시나리오에서 기본으로 사용할지 결정합니다.
                              </p>
                            </div>
                            <Switch
                              checked={selectedTemplate.is_enabled === 1}
                              onCheckedChange={(checked) =>
                                updateTemplate(selectedTemplate.id, { isEnabled: checked })
                              }
                              disabled={isSaving}
                            />
                          </div>
                        </div>

                        <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                          <div className="flex items-center gap-2">
                            <WandSparkles className="h-4 w-4 text-violet-500" />
                            <p className="text-sm font-medium text-foreground">Scenario Override</p>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            현재 시나리오 <span className="font-mono">{data?.currentScenarioId}</span> 에서
                            동작을 강제로 바꿉니다.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant={
                                selectedTemplate.scenario_override_enabled === true
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() =>
                                updateTemplate(selectedTemplate.id, {
                                  scenarioId: data?.currentScenarioId,
                                  scenarioEnabled: true,
                                })
                              }
                              disabled={isSaving}
                            >
                              Force On
                            </Button>
                            <Button
                              size="sm"
                              variant={
                                selectedTemplate.scenario_override_enabled === false
                                  ? "destructive"
                                  : "outline"
                              }
                              onClick={() =>
                                updateTemplate(selectedTemplate.id, {
                                  scenarioId: data?.currentScenarioId,
                                  scenarioEnabled: false,
                                })
                              }
                              disabled={isSaving}
                            >
                              Force Off
                            </Button>
                            <Button
                              size="sm"
                              variant={
                                selectedTemplate.scenario_override_enabled === null
                                  ? "secondary"
                                  : "outline"
                              }
                              onClick={() =>
                                updateTemplate(selectedTemplate.id, {
                                  scenarioId: data?.currentScenarioId,
                                  scenarioEnabled: null,
                                })
                              }
                              disabled={isSaving}
                            >
                              Use Global
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl border border-border/60 bg-card p-4">
                          <p className="text-sm font-semibold text-foreground">선택 규칙</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            어떤 페이지, 어떤 역할, 어떤 키워드에서 이 템플릿을 우선 선택할지 정합니다.
                          </p>

                          <div className="mt-4 space-y-4">
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-foreground">Keywords</p>
                                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                    사용자 메시지에 이 단어가 포함되면 템플릿 선택 우선순위가 올라갑니다.
                                  </p>
                                </div>
                                <Badge variant="secondary">{editState.keywords.length}개</Badge>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {editState.keywords.map((kw) => (
                                  <Badge
                                    key={kw}
                                    variant="secondary"
                                    className="gap-1 rounded-full px-3 py-1 pr-1 text-xs"
                                  >
                                    {kw}
                                    <button
                                      type="button"
                                      onClick={() => removeKeyword(kw)}
                                      className="rounded-full p-0.5 hover:bg-muted"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                              <div className="mt-3 flex gap-2">
                                <Input
                                  value={newKeyword}
                                  onChange={(e) => setNewKeyword(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      addKeyword();
                                    }
                                  }}
                                  placeholder="키워드 추가 후 Enter"
                                  className="h-9 text-sm"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={addKeyword}
                                  disabled={!newKeyword.trim()}
                                  className="h-9"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>

                            <Separator />

                            <div className="grid gap-4 lg:grid-cols-2">
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">Allowed Pages</p>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                      이 템플릿이 활성화될 페이지를 선택하세요.
                                    </p>
                                  </div>
                                  <Badge variant="secondary">
                                    {editState.allowedPages.length || "전체"}
                                  </Badge>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {ALL_PAGES.map((page) => (
                                    <label
                                      key={page}
                                      className="flex cursor-pointer items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-sm"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={editState.allowedPages.includes(page)}
                                        onChange={() => togglePage(page)}
                                        className="rounded border-border"
                                      />
                                      <span className="font-mono text-xs">{page}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">Allowed Roles</p>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                      비어 있으면 모든 역할에서 사용할 수 있습니다.
                                    </p>
                                  </div>
                                  <Badge variant="secondary">
                                    {editState.allowedRoles.length || "전체"}
                                  </Badge>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {ALL_ROLES.map((role) => (
                                    <label
                                      key={role}
                                      className="flex cursor-pointer items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-sm"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={editState.allowedRoles.includes(role)}
                                        onChange={() => toggleRole(role)}
                                        className="rounded border-border"
                                      />
                                      <span className="font-mono text-xs">{role}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-border/60 bg-card p-4">
                          <p className="text-sm font-semibold text-foreground">Prompt Hint</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            AI가 이 템플릿을 선택할 때 참고하는 설명을 간단히 남겨두세요.
                          </p>
                          <textarea
                            value={editState.promptHint}
                            onChange={(e) =>
                              setEditState({ ...editState, promptHint: e.target.value })
                            }
                            rows={4}
                            className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="bindings" className="space-y-4">
                    <div className="rounded-2xl border border-border/60 bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">데이터 연결</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            필요한 데이터 슬롯만 펼쳐서 수정하세요. 나머지는 요약만 보고 지나갈 수 있습니다.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={saveBindingConfig}
                          disabled={isSaving}
                        >
                          <Save className="mr-1 h-3.5 w-3.5" />
                          Binding 저장
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                          <p className="text-xs font-medium text-muted-foreground">전체 슬롯</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {bindingEditState.length}개
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                          <p className="text-xs font-medium text-muted-foreground">필수 슬롯</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {requiredBindingCount}개
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                          <p className="text-xs font-medium text-muted-foreground">현재 열린 항목</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {expandedBindingId
                              ? bindingEditState.find((binding) => binding.bindingId === expandedBindingId)
                                  ?.slot ?? "없음"
                              : "없음"}
                          </p>
                        </div>
                      </div>

                      {bindingSaveError && (
                        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                          {bindingSaveError}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      {bindingEditState.map((binding) => {
                        const isExpanded = expandedBindingId === binding.bindingId;
                        const bindingSummary =
                          binding.sourceHandlerKey ||
                          binding.sourceUrl ||
                          binding.sourceId ||
                          "연결 정보가 아직 비어 있습니다.";

                        return (
                          <div
                            key={binding.bindingId}
                            className="overflow-hidden rounded-2xl border border-border/60 bg-card"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedBindingId((current) =>
                                  current === binding.bindingId ? null : binding.bindingId,
                                )
                              }
                              className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-muted/20"
                              aria-expanded={isExpanded}
                            >
                              <div className="flex items-start gap-3">
                                {isExpanded ? (
                                  <ChevronDown className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                )}
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="font-mono text-[11px]">
                                      {binding.slot}
                                    </Badge>
                                    <Badge
                                      variant={binding.required ? "default" : "secondary"}
                                      className="text-[11px]"
                                    >
                                      {binding.required ? "필수" : "선택"}
                                    </Badge>
                                    <Badge variant="secondary" className="text-[11px]">
                                      {getBindingSourceKindLabel(binding.sourceKind)}
                                    </Badge>
                                  </div>
                                  <p className="mt-2 text-sm font-semibold text-foreground">
                                    {binding.outputKey || "카드에 보여줄 이름을 정해주세요"}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                    {bindingSummary}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right text-xs text-muted-foreground">
                                <p>{binding.sourceMethod || "GET"}</p>
                                <p className="mt-1 font-mono">{binding.timeoutMs}ms</p>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="border-t border-border/60 p-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div>
                                    <label className="text-xs font-medium text-muted-foreground">
                                      카드 안에서 보이는 이름
                                    </label>
                                    <Input
                                      value={binding.outputKey}
                                      onChange={(e) =>
                                        updateBindingConfig(binding.bindingId, {
                                          outputKey: e.target.value,
                                        })
                                      }
                                      className="mt-1 h-9 font-mono text-sm"
                                    />
                                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                      {FRIENDLY_TERM_HELP.outputKey}
                                    </p>
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-muted-foreground">
                                      데이터 가져오는 방식
                                    </label>
                                    <Select
                                      value={binding.sourceKind}
                                      onValueChange={(value) =>
                                        updateBindingConfig(binding.bindingId, {
                                          sourceKind: value ?? binding.sourceKind,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="mt-1 h-9 text-sm">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="internal_db">내부 데이터</SelectItem>
                                        <SelectItem value="internal_api">내부 API</SelectItem>
                                        <SelectItem value="external_http">외부 HTTP API</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                  <div>
                                    <label className="text-xs font-medium text-muted-foreground">
                                      Method
                                    </label>
                                    <Select
                                      value={binding.sourceMethod}
                                      onValueChange={(value) =>
                                        updateBindingConfig(binding.bindingId, {
                                          sourceMethod: value ?? binding.sourceMethod,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="mt-1 h-9 text-sm">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="GET">GET</SelectItem>
                                        <SelectItem value="POST">POST</SelectItem>
                                        <SelectItem value="PATCH">PATCH</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-muted-foreground">
                                      Timeout (ms)
                                    </label>
                                    <Input
                                      value={binding.timeoutMs}
                                      onChange={(e) =>
                                        updateBindingConfig(binding.bindingId, {
                                          timeoutMs: e.target.value,
                                        })
                                      }
                                      className="mt-1 h-9 font-mono text-sm"
                                    />
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                  {binding.sourceKind === "internal_db" ? (
                                    <div className="md:col-span-2">
                                      <label className="text-xs font-medium text-muted-foreground">
                                        내부 데이터 호출 이름
                                      </label>
                                      <Input
                                        value={binding.sourceHandlerKey}
                                        onChange={(e) =>
                                          updateBindingConfig(binding.bindingId, {
                                            sourceHandlerKey: e.target.value,
                                          })
                                        }
                                        className="mt-1 h-9 font-mono text-sm"
                                        placeholder="예: incident.detail"
                                      />
                                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                        {FRIENDLY_TERM_HELP.handlerKey}
                                      </p>
                                    </div>
                                  ) : (
                                    <>
                                      <div>
                                        <label className="text-xs font-medium text-muted-foreground">
                                          호출할 주소
                                        </label>
                                        <Input
                                          value={binding.sourceUrl}
                                          onChange={(e) =>
                                            updateBindingConfig(binding.bindingId, {
                                              sourceUrl: e.target.value,
                                            })
                                          }
                                          className="mt-1 h-9 font-mono text-sm"
                                          placeholder="/api/incidents/:id"
                                        />
                                      </div>
                                      <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                        <p className="text-xs font-medium text-muted-foreground">
                                          입력 힌트
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                          <code>:id</code> 같은 URL 파라미터는 아래 Path Params에서
                                          연결하세요.
                                        </p>
                                      </div>
                                    </>
                                  )}
                                </div>

                                <div className="mt-4">
                                  <label className="text-xs font-medium text-muted-foreground">
                                    응답에서 사용할 경로
                                  </label>
                                  <Input
                                    value={binding.sourceResultPath}
                                    onChange={(e) =>
                                      updateBindingConfig(binding.bindingId, {
                                        sourceResultPath: e.target.value,
                                      })
                                    }
                                    className="mt-1 h-9 font-mono text-sm"
                                    placeholder="data.items"
                                  />
                                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                    {FRIENDLY_TERM_HELP.resultPath}
                                  </p>
                                </div>

                                <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                                  <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                                    <KeyValueEditor
                                      label="Input Mapping"
                                      hint="템플릿 인자와 문맥 값을 binding 입력으로 바꿉니다."
                                      rows={parseKeyValueRows(binding.inputMappingText)}
                                      onChange={(rows) =>
                                        updateBindingConfig(binding.bindingId, {
                                          inputMappingText: toJsonText(rows),
                                        })
                                      }
                                      keyPlaceholder="입력 이름 (예: incidentId)"
                                      valuePlaceholder="값 표현식 (예: $args.incidentId)"
                                      suggestions={COMMON_EXPRESSION_SUGGESTIONS}
                                    />
                                  </div>

                                  <div className="space-y-4">
                                    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                                      <KeyValueEditor
                                        label="Path Params"
                                        hint="URL의 :param 에 어떤 binding 입력 키를 넣을지 정합니다."
                                        rows={parseKeyValueRows(binding.sourcePathParamsText)}
                                        onChange={(rows) =>
                                          updateBindingConfig(binding.bindingId, {
                                            sourcePathParamsText: toJsonText(rows),
                                          })
                                        }
                                        keyPlaceholder="URL param (예: id)"
                                        valuePlaceholder="binding 입력 키 (예: incidentId)"
                                      />
                                    </div>
                                    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                                      <KeyValueEditor
                                        label="Query Params"
                                        hint="query string에 넣을 파라미터와 binding 입력 키를 연결합니다."
                                        rows={parseKeyValueRows(binding.sourceQueryParamsText)}
                                        onChange={(rows) =>
                                          updateBindingConfig(binding.bindingId, {
                                            sourceQueryParamsText: toJsonText(rows),
                                          })
                                        }
                                        keyPlaceholder="query key"
                                        valuePlaceholder="binding 입력 키"
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-4 rounded-xl border border-border/60 bg-muted/10 p-3">
                                  <KeyValueEditor
                                    label="Body Mapping"
                                    hint="POST/PATCH body에 어떤 값을 넣을지 key/value 형태로 연결합니다."
                                    rows={parseKeyValueRows(binding.sourceBodyMappingText)}
                                    onChange={(rows) =>
                                      updateBindingConfig(binding.bindingId, {
                                        sourceBodyMappingText: toJsonText(rows),
                                      })
                                    }
                                    keyPlaceholder="body key"
                                    valuePlaceholder="binding 입력 키"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>

                  <TabsContent value="decision" className="space-y-4">
                    <div className="rounded-2xl border border-border/60 bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">판단 기준</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            AI가 템플릿을 선택할 때 꼭 확인해야 하는 근거만 남기고, 항목별 설명은 짧게 유지하세요.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={addDecisionInput}
                          className="h-9 text-sm"
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          판단 기준 추가
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                          <p className="text-xs font-medium text-muted-foreground">전체 입력</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {editState.decisionInputs.length}개
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                          <p className="text-xs font-medium text-muted-foreground">필수 입력</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {requiredDecisionInputCount}개
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                          <p className="text-xs font-medium text-muted-foreground">열린 항목</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {expandedDecisionInputIndex === null
                              ? "없음"
                              : `${expandedDecisionInputIndex + 1}번`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {editState.decisionInputs.length > 0 ? (
                      <div className="space-y-3">
                        {editState.decisionInputs.map((di, index) => {
                          const isExpanded = expandedDecisionInputIndex === index;

                          return (
                            <div
                              key={`${di.input_key}-${index}`}
                              className="overflow-hidden rounded-2xl border border-border/60 bg-card"
                            >
                              <div className="flex items-start justify-between gap-3 p-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedDecisionInputIndex((current) =>
                                      current === index ? null : index,
                                    )
                                  }
                                  className="flex flex-1 items-start gap-3 text-left"
                                  aria-expanded={isExpanded}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline">{index + 1}</Badge>
                                      <Badge variant="secondary">
                                        {getDecisionInputSourceLabel(di.source)}
                                      </Badge>
                                      <Badge variant={di.required ? "default" : "secondary"}>
                                        {di.required ? "필수" : "선택"}
                                      </Badge>
                                    </div>
                                    <p className="mt-2 text-sm font-semibold text-foreground">
                                      {di.label || "라벨을 입력하세요"}
                                    </p>
                                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                      {di.input_key || "input_key"}
                                    </p>
                                    {di.description && (
                                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                        {di.description}
                                      </p>
                                    )}
                                  </div>
                                </button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeDecisionInput(index)}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>

                              {isExpanded && (
                                <div className="border-t border-border/60 p-4">
                                  <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                      <label className="text-xs font-medium text-muted-foreground">
                                        Label
                                      </label>
                                      <Input
                                        value={di.label}
                                        onChange={(e) =>
                                          updateDecisionInput(index, { label: e.target.value })
                                        }
                                        className="mt-1 h-9 text-sm"
                                        placeholder="표시 라벨"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs font-medium text-muted-foreground">
                                        Key
                                      </label>
                                      <Input
                                        value={di.input_key}
                                        onChange={(e) =>
                                          updateDecisionInput(index, {
                                            input_key: e.target.value,
                                          })
                                        }
                                        className="mt-1 h-9 font-mono text-sm"
                                        placeholder="input_key"
                                      />
                                    </div>
                                  </div>

                                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                                    <div>
                                      <label className="text-xs font-medium text-muted-foreground">
                                        Source
                                      </label>
                                      <Select
                                        value={di.source}
                                        onValueChange={(value) =>
                                          updateDecisionInput(index, {
                                            source: (value ?? di.source) as EditDecisionInput["source"],
                                          })
                                        }
                                      >
                                        <SelectTrigger className="mt-1 h-9 text-sm">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {ALL_SOURCES.map((src) => (
                                            <SelectItem key={src} value={src} className="text-sm">
                                              {src}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <label className="text-xs font-medium text-muted-foreground">
                                        Default
                                      </label>
                                      <Input
                                        value={di.default_value ?? ""}
                                        onChange={(e) =>
                                          updateDecisionInput(index, {
                                            default_value: e.target.value || null,
                                          })
                                        }
                                        className="mt-1 h-9 text-sm"
                                        placeholder="기본값 (선택)"
                                      />
                                    </div>
                                    <div className="flex items-end">
                                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm">
                                        <input
                                          type="checkbox"
                                          checked={di.required}
                                          onChange={(e) =>
                                            updateDecisionInput(index, {
                                              required: e.target.checked,
                                            })
                                          }
                                          className="rounded border-border"
                                        />
                                        Required
                                      </label>
                                    </div>
                                  </div>

                                  <div className="mt-4">
                                    <label className="text-xs font-medium text-muted-foreground">
                                      Description
                                    </label>
                                    <Input
                                      value={di.description}
                                      onChange={(e) =>
                                        updateDecisionInput(index, { description: e.target.value })
                                      }
                                      className="mt-1 h-9 text-sm"
                                      placeholder="이 입력 항목이 필요한 이유를 짧게 적어주세요"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
                        <p className="text-sm text-muted-foreground">
                          정의된 판단 근거 입력이 없습니다.
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="verify" className="space-y-4">
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Preview & Test</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            현재 binding과 판단 기준으로 실제 A2UI를 미리 렌더합니다.
                          </p>
                        </div>
                        <Button size="sm" onClick={runPreview} disabled={isPreviewing}>
                          <Play className="mr-1 h-3.5 w-3.5" />
                          {isPreviewing ? "실행 중..." : "Preview 실행"}
                        </Button>
                      </div>

                      {selectedTemplate.sample_cases.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <p className="text-sm font-medium text-foreground">예시 질문</p>
                          <Select value={selectedSampleCaseId} onValueChange={handleSampleCaseChange}>
                            <SelectTrigger className="bg-background">
                              <SelectValue placeholder="샘플 질문 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedTemplate.sample_cases.map((sampleCase) => (
                                <SelectItem key={sampleCase.id} value={sampleCase.id}>
                                  {sampleCase.question}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedTemplate.sample_cases.find(
                            (item) => item.id === selectedSampleCaseId,
                          )?.note && (
                            <p className="text-xs leading-5 text-muted-foreground">
                              {
                                selectedTemplate.sample_cases.find(
                                  (item) => item.id === selectedSampleCaseId,
                                )?.note
                              }
                            </p>
                          )}
                        </div>
                      )}

                      {selectedTemplate.preview_args.length > 0 && (
                        <div className="mt-4 space-y-3">
                          <p className="text-sm font-medium text-foreground">Preview Args</p>
                          <div className="grid gap-3 md:grid-cols-2">
                            {selectedTemplate.preview_args.map((arg) => (
                              <div key={arg.name}>
                                <label className="text-xs font-medium text-muted-foreground">
                                  {arg.name}
                                </label>
                                <Input
                                  value={previewArgs[arg.name] ?? ""}
                                  onChange={(e) =>
                                    setPreviewArgs((current) => ({
                                      ...current,
                                      [arg.name]: e.target.value,
                                    }))
                                  }
                                  className="mt-1 h-9 font-mono text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {previewResult && (
                      <div ref={previewSectionRef} className="space-y-4 scroll-mt-24">
                        {"error" in previewResult.preview ? (
                          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                            {String(previewResult.preview.error)}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-border/60 bg-card p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  Final A2UI Preview
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  현재 binding과 sample case 기준으로 실제 카드가 여기에 렌더됩니다.
                                </p>
                              </div>
                              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
                                Live Render
                              </Badge>
                            </div>
                            {previewActionMessage && (
                              <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                                {previewActionMessage}
                              </div>
                            )}
                            <div className="mt-4">
                              <A2UICardRenderer
                                cardType={
                                  previewInteractiveState?.cardType ??
                                  String(previewResult.preview.cardType ?? "")
                                }
                                cardData={
                                  previewInteractiveState?.cardData ??
                                  ((previewResult.preview.cardData as Record<string, unknown>) ?? {})
                                }
                                onAction={handlePreviewCardAction}
                              />
                            </div>
                            <div className="mt-4">
                              <p className="text-sm font-medium text-foreground">Bound Data</p>
                              <pre className="mt-2 overflow-auto rounded-xl border border-border/60 bg-background/80 p-3 text-[10px] font-mono text-muted-foreground">
                                {JSON.stringify(previewResult.preview.cardData ?? {}, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}

                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="rounded-2xl border border-border/60 bg-card p-4">
                            <p className="text-xs font-medium text-muted-foreground">Status</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {previewResult.success ? "Preview 성공" : "Preview 실패"}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-card p-4">
                            <p className="text-xs font-medium text-muted-foreground">
                              Missing Required
                            </p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {previewResult.diagnostics.missingRequired.length}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-card p-4">
                            <p className="text-xs font-medium text-muted-foreground">Fallback</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                              {previewResult.diagnostics.fallback ?? "none"}
                            </p>
                          </div>
                        </div>

                        {previewResult.diagnostics.warnings.length > 0 && (
                          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                            <p className="text-sm font-medium text-amber-950">Warnings</p>
                            <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-950/80">
                              {previewResult.diagnostics.warnings.map((warning) => (
                                <li key={warning}>• {warning}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
                          <p className="text-sm font-medium text-sky-950">Next Fix Suggestion</p>
                          <p className="mt-2 text-sm leading-6 text-sky-950/80">
                            {diagnosticSummary.nextAction}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="rounded-2xl border border-border/60 bg-card p-4">
                      <p className="text-sm font-semibold text-foreground">Effective Status</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "border",
                            selectedTemplate.effective_scenario_enabled
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                              : "border-border bg-muted text-muted-foreground",
                          )}
                        >
                          {selectedTemplate.effective_scenario_enabled
                            ? "Visible In Current Scenario"
                            : "Hidden In Current Scenario"}
                        </Badge>
                        <Badge variant="secondary">
                          {getScenarioOverrideLabel(selectedTemplate.scenario_override_enabled)}
                        </Badge>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <CheckCircle2 className="h-4 w-4 text-sky-600" />
                            Publish Step
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            publish는 현재 시나리오에서 이 템플릿을 실제 챗봇 후보로 활성화하는 단계입니다.
                          </p>
                        </div>
                        <Button onClick={publishTemplate} disabled={!publishReady || isSaving}>
                          Publish
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            Starter Selected
                          </p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {selectedTemplate ? "Yes" : "No"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            Preview Success
                          </p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {previewResult && !("error" in previewResult.preview) ? "Yes" : "No"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/80 p-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            Enabled For Scenario
                          </p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {selectedTemplate.effective_scenario_enabled ? "Yes" : "No"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-border/60 bg-background/80 p-3">
                        <p className="text-sm font-medium text-foreground">Publish 전에 확인할 것</p>
                        <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                          <li>• starter/template가 지금 의도와 맞는지</li>
                          <li>• preview에서 필수 데이터 누락이 없는지</li>
                          <li>• sandbox에서 실제 질문 흐름이 자연스러운지</li>
                          <li>• 현재 시나리오에서 활성화해도 되는지</li>
                        </ul>
                      </div>

                      {publishMessage && (
                        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-900">
                          {publishMessage}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>

                {hasChanges && (
                  <div className="-mx-6 sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t border-border/50 bg-card px-6 py-3">
                    <p className="text-sm text-amber-600">변경사항이 있습니다</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={discardChanges} disabled={isSaving}>
                        취소
                      </Button>
                      <Button size="sm" onClick={saveEditState} disabled={isSaving}>
                        <Save className="mr-1 h-3.5 w-3.5" />
                        변경사항 저장
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-[320px] items-center justify-center">
                <div className="max-w-md rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-50 text-emerald-700">
                    <Radar className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">
                    Starter를 먼저 선택하세요
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    왼쪽 starter 카드 또는 템플릿 목록에서 하나를 고르면, 데이터 연결과 preview, publish 흐름이 오른쪽에 열립니다.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
