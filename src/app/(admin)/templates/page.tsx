"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers3,
  RefreshCw,
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

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [data, setData] = useState<TemplatesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [newKeyword, setNewKeyword] = useState("");

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
    } else {
      setEditState(null);
    }
  }, [selectedTemplate]);

  const hasChanges = useMemo(() => {
    if (!editState || !selectedTemplate) return false;
    return editStateHasChanges(editState, selectedTemplate);
  }, [editState, selectedTemplate]);

  async function updateTemplate(
    templateId: string,
    body: Record<string, unknown>,
  ) {
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
  }

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

  const saveEditState = useCallback(async () => {
    if (!editState || !selectedTemplate) return;
    await updateTemplate(selectedTemplate.id, {
      keywords: editState.keywords,
      allowedPages: editState.allowedPages,
      allowedRoles: editState.allowedRoles,
      promptHint: editState.promptHint,
      decisionInputs: editState.decisionInputs,
    });
  }, [editState, selectedTemplate]);

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

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
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
                                    source: value as EditDecisionInput["source"],
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
              <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                템플릿을 선택하면 상세 정보가 표시됩니다.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
