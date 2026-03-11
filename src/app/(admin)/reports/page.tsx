"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  RefreshCw,
  Clock,
  ChevronRight,
  Plus,
  Download,
  CheckSquare,
  Square,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useOperator } from "@/lib/operators";

type ReportType = "incident_update" | "handover" | "postmortem";
type ReportStatus = "draft" | "reviewed" | "finalized" | "exported";

interface ReportSection {
  title: string;
  content: string;
}

interface ActionItem {
  id?: string;
  description: string;
  assignee_id?: string;
  due_date?: string;
  completed?: boolean;
}

interface ExportRecord {
  id: string;
  format: "markdown" | "json";
  exported_at: string;
}

interface Report {
  id: string;
  type: ReportType;
  title: string;
  incident_id?: string;
  status: ReportStatus;
  created_by: string;
  created_at: string;
}

interface ReportDetail extends Report {
  sections: ReportSection[];
  actionItems: ActionItem[];
  exports: ExportRecord[];
}

const TYPE_CONFIG: Record<ReportType, { label: string; className: string }> = {
  incident_update: { label: "Incident Update", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  handover: { label: "Handover", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  postmortem: { label: "Postmortem", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
};

const STATUS_CONFIG: Record<ReportStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  reviewed: { label: "Reviewed", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  finalized: { label: "Finalized", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  exported: { label: "Exported", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
};

function TypeBadge({ type }: { type: ReportType }) {
  const config = TYPE_CONFIG[type] ?? { label: type, className: "" };
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "" };
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export default function ReportsPage() {
  const { currentOperator } = useOperator();
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [editingSections, setEditingSections] = useState<ReportSection[]>([]);
  const [newActionItem, setNewActionItem] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/reports");
      if (res.ok) {
        const data = await res.json();
        setReports(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchReportDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/reports/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedReport(data);
        setEditingSections(data.sections ?? []);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleStatusAdvance = async () => {
    if (!selectedReport || !currentOperator) return;
    const nextStatus: Record<ReportStatus, ReportStatus | null> = {
      draft: "reviewed",
      reviewed: "finalized",
      finalized: "exported",
      exported: null,
    };
    const next = nextStatus[selectedReport.status];
    if (!next) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/reports/${selectedReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next,
          actorId: currentOperator.id,
          reason: `Status changed to ${next}`,
        }),
      });
      if (res.ok) {
        await fetchReports();
        await fetchReportDetail(selectedReport.id);
      }
    } catch {
      // silent
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleExport = async (format: "markdown" | "json") => {
    if (!selectedReport || !currentOperator) return;
    setIsActionLoading(true);
    try {
      const shouldAdvanceStatus = selectedReport.status === "finalized";
      const res = await fetch(`/api/reports/${selectedReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorId: currentOperator.id,
          exportFormat: format,
          status: shouldAdvanceStatus ? "exported" : undefined,
          reason: `Exported as ${format}`,
        }),
      });
      if (res.ok) {
        await fetchReportDetail(selectedReport.id);
      }
    } catch {
      // silent
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSaveSections = async () => {
    if (!selectedReport || !currentOperator) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/reports/${selectedReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: editingSections,
          actorId: currentOperator.id,
          reason: "Sections updated",
        }),
      });
      if (res.ok) {
        await fetchReportDetail(selectedReport.id);
      }
    } catch {
      // silent
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddActionItem = async () => {
    if (!selectedReport || !currentOperator || !newActionItem.trim()) return;
    setIsActionLoading(true);
    try {
      const existing = selectedReport.actionItems ?? [];
      const res = await fetch(`/api/reports/${selectedReport.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionItems: [...existing, { description: newActionItem.trim() }],
          actorId: currentOperator.id,
          reason: "Action items updated",
        }),
      });
      if (res.ok) {
        setNewActionItem("");
        await fetchReportDetail(selectedReport.id);
      }
    } catch {
      // silent
    } finally {
      setIsActionLoading(false);
    }
  };

  const statusActionLabel: Record<ReportStatus, string | null> = {
    draft: "Mark Reviewed",
    reviewed: "Finalize",
    finalized: "Mark Exported",
    exported: null,
  };

  const nextLabel = selectedReport ? statusActionLabel[selectedReport.status] : null;

  return (
    <div className="flex flex-1 flex-col p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
            <FileText className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground font-mono">Reports</h2>
            <p className="text-sm text-muted-foreground">Incident reports, handovers, and postmortems</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={fetchReports} disabled={isLoading}>
          <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Report list */}
        <Card className="w-80 shrink-0 flex flex-col min-h-0">
          <CardHeader className="border-b">
            <CardTitle className="text-sm font-medium text-muted-foreground font-mono uppercase tracking-wider">
              Reports ({reports.length})
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground font-mono">
                  Loading...
                </div>
              ) : reports.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground font-mono">
                  No reports found
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className={`flex flex-col gap-2 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${selectedReport?.id === report.id ? "bg-muted/50" : ""}`}
                      onClick={() => fetchReportDetail(report.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-mono text-foreground leading-snug">{report.title}</span>
                        <TypeBadge type={report.type} />
                      </div>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={report.status} />
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          <span className="font-mono">
                            {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-mono">by {report.created_by}</span>
                        <ChevronRight className="size-3 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </ScrollArea>
        </Card>

        {/* Detail panel */}
        {selectedReport ? (
          <Card className="flex-1 flex flex-col min-h-0 min-w-0">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="font-mono truncate">{selectedReport.title}</CardTitle>
                    <TypeBadge type={selectedReport.type} />
                    <StatusBadge status={selectedReport.status} />
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    by {selectedReport.created_by} &middot;{" "}
                    {formatDistanceToNow(new Date(selectedReport.created_at), { addSuffix: true })}
                    {selectedReport.incident_id && ` · incident: ${selectedReport.incident_id}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedReport.status === "finalized" || selectedReport.status === "exported" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExport("markdown")}
                        disabled={isActionLoading}
                      >
                        <Download className="size-3.5" />
                        MD
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExport("json")}
                        disabled={isActionLoading}
                      >
                        <Download className="size-3.5" />
                        JSON
                      </Button>
                    </>
                  ) : null}
                  {nextLabel && (
                    <Button size="sm" onClick={handleStatusAdvance} disabled={isActionLoading}>
                      {nextLabel}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <ScrollArea className="flex-1">
              <CardContent className="flex flex-col gap-6 py-4">
                {/* Sections editor */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Sections</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          setEditingSections((prev) => [...prev, { title: "", content: "" }])
                        }
                      >
                        <Plus className="size-3" />
                        Add
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={handleSaveSections}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                  {editingSections.length === 0 ? (
                    <p className="text-xs text-muted-foreground font-mono">No sections. Add one above.</p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {editingSections.map((section, idx) => (
                        <div key={idx} className="flex flex-col gap-1.5">
                          <Input
                            value={section.title}
                            placeholder="Section title"
                            className="text-xs font-mono"
                            onChange={(e) =>
                              setEditingSections((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, title: e.target.value } : s))
                              )
                            }
                          />
                          <Textarea
                            value={section.content}
                            placeholder="Section content..."
                            className="text-xs font-mono min-h-24 resize-none"
                            onChange={(e) =>
                              setEditingSections((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, content: e.target.value } : s))
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Action items */}
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Action Items ({selectedReport.actionItems?.length ?? 0})
                  </p>
                  <div className="flex flex-col gap-2">
                    {(selectedReport.actionItems ?? []).map((item, idx) => (
                      <div key={item.id ?? idx} className="flex items-start gap-2">
                        {item.completed ? (
                          <CheckSquare className="size-4 text-green-400 mt-0.5 shrink-0" />
                        ) : (
                          <Square className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <p className="text-xs font-mono text-foreground">{item.description}</p>
                          {(item.assignee_id || item.due_date) && (
                            <p className="text-xs font-mono text-muted-foreground">
                              {item.assignee_id && `@${item.assignee_id}`}
                              {item.assignee_id && item.due_date && " · "}
                              {item.due_date && `Due: ${item.due_date}`}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={newActionItem}
                      placeholder="Add action item..."
                      className="text-xs font-mono"
                      onChange={(e) => setNewActionItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddActionItem();
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddActionItem}
                      disabled={isActionLoading || !newActionItem.trim()}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Exports history */}
                {selectedReport.exports && selectedReport.exports.length > 0 && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                        Export History
                      </p>
                      <div className="flex flex-col gap-1">
                        {selectedReport.exports.map((exp) => (
                          <div key={exp.id} className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                            <Download className="size-3" />
                            <span className="uppercase text-foreground">{exp.format}</span>
                            <span>
                              {formatDistanceToNow(new Date(exp.exported_at), { addSuffix: true })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </ScrollArea>
          </Card>
        ) : (
          <Card className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground font-mono">Select a report to view details</p>
          </Card>
        )}
      </div>
    </div>
  );
}
