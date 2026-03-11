"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock,
  User,
  Server,
  Globe,
  Link2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  X,
  FileText,
  Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOperator } from "@/lib/operators";
import { useSyncSelectedEntity } from "@/lib/selected-entity";
import type {
  Incident,
  IncidentStatus,
  IncidentSeverity,
  IncidentEvent,
  IncidentEvidence,
} from "@/types/domain";

// ─── Types ────────────────────────────────────────────────────────────────────

type IncidentDetail = Incident & {
  events: IncidentEvent[];
  evidence: IncidentEvidence[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "mitigated", label: "Mitigated" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const SEVERITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["investigating"],
  investigating: ["mitigated"],
  mitigated: ["resolved"],
  resolved: ["closed"],
  closed: [],
};

const STATUS_NEXT_LABEL: Record<IncidentStatus, string> = {
  open: "Start Investigating",
  investigating: "Mark Mitigated",
  mitigated: "Mark Resolved",
  resolved: "Close Incident",
  closed: "",
};

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeTime(value: string | null | undefined, fallback = "Unknown") {
  const date = parseDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : fallback;
}

function getDateSortValue(value: string | null | undefined) {
  return parseDate(value)?.getTime() ?? Number.POSITIVE_INFINITY;
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

function getSeverityClasses(severity: IncidentSeverity): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "high":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "medium":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "low":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  }
}

function getStatusClasses(status: IncidentStatus): string {
  switch (status) {
    case "open":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "investigating":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "mitigated":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "resolved":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "closed":
      return "bg-slate-500/15 text-slate-400 border-slate-500/30";
  }
}

function getEnvironmentClasses(env: string): string {
  switch (env) {
    case "production":
      return "bg-red-500/10 text-red-300 border-red-500/20";
    case "staging":
      return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
    case "development":
      return "bg-green-500/10 text-green-300 border-green-500/20";
    default:
      return "bg-slate-500/10 text-slate-300 border-slate-500/20";
  }
}

function getEvidenceTypeClasses(type: string): string {
  switch (type) {
    case "error_rate":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "log_sample":
      return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    case "metric_chart":
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "trace":
      return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    case "config_diff":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    default:
      return "bg-muted/50 text-muted-foreground border-border";
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getSeverityClasses(severity)}`}
    >
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getStatusClasses(status)}`}
    >
      {status}
    </span>
  );
}

