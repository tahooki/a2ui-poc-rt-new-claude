"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Briefcase, Play, CheckCircle, XCircle, Clock, ChevronRight, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useOperator } from "@/lib/operators";
import { useSyncSelectedEntity } from "@/lib/selected-entity";

type JobStatus = "draft" | "dry_run_ready" | "approved" | "running" | "done" | "failed" | "aborted";

interface JobRun {
  id: string;
  template_id: string;
  service_id: string;
  environment: string;
  spec: string;
  status: JobStatus;
  dry_run_result: string | null;
  created_by: string;
  approved_by: string | null;
  progress: number;
  created_at: string;
}

interface JobEvent {
  id: string;
  type: string;
  detail: string;
  created_at: string;
}

interface JobDetail extends JobRun {
  events: JobEvent[];
}

const STATUS_CONFIG: Record<JobStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  dry_run_ready: { label: "Dry Run Ready", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  approved: { label: "Approved", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  running: { label: "Running", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  done: { label: "Done", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  failed: { label: "Failed", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  aborted: { label: "Aborted", className: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
};

function StatusBadge({ status }: { status: JobStatus }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "" };
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-amber-400 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export default function JobsPage() {
  const { currentOperator } = useOperator();
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  useSyncSelectedEntity(selectedJob?.id ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchJobDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedJob(data);
      }
    } catch {
      // silent
    }
  }, []);

  // Poll progress for running jobs
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (selectedJob && selectedJob.status === "running") {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/${selectedJob.id}/progress`, {
            method: "POST",
          });
          if (res.ok) {
            const data = await res.json();
            setSelectedJob(data);
            // Also refresh the job list to update the sidebar progress bar
            fetchJobs();
            // Stop polling if the job is done
            if (data.status !== "running" && pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }
        } catch {
          // silent
        }
      }, 2000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [selectedJob?.id, selectedJob?.status, fetchJobs]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleAction = async (action: "dry-run" | "approve" | "execute" | "abort", reason?: string) => {
    if (!selectedJob || !currentOperator) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          actorId: currentOperator.id,
          reason,
        }),
      });
      if (res.ok) {
        await fetchJobs();
        await fetchJobDetail(selectedJob.id);
      }
    } catch {
      // silent
    } finally {
      setIsActionLoading(false);
    }
  };

  const getActionButton = (status: JobStatus) => {
    switch (status) {
      case "draft":
        return (
          <Button size="sm" variant="outline" onClick={() => handleAction("dry-run")} disabled={isActionLoading}>
            <Play className="size-3.5" />
            Run Dry-Run
          </Button>
        );
      case "dry_run_ready":
        return (
          <Button size="sm" variant="outline" onClick={() => handleAction("approve")} disabled={isActionLoading}>
            <CheckCircle className="size-3.5" />
            Approve
          </Button>
        );
      case "approved":
        return (
          <Button size="sm" onClick={() => handleAction("execute")} disabled={isActionLoading}>
            <Play className="size-3.5" />
            Execute
          </Button>
        );
      case "running":
        return (
          <Button size="sm" variant="destructive" onClick={() => handleAction("abort")} disabled={isActionLoading}>
            <XCircle className="size-3.5" />
            Abort
          </Button>
        );
      default:
        return null;
    }
  };

  const parsedSpec = (() => {
    if (!selectedJob) return null;
    try {
      return JSON.stringify(JSON.parse(selectedJob.spec), null, 2);
    } catch {
      return selectedJob.spec;
    }
  })();

  const parsedDryRun = (() => {
    if (!selectedJob?.dry_run_result) return null;
    try {
      return JSON.stringify(JSON.parse(selectedJob.dry_run_result), null, 2);
    } catch {
      return selectedJob.dry_run_result;
    }
  })();

  return (
    <div className="flex flex-1 flex-col p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Briefcase className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground font-mono">Jobs</h2>
            <p className="text-sm text-muted-foreground">Operational job runner and template executor</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={fetchJobs} disabled={isLoading}>
          <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Content: two-panel layout */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Job list */}
        <Card className="w-80 shrink-0 flex flex-col min-h-0">
          <CardHeader className="border-b">
            <CardTitle className="text-sm font-medium text-muted-foreground font-mono uppercase tracking-wider">
              Job Runs ({jobs.length})
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground font-mono">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </div>
              ) : jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <Briefcase className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground font-mono">No jobs found</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className={`flex flex-col gap-2 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${selectedJob?.id === job.id ? "bg-muted/50" : ""}`}
                      onClick={() => fetchJobDetail(job.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-foreground truncate">{job.template_id}</span>
                        <StatusBadge status={job.status} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                        <span className="truncate">{job.service_id}</span>
                        <span className="shrink-0">/</span>
                        <span className="shrink-0 text-xs">{job.environment}</span>
                      </div>
                      {job.status === "running" && (
                        <div className="flex items-center gap-2">
                          <ProgressBar value={job.progress} />
                          <span className="text-xs font-mono text-amber-400 shrink-0">{job.progress}%</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3 shrink-0" />
                        <span className="font-mono">
                          {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                        </span>
                        <ChevronRight className="size-3 ml-auto" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </ScrollArea>
        </Card>

        {/* Detail panel */}
        {selectedJob ? (
          <Card className="flex-1 flex flex-col min-h-0 min-w-0">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <CardTitle className="font-mono">{selectedJob.template_id}</CardTitle>
                    <StatusBadge status={selectedJob.status} />
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {selectedJob.service_id} / {selectedJob.environment} &middot; by {selectedJob.created_by}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {getActionButton(selectedJob.status)}
                </div>
              </div>
            </CardHeader>
            <ScrollArea className="flex-1">
              <CardContent className="flex flex-col gap-6 py-4">
                {/* Progress for running / done */}
                {(selectedJob.status === "running" || selectedJob.status === "done") && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span>Progress</span>
                      <span className={selectedJob.status === "done" ? "text-green-400" : "text-amber-400"}>
                        {selectedJob.progress}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          selectedJob.status === "done" ? "bg-green-400" : "bg-amber-400"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, selectedJob.progress))}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Spec */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Spec</p>
                  <pre className="rounded-lg bg-muted/50 p-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
                    {parsedSpec ?? "—"}
                  </pre>
                </div>

                {/* Dry-run result */}
                {parsedDryRun && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Dry-Run Result</p>
                      <pre className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
                        {parsedDryRun}
                      </pre>
                    </div>
                  </>
                )}

                {/* Events */}
                {selectedJob.events && selectedJob.events.length > 0 && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                        Events ({selectedJob.events.length})
                      </p>
                      <div className="flex flex-col gap-2">
                        {selectedJob.events.map((event) => (
                          <div key={event.id} className="flex items-start gap-3">
                            <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <p className="text-xs font-mono text-foreground">{event.detail}</p>
                              <p className="text-xs font-mono text-muted-foreground">
                                {event.type} &middot;{" "}
                                {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Metadata */}
                <Separator />
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <p className="text-muted-foreground font-mono uppercase tracking-wider text-[10px]">Job ID</p>
                    <p className="font-mono text-foreground mt-0.5">{selectedJob.id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-mono uppercase tracking-wider text-[10px]">Created</p>
                    <p className="font-mono text-foreground mt-0.5">
                      {formatDistanceToNow(new Date(selectedJob.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {selectedJob.approved_by && (
                    <div>
                      <p className="text-muted-foreground font-mono uppercase tracking-wider text-[10px]">Approved By</p>
                      <p className="font-mono text-foreground mt-0.5">{selectedJob.approved_by}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </ScrollArea>
          </Card>
        ) : (
          <Card className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground font-mono">Select a job to view details</p>
          </Card>
        )}
      </div>
    </div>
  );
}
