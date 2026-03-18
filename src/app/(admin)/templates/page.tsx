"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers3,
  RefreshCw,
  Play,
  CheckCircle2,
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
      setEditState(buildEditStateFromTemplate(selectedTemplate));
      setNewKeyword("");
      setPreviewArgs(
        Object.fromEntries(
          selectedTemplate.preview_args.map((arg) => [arg.name, arg.sample_value]),
        ),
      );
      setBindingEditState(buildEditableBindings(selectedTemplate));
      setBindingSaveError(null);
      setSelectedSampleCaseId(selectedTemplate.sample_cases[0]?.id ?? "");
      setPreviewResult(null);
    } else {
      setEditState(null);
      setPreviewArgs({});
      setBindingEditState([]);
      setBindingSaveError(null);
      setSelectedSampleCaseId("");
      setPreviewResult(null);
    }
  }, [selectedTemplate]);

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

    setPreviewArgs(
      Object.fromEntries(
        selectedTemplate.preview_args.map((arg) => [
          arg.name,
          typeof sampleCase.args[arg.name] !== "undefined"
            ? String(sampleCase.args[arg.name] ?? "")
            : arg.sample_value,
        ]),
      ),
    );
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

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-sm font-mono uppercase tracking-wider">
              What You Need To Fill
            </CardTitle>
            <CardDescription>
              기술 용어를 몰라도 아래 네 가지를 채우면 builder를 사용할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: "어떤 화면을 띄울지",
                body: "starter/template를 고릅니다.",
              },
              {
                title: "어디서 데이터를 가져올지",
                body: "내부 데이터인지, API인지 선택합니다.",
              },
              {
                title: "어떤 값을 넣을지",
                body: "질문/문맥 값을 입력 이름에 연결합니다.",
              },
              {
                title: "정상인지 확인",
                body: "preview와 sandbox로 실제 결과를 봅니다.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-border/60 bg-card p-4"
              >
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-sm font-mono uppercase tracking-wider">
              Friendly Terms
            </CardTitle>
            <CardDescription>
              화면에 보이는 고급 용어를 사용자 기준으로 다시 설명합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
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
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider">
              <Radar className="h-4 w-4 text-emerald-600" />
              Starter Selection
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
                onClick={() => setSelectedId(template.id)}
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
                    Sample Questions
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
              Question Simulator
            </CardTitle>
            <CardDescription>
              질문을 넣으면 어떤 템플릿이 선택되고 어떤 A2UI가 나올지 미리 확인합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Question
              </label>
              <Input
                value={simulatorQuestion}
                onChange={(e) => setSimulatorQuestion(e.target.value)}
                placeholder="예: 이 배포 rollback 해야 해?"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Page
                </label>
                <Select value={simulatorPage} onValueChange={(value) => setSimulatorPage(value ?? "deployments")}>
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
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Role
                </label>
                <Select value={simulatorRole} onValueChange={(value) => setSimulatorRole(value ?? "ops_engineer")}>
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
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Selected Template
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {simulationResult.selectedTemplate?.name ?? "선택 없음"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Tool
                    </p>
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
                {simulationResult.diagnostics.candidates.length > 0 && (
                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Candidate Ranking
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {simulationResult.diagnostics.candidates.map((candidate) => (
                        <Badge key={candidate.id} variant="secondary" className="font-mono">
                          {candidate.name} · {candidate.matchedKeywordCount}
                        </Badge>
                      ))}
                    </div>
                  </div>
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
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider">
              <WandSparkles className="h-4 w-4 text-emerald-600" />
              Chat Sandbox
            </CardTitle>
            <CardDescription>
              publish 전에 실제 챗봇처럼 질문을 넣고 A2UI가 어떻게 보일지 확인합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider">
              <CheckCircle2 className="h-4 w-4 text-violet-600" />
              Recent Activity
            </CardTitle>
            <CardDescription>
              preview, simulate, publish 이후의 최근 템플릿 활동과 진단 기록입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
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
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      최근 경고 수
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {diagnosticSummary.warningCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      필수 누락 수
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {diagnosticSummary.missingRequiredCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      대체 경로 사용
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {diagnosticSummary.fallbackCount}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-sky-900">
                    Recommended Next Action
                  </p>
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
              A2UI Templates
            </h2>
            <p className="text-sm text-muted-foreground">
              AI가 사용할 A2UI 템플릿의 판단 기준을 관리하는 화면
            </p>
          </div>
        </div>

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
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total Templates</CardDescription>
            <CardTitle className="font-mono text-3xl">
              {data?.counts.total ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Global Enabled</CardDescription>
            <CardTitle className="font-mono text-3xl text-emerald-400">
              {data?.counts.enabled ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Enabled In Scenario</CardDescription>
            <CardTitle className="font-mono text-3xl text-violet-400">
              {data?.counts.effectiveForScenario ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Current Scenario</CardDescription>
            <CardTitle className="font-mono text-base leading-snug">
              {currentScenario?.title ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
        {/* ── Template List ── */}
        <Card className="min-h-0">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="font-mono text-sm uppercase tracking-wider">
                  Template Inventory
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
                  <TableHead>Template</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Global</TableHead>
                  <TableHead>Scenario</TableHead>
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
                    onClick={() => setSelectedId(template.id)}
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
        <Card className="min-h-0 overflow-y-auto max-h-[calc(100vh-280px)]">
          <CardHeader className="border-b sticky top-0 bg-card z-10">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="font-mono text-sm uppercase tracking-wider">
                  Template Detail
                </CardTitle>
                <CardDescription>
                  판단 기준을 편집하고 저장하세요.
                </CardDescription>
              </div>
              {hasChanges && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={discardChanges}
                    disabled={isSaving}
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveEditState}
                    disabled={isSaving}
                  >
                    <Save className="h-3.5 w-3.5 mr-1" />
                    저장
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5 py-4">
            {selectedTemplate && editState ? (
              <>
                {/* ── Header Info ── */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        {selectedTemplate.name}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedTemplate.description}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("border", getCategoryBadgeClass(selectedTemplate.category))}
                    >
                      {selectedTemplate.category}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Card Type
                    </p>
                    <p className="mt-1 font-mono text-sm text-foreground">
                      {selectedTemplate.card_type}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Tool Name
                    </p>
                    <p className="mt-1 font-mono text-sm text-foreground">
                      {selectedTemplate.tool_name}
                    </p>
                  </div>
                </div>

                {/* ── Binding Overview ── */}
                <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">데이터 연결</p>
                      <p className="text-xs text-muted-foreground">
                        이 템플릿이 필요한 데이터를 어디서 가져올지, 어떤 이름으로 카드에 넣을지 설정합니다.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={saveBindingConfig} disabled={isSaving}>
                      <Save className="mr-1 h-3.5 w-3.5" />
                      Binding 저장
                    </Button>
                  </div>
                  {bindingSaveError && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                      {bindingSaveError}
                    </div>
                  )}
                  <div className="space-y-3">
                    {bindingEditState.map((binding) => (
                      <div
                        key={binding.bindingId}
                        className="rounded-lg border border-border/50 bg-muted/10 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {binding.slot}
                            </Badge>
                            <Badge
                              variant={binding.required ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {binding.required ? "required" : "optional"}
                            </Badge>
                          </div>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {binding.sourceId || "source missing"}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground">
                              카드 안에서 보이는 이름
                            </label>
                            <Input
                              value={binding.outputKey}
                              onChange={(e) =>
                                updateBindingConfig(binding.bindingId, {
                                  outputKey: e.target.value,
                                })
                              }
                              className="mt-0.5 h-8 font-mono text-xs"
                            />
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {FRIENDLY_TERM_HELP.outputKey}
                            </p>
                          </div>
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground">
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
                              <SelectTrigger className="mt-0.5 h-8 text-xs">
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
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground">
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
                              <SelectTrigger className="mt-0.5 h-8 text-xs">
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
                            <label className="text-[10px] font-mono text-muted-foreground">
                              Timeout (ms)
                            </label>
                            <Input
                              value={binding.timeoutMs}
                              onChange={(e) =>
                                updateBindingConfig(binding.bindingId, {
                                  timeoutMs: e.target.value,
                                })
                              }
                              className="mt-0.5 h-8 font-mono text-xs"
                            />
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {binding.sourceKind === "internal_db" ? (
                            <>
                              <div className="md:col-span-2">
                                <label className="text-[10px] font-mono text-muted-foreground">
                                  내부 데이터 호출 이름
                                </label>
                                <Input
                                  value={binding.sourceHandlerKey}
                                  onChange={(e) =>
                                    updateBindingConfig(binding.bindingId, {
                                      sourceHandlerKey: e.target.value,
                                    })
                                  }
                                  className="mt-0.5 h-8 font-mono text-xs"
                                  placeholder="예: incident.detail"
                                />
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {FRIENDLY_TERM_HELP.handlerKey}
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <label className="text-[10px] font-mono text-muted-foreground">
                                  호출할 주소
                                </label>
                                <Input
                                  value={binding.sourceUrl}
                                  onChange={(e) =>
                                    updateBindingConfig(binding.bindingId, { sourceUrl: e.target.value })
                                  }
                                  className="mt-0.5 h-8 font-mono text-xs"
                                  placeholder="/api/incidents/:id"
                                />
                              </div>
                              <div className="rounded-lg border border-border/40 bg-background/70 p-3">
                                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                  Helper
                                </p>
                                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                  `:id` 같은 URL 파라미터는 아래 Path Params에서 연결하세요.
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="mt-3">
                          <label className="text-[10px] font-mono text-muted-foreground">
                            응답에서 사용할 경로
                          </label>
                          <Input
                            value={binding.sourceResultPath}
                            onChange={(e) =>
                              updateBindingConfig(binding.bindingId, {
                                sourceResultPath: e.target.value,
                              })
                            }
                            className="mt-0.5 h-8 font-mono text-xs"
                            placeholder="data.items"
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {FRIENDLY_TERM_HELP.resultPath}
                          </p>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div>
                            <KeyValueEditor
                              label="Input Mapping"
                              hint="템플릿 인자/문맥 값을 binding 입력으로 바꿉니다. 자주 쓰는 표현식을 바로 넣을 수 있습니다."
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
                          <div className="space-y-3">
                            <div>
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
                            <div>
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
                        <div className="mt-3">
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
                    ))}
                  </div>
                </div>

                {/* ── Global Default Toggle ── */}
                <div className="rounded-xl border border-border/60 bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Global Default</p>
                      <p className="text-xs text-muted-foreground">
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

                {/* ── Scenario Override ── */}
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                  <div className="flex items-center gap-2">
                    <WandSparkles className="h-4 w-4 text-violet-400" />
                    <p className="text-sm font-medium text-foreground">
                      Scenario Override
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    현재 시나리오 <span className="font-mono">{data?.currentScenarioId}</span> 에서의
                    동작을 덮어씁니다.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={selectedTemplate.scenario_override_enabled === true ? "default" : "outline"}
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
                      variant={selectedTemplate.scenario_override_enabled === false ? "destructive" : "outline"}
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
                      variant={selectedTemplate.scenario_override_enabled === null ? "secondary" : "outline"}
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

                <Separator />

                {/* ── Keywords (Editable Tags) ── */}
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Keywords
                  </p>
                  <p className="text-xs text-muted-foreground">
                    사용자 메시지에 이 키워드가 포함되면 이 템플릿 선택 우선순위가 올라갑니다.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {editState.keywords.map((kw) => (
                      <Badge
                        key={kw}
                        variant="secondary"
                        className="font-mono gap-1 pr-1"
                      >
                        {kw}
                        <button
                          type="button"
                          onClick={() => removeKeyword(kw)}
                          className="ml-1 rounded-full hover:bg-muted p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addKeyword();
                        }
                      }}
                      placeholder="키워드 추가 (Enter)"
                      className="h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addKeyword}
                      disabled={!newKeyword.trim()}
                      className="h-8"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* ── Allowed Pages (Checkboxes) ── */}
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Allowed Pages
                  </p>
                  <p className="text-xs text-muted-foreground">
                    이 템플릿이 활성화될 페이지를 선택하세요.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {ALL_PAGES.map((page) => (
                      <label
                        key={page}
                        className="flex items-center gap-1.5 text-sm cursor-pointer"
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

                {/* ── Allowed Roles (Checkboxes) ── */}
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Allowed Roles
                  </p>
                  <p className="text-xs text-muted-foreground">
                    비어있으면 모든 역할에서 사용 가능합니다.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {ALL_ROLES.map((role) => (
                      <label
                        key={role}
                        className="flex items-center gap-1.5 text-sm cursor-pointer"
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

                {/* ── Prompt Hint (Editable Textarea) ── */}
                <div className="space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Prompt Hint
                  </p>
                  <p className="text-xs text-muted-foreground">
                    AI가 이 템플릿을 선택할 때 참고하는 힌트 문구입니다.
                  </p>
                  <textarea
                    value={editState.promptHint}
                    onChange={(e) =>
                      setEditState({ ...editState, promptHint: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <Separator />

                {/* ── Preview / Test ── */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Preview & Test</p>
                      <p className="text-xs text-muted-foreground">
                        현재 binding/source 구성으로 실제 A2UI를 미리 렌더합니다.
                      </p>
                    </div>
                    <Button size="sm" onClick={runPreview} disabled={isPreviewing}>
                      <Play className="mr-1 h-3.5 w-3.5" />
                      {isPreviewing ? "실행 중..." : "Preview 실행"}
                    </Button>
                  </div>

                  {selectedTemplate.sample_cases.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                        Sample Question
                      </p>
                      <Select
                        value={selectedSampleCaseId}
                        onValueChange={handleSampleCaseChange}
                      >
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
                      {selectedTemplate.sample_cases.find((item) => item.id === selectedSampleCaseId)?.note && (
                        <p className="text-xs text-muted-foreground">
                          {selectedTemplate.sample_cases.find((item) => item.id === selectedSampleCaseId)?.note}
                        </p>
                      )}
                    </div>
                  )}

                  {selectedTemplate.preview_args.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                        Preview Args
                      </p>
                      <div className="grid gap-2 md:grid-cols-2">
                        {selectedTemplate.preview_args.map((arg) => (
                          <div key={arg.name}>
                            <label className="text-[10px] font-mono text-muted-foreground">
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
                              className="mt-0.5 h-8 font-mono text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {previewResult && (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            Status
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {previewResult.success ? "Preview 성공" : "Preview 실패"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            Missing Required
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {previewResult.diagnostics.missingRequired.length}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            Fallback
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {previewResult.diagnostics.fallback ?? "none"}
                          </p>
                        </div>
                      </div>

                      {previewResult.diagnostics.warnings.length > 0 && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                          <p className="text-[11px] font-mono uppercase tracking-wider text-amber-900">
                            Warnings
                          </p>
                          <ul className="mt-2 space-y-1 text-xs text-amber-950/80">
                            {previewResult.diagnostics.warnings.map((warning) => (
                              <li key={warning}>• {warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
                        <p className="text-[11px] font-mono uppercase tracking-wider text-sky-900">
                          Next Fix Suggestion
                        </p>
                        <p className="mt-2 text-sm text-sky-950/80">
                          {diagnosticSummary.nextAction}
                        </p>
                      </div>

                      {"error" in previewResult.preview ? (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                          {String(previewResult.preview.error)}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                              Final A2UI Preview
                            </p>
                          </div>
                          <A2UICardRenderer
                            cardType={String(previewResult.preview.cardType ?? "")}
                            cardData={(previewResult.preview.cardData as Record<string, unknown>) ?? {}}
                          />
                          <div>
                            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                              Bound Data
                            </p>
                            <pre className="mt-1 overflow-auto rounded-lg border border-border/50 bg-background/80 p-3 text-[10px] font-mono text-muted-foreground">
                              {JSON.stringify(previewResult.preview.cardData ?? {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                {/* ── Decision Inputs (Editable) ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                        Decision Inputs
                      </p>
                      <p className="text-xs text-muted-foreground">
                        AI가 템플릿 선택 시 수집하는 판단 근거 항목들
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={addDecisionInput} className="h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" />
                      추가
                    </Button>
                  </div>

                  {editState.decisionInputs.length > 0 ? (
                    <div className="space-y-3">
                      {editState.decisionInputs.map((di, index) => (
                        <div
                          key={`${di.input_key}-${index}`}
                          className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 grid gap-2 sm:grid-cols-2">
                              <div>
                                <label className="text-[10px] font-mono text-muted-foreground">Label</label>
                                <Input
                                  value={di.label}
                                  onChange={(e) =>
                                    updateDecisionInput(index, { label: e.target.value })
                                  }
                                  className="h-7 text-xs mt-0.5"
                                  placeholder="표시 라벨"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-mono text-muted-foreground">Key</label>
                                <Input
                                  value={di.input_key}
                                  onChange={(e) =>
                                    updateDecisionInput(index, { input_key: e.target.value })
                                  }
                                  className="h-7 text-xs font-mono mt-0.5"
                                  placeholder="input_key"
                                />
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeDecisionInput(index)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3">
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground">Source</label>
                              <Select
                                value={di.source}
                                onValueChange={(value) =>
                                  updateDecisionInput(index, {
                                    source: (value ?? di.source) as EditDecisionInput["source"],
                                  })
                                }
                              >
                                <SelectTrigger className="h-7 text-xs mt-0.5">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ALL_SOURCES.map((src) => (
                                    <SelectItem key={src} value={src} className="text-xs">
                                      {src}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-[10px] font-mono text-muted-foreground">Default</label>
                              <Input
                                value={di.default_value ?? ""}
                                onChange={(e) =>
                                  updateDecisionInput(index, {
                                    default_value: e.target.value || null,
                                  })
                                }
                                className="h-7 text-xs mt-0.5"
                                placeholder="기본값 (선택)"
                              />
                            </div>
                            <div className="flex items-end gap-2 pb-0.5">
                              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={di.required}
                                  onChange={(e) =>
                                    updateDecisionInput(index, { required: e.target.checked })
                                  }
                                  className="rounded border-border"
                                />
                                Required
                              </label>
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] font-mono text-muted-foreground">Description</label>
                            <Input
                              value={di.description}
                              onChange={(e) =>
                                updateDecisionInput(index, { description: e.target.value })
                              }
                              className="h-7 text-xs mt-0.5"
                              placeholder="이 입력 항목에 대한 설명"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">
                      정의된 판단근거 입력이 없습니다.
                    </p>
                  )}
                </div>

                <Separator />

                {/* ── Effective Status ── */}
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Effective Status
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "border",
                        selectedTemplate.effective_scenario_enabled
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {selectedTemplate.effective_scenario_enabled ? "Visible In Current Scenario" : "Hidden In Current Scenario"}
                    </Badge>
                    <Badge variant="secondary">
                      {getScenarioOverrideLabel(selectedTemplate.scenario_override_enabled)}
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <CheckCircle2 className="h-4 w-4 text-sky-600" />
                        Publish Step
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        publish는 현재 시나리오에서 이 템플릿을 실제 챗봇 후보로 활성화하는 단계입니다.
                      </p>
                    </div>
                    <Button onClick={publishTemplate} disabled={!publishReady || isSaving}>
                      Publish
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Starter Selected
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {selectedTemplate ? "Yes" : "No"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Preview Success
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {previewResult && !("error" in previewResult.preview) ? "Yes" : "No"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Enabled For Scenario
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {selectedTemplate?.effective_scenario_enabled ? "Yes" : "No"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Publish 전에 확인할 것
                    </p>
                    <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                      <li>• starter/template가 지금 의도와 맞는지</li>
                      <li>• preview에서 필수 데이터 누락이 없는지</li>
                      <li>• sandbox에서 실제 질문 흐름이 자연스러운지</li>
                      <li>• 현재 시나리오에서 활성화해도 되는지</li>
                    </ul>
                  </div>

                  {publishMessage && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-900">
                      {publishMessage}
                    </div>
                  )}
                </div>

                {/* ── Save Bar (sticky bottom) ── */}
                {hasChanges && (
                  <div className="sticky bottom-0 bg-card border-t border-border/50 -mx-6 px-6 py-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-amber-400">변경사항이 있습니다</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={discardChanges} disabled={isSaving}>
                        취소
                      </Button>
                      <Button size="sm" onClick={saveEditState} disabled={isSaving}>
                        <Save className="h-3.5 w-3.5 mr-1" />
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