function EnvironmentBadge({ env }: { env: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getEnvironmentClasses(env)}`}
    >
      {env}
    </span>
  );
}

function EvidenceItem({ item }: { item: IncidentEvidence }) {
  const [expanded, setExpanded] = useState(false);

  let parsedContent: unknown = null;
  try {
    parsedContent = JSON.parse(item.content);
  } catch {
    parsedContent = item.content;
  }

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0 text-[10px] font-mono font-semibold uppercase ${getEvidenceTypeClasses(item.type)}`}
        >
          {item.type.replace(/_/g, " ")}
        </span>
        <span className="flex-1 text-sm font-medium text-foreground truncate">
          {item.title}
        </span>
        <span className="text-muted-foreground shrink-0">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/50 px-3 py-2.5 bg-muted/10">
          <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all leading-relaxed">
            {typeof parsedContent === "string"
              ? parsedContent
              : JSON.stringify(parsedContent, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function TimelineItem({ event }: { event: IncidentEvent }) {
  const timeAgo = formatRelativeTime(event.createdAt);
  const actionLabel = event.action.replace(/_/g, " ");

  return (
    <div className="flex gap-3 py-2.5 border-b border-border/30 last:border-0">
      <div className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-muted/50 border border-border/50">
        <Activity className="h-2.5 w-2.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold text-foreground font-mono">
            {event.actorId}
          </span>
          <span className="text-xs text-muted-foreground">{actionLabel}</span>
        </div>
        {event.detail && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            {event.detail}
          </p>
        )}
        <p className="mt-0.5 text-[10px] text-muted-foreground/60 font-mono">
          {timeAgo}
        </p>
      </div>
    </div>
  );
}

// ─── Incident List Row ─────────────────────────────────────────────────────────

function IncidentRow({
  incident,
  isSelected,
  onClick,
}: {
  incident: Incident;
  isSelected: boolean;
  onClick: () => void;
}) {
  const timeAgo = formatRelativeTime(incident.createdAt);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-border/40 transition-colors hover:bg-muted/30 ${
        isSelected ? "bg-muted/50 border-l-2 border-l-red-500" : ""
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 mt-0.5">
          <SeverityBadge severity={incident.severity} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight truncate">
            {incident.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
              <Server className="h-2.5 w-2.5" />
              {incident.serviceId}
            </span>
            <EnvironmentBadge env={incident.environment} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={incident.status} />
            {incident.assigneeId && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                <User className="h-2.5 w-2.5" />
                {incident.assigneeId}
              </span>
            )}
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-mono ml-auto">
              <Clock className="h-2.5 w-2.5" />
              {timeAgo}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Detail Panel ──────────────────────────────────────────────────────────────

function IncidentDetailPanel({
  incidentId,
  onClose,
}: {
  incidentId: string;
  onClose: () => void;
}) {
  const { currentOperator } = useOperator();

  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}`);
      if (!res.ok) throw new Error("Failed to load incident");
      const data = await res.json();
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  async function handleStatusTransition(newStatus: IncidentStatus) {
    if (!currentOperator || !detail) return;
    if (!reason.trim()) {
      setSubmitError("Please provide a reason for the status change.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          reason: reason.trim(),
          actorId: currentOperator.id,
          operatorRole: currentOperator.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update status");
      }
      setReason("");
      await fetchDetail();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <span className="text-sm font-medium text-muted-foreground">Error</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-destructive font-mono">{error ?? "Incident not found"}</p>
        </div>
      </div>
    );
  }

  const nextStatuses = STATUS_TRANSITIONS[detail.status];
  const createdAgo = formatRelativeTime(detail.createdAt);
  const updatedAgo = formatRelativeTime(detail.updatedAt);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-snug">
              {detail.title}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <SeverityBadge severity={detail.severity} />
              <StatusBadge status={detail.status} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={fetchDetail}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 py-3 space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
            <div>
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-mono mb-0.5">
                Service
              </p>
              <div className="flex items-center gap-1 text-foreground font-mono">
                <Server className="h-3 w-3 text-muted-foreground" />
                {detail.serviceId}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-mono mb-0.5">
                Environment
              </p>
              <EnvironmentBadge env={detail.environment} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-mono mb-0.5">
                Assignee
              </p>
              <div className="flex items-center gap-1 text-foreground font-mono">
                <User className="h-3 w-3 text-muted-foreground" />
                {detail.assigneeId ?? <span className="text-muted-foreground">Unassigned</span>}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-mono mb-0.5">
                Linked Deployment
              </p>
              <div className="flex items-center gap-1 text-foreground font-mono">
                <Link2 className="h-3 w-3 text-muted-foreground" />
                {detail.linkedDeploymentId ?? (
                  <span className="text-muted-foreground">None</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-mono mb-0.5">
                Created
              </p>
              <div className="flex items-center gap-1 text-muted-foreground font-mono">
                <Clock className="h-3 w-3" />
                {createdAgo}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-mono mb-0.5">
                Updated
              </p>
              <div className="flex items-center gap-1 text-muted-foreground font-mono">
                <Clock className="h-3 w-3" />
                {updatedAgo}
              </div>
            </div>
          </div>

          <Separator />

          {/* Tabs: Evidence / Timeline */}
          <Tabs defaultValue="evidence">
            <TabsList className="w-full">
              <TabsTrigger value="evidence" className="flex-1 gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Evidence
                {detail.evidence.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {detail.evidence.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex-1 gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Timeline
                {detail.events.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {detail.events.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="evidence" className="mt-3">
              {detail.evidence.length === 0 ? (
                <p className="text-sm text-muted-foreground font-mono text-center py-6">
                  No evidence attached
                </p>
              ) : (
                <div className="space-y-2">
                  {detail.evidence.map((ev) => (
                    <EvidenceItem key={ev.id} item={ev} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-3">
              {detail.events.length === 0 ? (
                <p className="text-sm text-muted-foreground font-mono text-center py-6">
                  No events yet
                </p>
              ) : (
                <div>
                  {[...detail.events]
                    .sort(
                      (a, b) =>
                        getDateSortValue(a.createdAt) - getDateSortValue(b.createdAt)
                    )
                    .map((ev) => (
                      <TimelineItem key={ev.id} event={ev} />
                    ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <Separator />

          {/* Status Update */}
          <div>
            <p className="text-xs font-semibold text-foreground font-mono mb-2 uppercase tracking-wider">
              Status Update
            </p>
            {nextStatuses.length === 0 ? (
              <p className="text-xs text-muted-foreground font-mono py-2">
                This incident is closed. No further transitions available.
              </p>
            ) : (
              <div className="space-y-2.5">
                <Textarea
                  placeholder="Provide a reason for the status change..."
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setSubmitError(null);
                  }}
                  className="text-sm resize-none"
                  rows={3}
                />
                {submitError && (
                  <p className="text-xs text-destructive font-mono">{submitError}</p>
                )}
                {!currentOperator ? (
                  <p className="text-xs text-muted-foreground font-mono">
                    No operator selected. Please select an operator to update status.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {nextStatuses.map((nextStatus) => (
                      <Button
                        key={nextStatus}
                        size="sm"
                        variant="outline"
                        disabled={submitting || !reason.trim()}
                        onClick={() => handleStatusTransition(nextStatus)}
                        className="text-xs font-mono"
                      >
                        {submitting ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : null}
                        {STATUS_NEXT_LABEL[detail.status]}
                      </Button>
                    ))}
                  </div>
                )}
                {currentOperator && (
                  <p className="text-[10px] text-muted-foreground/60 font-mono">
                    Acting as: {currentOperator.name} ({currentOperator.role})
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useSyncSelectedEntity(selectedId);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      const res = await fetch(`/api/incidents?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load incidents");
      const data = await res.json();
      setIncidents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const handleSelect = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-1 flex-col h-full min-h-0 overflow-hidden">
      {/* Page header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/50 shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-foreground font-mono">Incidents</h2>
          <p className="text-sm text-muted-foreground">Incident investigation workspace</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={fetchIncidents}
          disabled={loading}
          className="text-muted-foreground"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline ml-1.5">Refresh</span>
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border/40 shrink-0 bg-muted/10">
        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground font-mono mr-1">Filter:</span>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="h-7 text-xs font-mono w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v ?? "all")}>
          <SelectTrigger className="h-7 text-xs font-mono w-[150px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== "all" || severityFilter !== "all") && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs font-mono text-muted-foreground px-2"
            onClick={() => {
              setStatusFilter("all");
              setSeverityFilter("all");
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}

        {!loading && (
          <span className="ml-auto text-[10px] text-muted-foreground/60 font-mono">
            {incidents.length} incident{incidents.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Incident list */}
        <div
          className={`flex flex-col border-r border-border/50 overflow-hidden transition-all ${
            selectedId
              ? "hidden md:flex md:w-[380px] lg:w-[420px] shrink-0"
              : "flex-1"
          }`}
        >
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="text-center">
                <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-destructive font-mono">{error}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchIncidents}
                  className="mt-3"
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : incidents.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-mono">
                  No incidents match the current filters
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              {incidents.map((incident) => (
                <IncidentRow
                  key={incident.id}
                  incident={incident}
                  isSelected={selectedId === incident.id}
                  onClick={() => handleSelect(incident.id)}
                />
              ))}
            </ScrollArea>
          )}
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            <IncidentDetailPanel
              key={selectedId}
              incidentId={selectedId}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}

        {/* Empty state when nothing selected (desktop) */}
        {!selectedId && !loading && incidents.length > 0 && (
          <div className="hidden" />
        )}
      </div>
    </div>
  );
}
