"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ClipboardList, RefreshCw, Search, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOperator } from "@/lib/operators";

type AuditResult = "success" | "failure" | "denied";

interface AuditLog {
  id: string;
  request_id: string;
  actor_id: string;
  actor_role: string;
  action_type: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  result: AuditResult;
  created_at: string;
}

const RESULT_CONFIG: Record<AuditResult, { label: string; className: string }> = {
  success: { label: "success", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  failure: { label: "failure", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  denied: { label: "denied", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
};

function ResultBadge({ result }: { result: AuditResult }) {
  const config = RESULT_CONFIG[result] ?? { label: result, className: "" };
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export default function AuditPage() {
  const { currentOperator } = useOperator();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterActor, setFilterActor] = useState("");

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/audit-logs?limit=100");
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = useMemo(() => {
    let result = [...logs];

    // Already sorted by time descending from API, but ensure it
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (filterAction.trim()) {
      const q = filterAction.trim().toLowerCase();
      result = result.filter((log) => log.action_type.toLowerCase().includes(q));
    }
    if (filterActor.trim()) {
      const q = filterActor.trim().toLowerCase();
      result = result.filter((log) => log.actor_id.toLowerCase().includes(q));
    }
    return result;
  }, [logs, filterAction, filterActor]);

  const hasFilter = filterAction.trim() || filterActor.trim();

  return (
    <div className="flex flex-1 flex-col p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-500/10 border border-slate-500/20">
            <ClipboardList className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground font-mono">Audit Log</h2>
            <p className="text-sm text-muted-foreground">Complete audit trail of all operator actions</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={fetchLogs} disabled={isLoading}>
          <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-40 max-w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={filterAction}
            placeholder="Filter by action..."
            className="pl-8 text-xs font-mono h-8"
            onChange={(e) => setFilterAction(e.target.value)}
          />
        </div>
        <div className="relative flex-1 min-w-40 max-w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={filterActor}
            placeholder="Filter by actor ID..."
            className="pl-8 text-xs font-mono h-8"
            onChange={(e) => setFilterActor(e.target.value)}
          />
        </div>
        {hasFilter && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFilterAction("");
              setFilterActor("");
            }}
          >
            <X className="size-3.5" />
            Clear
          </Button>
        )}
        <span className="text-xs text-muted-foreground font-mono ml-auto">
          {filteredLogs.length} of {logs.length} entries
        </span>
      </div>

      {/* Table */}
      <Card className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground font-mono">
                Loading audit logs...
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground font-mono">
                {hasFilter ? "No logs match your filters" : "No audit logs found"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-mono uppercase tracking-wider text-muted-foreground w-36">
                      Time
                    </TableHead>
                    <TableHead className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      Actor
                    </TableHead>
                    <TableHead className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      Role
                    </TableHead>
                    <TableHead className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      Action
                    </TableHead>
                    <TableHead className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      Target
                    </TableHead>
                    <TableHead className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      Reason
                    </TableHead>
                    <TableHead className="text-xs font-mono uppercase tracking-wider text-muted-foreground w-24">
                      Result
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id} className="text-xs">
                      <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="font-mono text-foreground">
                        {log.actor_id}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {log.actor_role}
                      </TableCell>
                      <TableCell className="font-mono text-foreground font-medium">
                        {log.action_type}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        <span className="text-foreground">{log.target_type}</span>
                        {log.target_id && (
                          <>
                            {" "}
                            <span className="text-muted-foreground/60">#{log.target_id.slice(0, 8)}</span>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground max-w-48 truncate">
                        {log.reason ?? <span className="opacity-40">—</span>}
                      </TableCell>
                      <TableCell>
                        <ResultBadge result={log.result} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </ScrollArea>
      </Card>
    </div>
  );
}
