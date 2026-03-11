"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Rocket,
  ChevronRight,
  FileCode,
  ShieldCheck,
  RotateCcw,
  Plus,
  Play,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useOperator } from "@/lib/operators";
import { useSyncSelectedEntity } from "@/lib/selected-entity";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type DeploymentStatus = "pending" | "running" | "succeeded" | "failed" | "rolled_back";
type RollbackPlanStatus = "draft" | "dry_run_ready" | "approved" | "executed" | "failed";
type RiskCheckStatus = "pass" | "warn" | "fail";
type ChangeType = "added" | "modified" | "deleted";
type RollbackStepStatus = "pending" | "running" | "done" | "failed";

interface Deployment {
  id: string;
  service_id: string;
  environment: "production" | "staging" | "development";
  version: string;
  previous_version: string;
  status: DeploymentStatus;
  rollout_percent: number;
  deployed_by: string;
  created_at: string;
  updated_at: string;
}

interface DeploymentDiff {
  id: string;
  deployment_id: string;
  file_path: string;
  change_type: ChangeType;
  additions: number;
  deletions: number;
  content: string;
}

interface RiskCheck {
  id: string;
  deployment_id: string;
  check_name: string;
  status: RiskCheckStatus;
  detail: string;
}

interface RollbackStep {
  id: string;
  rollback_plan_id: string;
  step_order: number;
  action: string;
  status: RollbackStepStatus;
  detail: string;
}

interface RollbackPlan {
  id: string;
  deployment_id: string;
  target_version: string;
  status: RollbackPlanStatus;
  created_by: string;
  approved_by: string | null;
  dry_run_result: string | null;
  created_at: string;
  updated_at: string;
  steps: RollbackStep[];
}

interface DeploymentDetail extends Deployment {
  diffs: DeploymentDiff[];
  riskChecks: RiskCheck[];
  rollbackPlan: RollbackPlan | null;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function deploymentStatusColor(status: DeploymentStatus): string {
  switch (status) {
    case "pending":
      return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    case "running":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "succeeded":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "failed":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "rolled_back":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  }
}

function riskCheckColor(status: RiskCheckStatus): string {
  switch (status) {
    case "pass":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "warn":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "fail":
      return "bg-red-500/20 text-red-400 border-red-500/30";
  }
}

function changeTypeColor(type: ChangeType): string {
  switch (type) {
    case "added":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "modified":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "deleted":
      return "bg-red-500/20 text-red-400 border-red-500/30";
  }
}

function rollbackPlanStatusColor(status: RollbackPlanStatus): string {
  switch (status) {
    case "draft":
      return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    case "dry_run_ready":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "approved":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "executed":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "failed":
      return "bg-red-500/20 text-red-400 border-red-500/30";
  }
}

function rollbackStepStatusColor(status: RollbackStepStatus): string {
  switch (status) {
    case "pending":
      return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    case "running":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "done":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "failed":
      return "bg-red-500/20 text-red-400 border-red-500/30";
  }
}

function environmentColor(env: string): string {
  switch (env) {
    case "production":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "staging":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "development":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    default:
      return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: DeploymentStatus }) {
  const colorMap: Record<DeploymentStatus, string> = {
    pending: "bg-slate-400",
    running: "bg-blue-400 animate-pulse",
    succeeded: "bg-emerald-400",
    failed: "bg-red-400",
    rolled_back: "bg-amber-400",
  };
  return <span className={cn("inline-block h-2 w-2 rounded-full", colorMap[status])} />;
}

function RolloutBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-blue-500 transition-all duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("+")) {
    return (
      <div className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 font-mono text-xs whitespace-pre">
        {line}
      </div>
    );
  }
  if (line.startsWith("-")) {
    return (
      <div className="bg-red-500/10 text-red-400 px-2 py-0.5 font-mono text-xs whitespace-pre">
        {line}
      </div>
    );
  }
  return (
    <div className="text-muted-foreground px-2 py-0.5 font-mono text-xs whitespace-pre">
      {line}
    </div>
  );
}

