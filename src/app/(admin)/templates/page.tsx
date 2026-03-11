"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Layers3,
  RefreshCw,
  WandSparkles,
  ToggleLeft,
  ToggleRight,
  Sparkles,
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

export default function TemplatesPage() {
  const [data, setData] = useState<TemplatesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");

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
              시나리오별로 AI가 사용할 A2UI 템플릿을 켜고 끄는 관리 화면
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

        <Card className="min-h-0">
          <CardHeader className="border-b">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">
              Template Detail
            </CardTitle>
            <CardDescription>
              전역 기본값과 현재 시나리오 override를 함께 관리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 py-4">
            {selectedTemplate ? (
              <>
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

                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Decision Inputs
                    </p>
                    {selectedTemplate.decision_inputs.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {selectedTemplate.decision_inputs.map((inputDef) => (
                          <div
                            key={inputDef.id}
                            className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {inputDef.label}
                              </span>
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {inputDef.input_key}
                              </Badge>
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {inputDef.source}
                              </Badge>
                              {inputDef.required === 1 && (
                                <Badge variant="destructive" className="font-mono text-[10px]">
                                  required
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {inputDef.description}
                            </p>
                            {inputDef.default_value && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                default: <span className="font-mono">{inputDef.default_value}</span>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        정의된 판단근거 입력이 없습니다.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Prompt Hint
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {selectedTemplate.prompt_hint}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Keywords
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {getRuleValues(selectedTemplate.rules, "keyword").map((keyword) => (
                        <Badge key={keyword} variant="secondary" className="font-mono">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                        Allowed Pages
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {getRuleValues(selectedTemplate.rules, "page").map((page) => (
                          <Badge key={page} variant="outline" className="font-mono">
                            {page}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                        Allowed Roles
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {getRuleValues(selectedTemplate.rules, "role").length > 0 ? (
                          getRuleValues(selectedTemplate.rules, "role").map((role) => (
                            <Badge key={role} variant="outline" className="font-mono">
                              {role}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">All roles</span>
                        )}
                      </div>
                    </div>
                  </div>

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
                </div>
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