function DiffEntry({ diff }: { diff: DeploymentDiff }) {
  const [expanded, setExpanded] = useState(false);
  const lines = diff.content ? diff.content.split("\n") : [];

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-card hover:bg-muted/50 transition-colors text-left"
      >
        <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-mono text-xs text-foreground flex-1 truncate">{diff.file_path}</span>
        <span className="text-xs text-emerald-400 font-mono shrink-0">+{diff.additions}</span>
        <span className="text-xs text-red-400 font-mono shrink-0">-{diff.deletions}</span>
        <Badge className={cn("text-xs border shrink-0", changeTypeColor(diff.change_type))}>
          {diff.change_type}
        </Badge>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && lines.length > 0 && (
        <div className="border-t border-border/50 bg-muted/20 overflow-x-auto">
          {lines.map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

function RiskCheckEntry({ check }: { check: RiskCheck }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border/50 bg-card">
      <Badge className={cn("text-xs border shrink-0 mt-0.5", riskCheckColor(check.status))}>
        {check.status}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground font-mono">{check.check_name}</p>
        {check.detail && (
          <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
        )}
      </div>
    </div>
  );
}

// ─── Rollback Tab ─────────────────────────────────────────────────────────────

interface RollbackTabProps {
  deployment: DeploymentDetail;
  onPlanUpdate: (plan: RollbackPlan) => void;
}

function RollbackTab({ deployment, onPlanUpdate }: RollbackTabProps) {
  const { currentOperator } = useOperator();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetVersion, setTargetVersion] = useState(deployment.previous_version ?? "");
  const [reason, setReason] = useState("");

  const plan = deployment.rollbackPlan;
  const canAct = currentOperator?.role === "release_manager" || currentOperator?.role === "ops_engineer";

  async function createPlan() {
    if (!currentOperator) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deployments/${deployment.id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetVersion,
          actorId: currentOperator.id,
          reason: reason || "Rollback plan created",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create rollback plan");
      }
      const data = await res.json();
      onPlanUpdate(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function patchPlan(action: "dry-run" | "approve" | "execute") {
    if (!currentOperator) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deployments/${deployment.id}/rollback`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          actorId: currentOperator.id,
          reason: reason || action,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Failed to ${action}`);
      }
      const data = await res.json();
      onPlanUpdate(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        {!canAct && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Only Release Managers and Ops Engineers can create rollback plans.
          </div>
        )}
        {canAct && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              No rollback plan exists for this deployment.
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                Target Version
              </label>
              <Input
                value={targetVersion}
                onChange={(e) => setTargetVersion(e.target.value)}
                placeholder="e.g. v1.2.3"
                className="font-mono text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                Reason (optional)
              </label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for rollback..."
                className="text-sm"
              />
            </div>
            <Button
              onClick={createPlan}
              disabled={loading || !targetVersion.trim()}
              size="sm"
              className="self-start"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Create Rollback Plan
            </Button>
          </div>
        )}
        {error && (
          <p className="text-xs text-red-400 font-mono">{error}</p>
        )}
      </div>
    );
  }

  const dryRunResult = plan.dry_run_result ? (() => {
    try { return JSON.parse(plan.dry_run_result); } catch { return null; }
  })() : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Plan header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className={cn("border text-xs", rollbackPlanStatusColor(plan.status))}>
          {plan.status.replace("_", " ")}
        </Badge>
        <span className="text-xs text-muted-foreground font-mono">
          Target: <span className="text-foreground">{plan.target_version}</span>
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          Created by: <span className="text-foreground">{plan.created_by}</span>
        </span>
        {plan.approved_by && (
          <span className="text-xs text-muted-foreground font-mono">
            Approved by: <span className="text-foreground">{plan.approved_by}</span>
          </span>
        )}
      </div>

      {/* Steps list */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Steps</p>
        {plan.steps.map((step) => (
          <div
            key={step.id}
            className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border/50 bg-card"
          >
            <span className="text-xs text-muted-foreground font-mono shrink-0 w-4 text-right">
              {step.step_order}.
            </span>
            <Badge className={cn("border text-xs shrink-0 mt-0.5", rollbackStepStatusColor(step.status))}>
              {step.status}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{step.action}</p>
              {step.detail && (
                <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Dry-run result */}
      {dryRunResult && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
            Dry-Run Result
          </p>
          <div className="flex flex-wrap gap-3 text-xs font-mono">
            <span>
              Steps checked:{" "}
              <span className="text-foreground">{dryRunResult.stepsChecked}</span>
            </span>
            <span>
              Result:{" "}
              <span
                className={
                  dryRunResult.result === "pass" ? "text-emerald-400" : "text-red-400"
                }
              >
                {dryRunResult.result}
              </span>
            </span>
          </div>
          {dryRunResult.notes && (
            <p className="text-xs text-muted-foreground mt-1.5">{dryRunResult.notes}</p>
          )}
        </div>
      )}

      {/* Reason input */}
      {canAct && plan.status !== "executed" && plan.status !== "failed" && (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
            Reason (optional)
          </label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for this action..."
            className="text-sm"
          />
        </div>
      )}

      {/* Action buttons */}
      {canAct && (
        <div className="flex gap-2 flex-wrap">
          {plan.status === "draft" && (
            <Button size="sm" onClick={() => patchPlan("dry-run")} disabled={loading}>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Run Dry-Run
            </Button>
          )}
          {plan.status === "dry_run_ready" && currentOperator?.role === "release_manager" && (
            <Button size="sm" onClick={() => patchPlan("approve")} disabled={loading}>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              Approve
            </Button>
          )}
          {plan.status === "approved" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => patchPlan("execute")}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Execute Rollback
            </Button>
          )}
        </div>
      )}

      {!canAct && plan.status !== "executed" && plan.status !== "failed" && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Only Release Managers and Ops Engineers can advance rollback plans.
        </div>
      )}

      {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  deploymentId: string;
  onClose: () => void;
}

function DetailPanel({ deploymentId, onClose }: DetailPanelProps) {
  const [detail, setDetail] = useState<DeploymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deployments/${deploymentId}`);
      if (!res.ok) throw new Error("Failed to fetch deployment detail");
      const data = await res.json();
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  function handlePlanUpdate(plan: RollbackPlan) {
    setDetail((prev) => prev ? { ...prev, rollbackPlan: plan } : prev);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-2">
        <p className="text-sm text-red-400 font-mono">{error ?? "Not found"}</p>
        <Button variant="outline" size="sm" onClick={fetchDetail}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-foreground text-sm">
              {detail.version}
            </span>
            <span className="text-muted-foreground text-sm">/</span>
            <span className="font-mono text-sm text-muted-foreground">{detail.service_id}</span>
            <Badge className={cn("border text-xs", environmentColor(detail.environment))}>
              {detail.environment}
            </Badge>
            <Badge className={cn("border text-xs", deploymentStatusColor(detail.status))}>
              <StatusDot status={detail.status} />
              {detail.status.replace("_", " ")}
            </Badge>
          </div>
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-mono">Rollout</span>
              <span className="text-xs font-mono text-foreground">{detail.rollout_percent}%</span>
            </div>
            <RolloutBar percent={detail.rollout_percent} />
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1"
          aria-label="Close detail"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="diffs" className="h-full flex flex-col">
          <TabsList className="mx-4 mt-3 mb-0 w-fit shrink-0" variant="default">
            <TabsTrigger value="diffs">
              <FileCode className="h-3.5 w-3.5" />
              Diffs ({detail.diffs.length})
            </TabsTrigger>
            <TabsTrigger value="risks">
              <ShieldCheck className="h-3.5 w-3.5" />
              Risk Checks ({detail.riskChecks.length})
            </TabsTrigger>
            <TabsTrigger value="rollback">
              <RotateCcw className="h-3.5 w-3.5" />
              Rollback
              {detail.rollbackPlan && (
                <Badge
                  className={cn(
                    "ml-1 border text-xs",
                    rollbackPlanStatusColor(detail.rollbackPlan.status)
                  )}
                >
                  {detail.rollbackPlan.status.replace("_", " ")}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-3">
            <TabsContent value="diffs" className="px-4 pb-4">
              {detail.diffs.length === 0 ? (
                <p className="text-sm text-muted-foreground font-mono py-4 text-center">
                  No diffs recorded.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {detail.diffs.map((diff) => (
                    <DiffEntry key={diff.id} diff={diff} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="risks" className="px-4 pb-4">
              {detail.riskChecks.length === 0 ? (
                <p className="text-sm text-muted-foreground font-mono py-4 text-center">
                  No risk checks recorded.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {detail.riskChecks.map((check) => (
                    <RiskCheckEntry key={check.id} check={check} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="rollback" className="px-4 pb-4">
              <RollbackTab deployment={detail} onPlanUpdate={handlePlanUpdate} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Deployment List Item ─────────────────────────────────────────────────────

function DeploymentListItem({
  deployment,
  isSelected,
  onSelect,
}: {
  deployment: Deployment;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border/30 hover:bg-muted/30 transition-colors",
        isSelected && "bg-muted/50 border-l-2 border-l-blue-500"
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <StatusDot status={deployment.status} />
        <span className="font-mono text-sm font-medium text-foreground">
          {deployment.version}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{deployment.service_id}</span>
        <Badge className={cn("border text-xs ml-auto", environmentColor(deployment.environment))}>
          {deployment.environment}
        </Badge>
        <Badge className={cn("border text-xs", deploymentStatusColor(deployment.status))}>
          {deployment.status.replace("_", " ")}
        </Badge>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
            isSelected && "rotate-90"
          )}
        />
      </div>
      <div className="flex items-center gap-3 mt-1.5">
        <div className="flex-1">
          <RolloutBar percent={deployment.rollout_percent} />
        </div>
        <span className="text-xs font-mono text-muted-foreground shrink-0">
          {deployment.rollout_percent}%
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
        <span className="font-mono truncate">by {deployment.deployed_by}</span>
        <span className="shrink-0 ml-auto">{formatTime(deployment.created_at)}</span>
      </div>
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterEnv, setFilterEnv] = useState<string>("");

  const fetchDeployments = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterEnv) params.set("environment", filterEnv);
      const res = await fetch(`/api/deployments?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch deployments");
      const data: Deployment[] = await res.json();

      // Sort: failed/running first, then succeeded/others
      const priorityOrder: Record<DeploymentStatus, number> = {
        failed: 0,
        running: 1,
        pending: 2,
        rolled_back: 3,
        succeeded: 4,
      };
      data.sort((a, b) => {
        const pa = priorityOrder[a.status] ?? 99;
        const pb = priorityOrder[b.status] ?? 99;
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setDeployments(data);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingList(false);
    }
  }, [filterStatus, filterEnv]);

  useEffect(() => {
    fetchDeployments();
  }, [fetchDeployments]);

  const selected = deployments.find((d) => d.id === selectedId) ?? null;
  useSyncSelectedEntity(selectedId);

  return (
    <div className="flex flex-1 flex-col p-6 gap-6 min-h-0">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Rocket className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground font-mono">Deployments</h2>
          <p className="text-sm text-muted-foreground">Deployment management and rollback control</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring transition-colors"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
          <option value="rolled_back">Rolled back</option>
        </select>
        <select
          value={filterEnv}
          onChange={(e) => setFilterEnv(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring transition-colors"
        >
          <option value="">All environments</option>
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="development">Development</option>
        </select>
        <Button variant="outline" size="sm" onClick={fetchDeployments} disabled={loadingList}>
          {loadingList ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Main content: list + detail panel */}
      <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
        {/* Deployment list */}
        <Card className="flex flex-col min-w-0 shrink-0 w-full max-w-sm overflow-hidden py-0">
          <CardHeader className="px-4 py-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Deployments
              </span>
              <Badge variant="secondary" className="text-xs font-mono">
                {deployments.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            {loadingList ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : listError ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 px-4">
                <p className="text-sm text-red-400 font-mono text-center">{listError}</p>
                <Button variant="outline" size="sm" onClick={fetchDeployments}>
                  Retry
                </Button>
              </div>
            ) : deployments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Rocket className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground font-mono">No deployments found</p>
              </div>
            ) : (
              <ScrollArea className="h-full max-h-[calc(100vh-260px)]">
                {deployments.map((d) => (
                  <DeploymentListItem
                    key={d.id}
                    deployment={d}
                    isSelected={d.id === selectedId}
                    onSelect={() =>
                      setSelectedId((prev) => (prev === d.id ? null : d.id))
                    }
                  />
                ))}
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Detail panel */}
        {selected && selectedId ? (
          <Card className="flex flex-col flex-1 min-w-0 overflow-hidden py-0">
            <DetailPanel
              key={selectedId}
              deploymentId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          </Card>
        ) : (
          <Card className="flex-1 flex items-center justify-center text-muted-foreground min-w-0">
            <div className="flex flex-col items-center gap-2">
              <Rocket className="h-8 w-8 opacity-30" />
              <p className="text-sm font-mono">Select a deployment to view details</p>
            </div>
          </Card>
        )}
      </div>

      {/* Divider between list and detail for mobile */}
      <Separator className="hidden" />
    </div>
  );
}
