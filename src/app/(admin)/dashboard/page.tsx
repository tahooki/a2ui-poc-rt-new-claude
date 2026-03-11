"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  LayoutDashboard,
  AlertTriangle,
  Rocket,
  Briefcase,
  ClipboardList,
  ExternalLink,
  ChevronRight,
  Clock,
  User,
  Activity,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { Incident as DomainIncident } from "@/types/domain";

// ─── Types ───────────────────────────────────────────────────────────────────

type Incident = DomainIncident;

interface Deployment {
  id: string;
  service_id: string;
  environment: string;
  version: string;
  status: "pending" | "running" | "succeeded" | "failed" | "rolled_back";
  rollout_percent: number;
  deployed_by: string;
  created_at: string;
}

interface JobRun {
  id: string;
  template_id: string;
  service_id: string;
  status: string;
  progress: number;
  created_at: string;
}

interface AuditLog {
  id: string;
  actor_id: string;
  actor_role: string;
  action_type: string;
  target_type: string;
  target_id: string;
  reason: string;
  result: "success" | "failure" | "denied";
  created_at: string;
}

interface IncidentTrendPoint {
  date: string;
  count: number;
}

interface DeploymentStatPoint {
  status: string;
  count: number;
}

interface DashboardStats {
  incidentTrend: IncidentTrendPoint[];
  deploymentStats: DeploymentStatPoint[];
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

function severityColor(severity: Incident["severity"]): string {
  switch (severity) {
    case "critical": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "high":     return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "medium":   return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "low":      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  }
}

function severityDot(severity: Incident["severity"]): string {
  switch (severity) {
    case "critical": return "bg-red-500";
    case "high":     return "bg-orange-500";
    case "medium":   return "bg-yellow-500";
    case "low":      return "bg-blue-500";
  }
}

// ─── Deployment status helpers ────────────────────────────────────────────────

function deploymentStatusColor(status: Deployment["status"]): string {
  switch (status) {
    case "failed":      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "running":     return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "succeeded":   return "bg-green-500/15 text-green-400 border-green-500/30";
    case "rolled_back": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "pending":     return "bg-muted/50 text-muted-foreground border-border";
  }
}

// ─── Audit log result helper ──────────────────────────────────────────────────

function auditResultColor(result: AuditLog["result"]): string {
  switch (result) {
    case "success": return "bg-green-500/15 text-green-400 border-green-500/30";
    case "failure": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "denied":  return "bg-orange-500/15 text-orange-400 border-orange-500/30";
  }
}

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

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  iconBg: string;
  href: string;
}

function StatCard({ label, value, icon, iconBg, href }: StatCardProps) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:ring-foreground/20 transition-all duration-150 gap-3">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
              {icon}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
            {label}
          </p>
          {value === null ? (
            <Skeleton className="h-8 w-12 rounded" />
          ) : (
            <p className="text-3xl font-bold font-mono text-foreground leading-none">
              {value}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [deployments, setDeployments] = useState<Deployment[] | null>(null);
  const [jobs, setJobs] = useState<JobRun[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[] | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetch("/api/incidents")
      .then((r) => r.json())
      .then(setIncidents)
      .catch(() => setIncidents([]));

    fetch("/api/deployments")
      .then((r) => r.json())
      .then(setDeployments)
      .catch(() => setDeployments([]));

    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data) => setJobs(Array.isArray(data) ? data : data?.job_runs ?? []))
      .catch(() => setJobs([]));

    fetch("/api/audit-logs?limit=10")
      .then((r) => r.json())
      .then(setAuditLogs)
      .catch(() => setAuditLogs([]));

    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then(setDashboardStats)
      .catch(() => setDashboardStats(null));
  }, []);

  // ─── Derived stats ─────────────────────────────────────────────────────────

  const activeIncidents = incidents?.filter(
    (i) => i.status !== "closed" && i.status !== "resolved"
  ) ?? null;

  const failedDeployments = deployments?.filter(
    (d) => d.status === "failed"
  ) ?? null;

  const runningJobs = jobs?.filter((j) => j.status === "running") ?? null;

  // Hero incident: most critical active incident
  const severityRank: Record<Incident["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const heroIncident = activeIncidents
    ? [...activeIncidents].sort(
        (a, b) => severityRank[a.severity] - severityRank[b.severity]
      )[0] ?? null
    : null;

  // Linked deployment for hero incident
  const heroDeployment = heroIncident?.linkedDeploymentId
    ? deployments?.find((d) => d.id === heroIncident.linkedDeploymentId) ?? null
    : null;

  // Recent deployments (last 8)
  const recentDeployments = deployments
    ? [...deployments]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        .slice(0, 8)
    : null;

  return (
    <div className="flex flex-1 flex-col p-6 gap-6">
      {/* ── Page header ── */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/20">
          <LayoutDashboard className="h-5 w-5 text-[#22C55E]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground font-mono">
            Operations Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Real-time operational status overview
          </p>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Incidents"
          value={activeIncidents?.length ?? null}
          href="/incidents"
          iconBg="bg-red-500/10 border border-red-500/20"
          icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
        />
        <StatCard
          label="Failed Deployments"
          value={failedDeployments?.length ?? null}
          href="/deployments"
          iconBg="bg-orange-500/10 border border-orange-500/20"
          icon={<Rocket className="h-4 w-4 text-orange-400" />}
        />
        <StatCard
          label="Running Jobs"
          value={runningJobs?.length ?? null}
          href="/jobs"
          iconBg="bg-blue-500/10 border border-blue-500/20"
          icon={<Briefcase className="h-4 w-4 text-blue-400" />}
        />
        <StatCard
          label="Total Audit Logs"
          value={auditLogs?.length ?? null}
          href="/audit"
          iconBg="bg-[#22C55E]/10 border border-[#22C55E]/20"
          icon={<ClipboardList className="h-4 w-4 text-[#22C55E]" />}
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Incident Trend (Area Chart) */}
        <Card>
          <CardHeader className="border-b border-border/50 pb-3">
            <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
              Incident Trend — Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {dashboardStats === null ? (
              <div className="flex items-center justify-center h-48">
                <Skeleton className="h-[220px] w-full rounded" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={dashboardStats.incidentTrend}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="incidentFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.06)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontFamily: "monospace",
                      color: "#f4f4f5",
                    }}
                    labelStyle={{ color: "#a1a1aa" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#22C55E"
                    strokeWidth={2}
                    fill="url(#incidentFill)"
                    name="Incidents"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Deployment Outcomes (Bar Chart) */}
        <Card>
          <CardHeader className="border-b border-border/50 pb-3">
            <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
              Deployment Outcomes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {dashboardStats === null ? (
              <div className="flex items-center justify-center h-48">
                <Skeleton className="h-[220px] w-full rounded" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={dashboardStats.deploymentStats}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.06)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="status"
                    tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickLine={false}
                    tickFormatter={(v: string) =>
                      v === "rolled_back" ? "rolled back" : v
                    }
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontFamily: "monospace",
                      color: "#f4f4f5",
                    }}
                    labelStyle={{ color: "#a1a1aa" }}
                    labelFormatter={(v) => {
                      const s = String(v);
                      return s === "rolled_back" ? "rolled back" : s;
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Deployments"
                    radius={[4, 4, 0, 0]}
                    fill="#22C55E"
                    shape={(props) => {
                      const colorMap: Record<string, string> = {
                        succeeded: "#22C55E",
                        failed: "#EF4444",
                        rolled_back: "#F59E0B",
                      };
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const p = props as any;
                      const fill =
                        colorMap[p?.payload?.status ?? ""] ?? "#22C55E";
                      return (
                        <rect
                          x={p.x}
                          y={p.y}
                          width={p.width}
                          height={p.height}
                          rx={4}
                          ry={4}
                          fill={fill}
                          fillOpacity={0.85}
                        />
                      );
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Middle section: hero incident + deployment risk ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* ── Hero incident ── */}
        <div className="xl:col-span-2">
          <Card className="h-full">
            <CardHeader className="border-b border-border/50 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
                  Critical Incident
                </CardTitle>
                <Link
                  href="/incidents"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  View all
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {incidents === null ? (
                <div className="flex flex-col gap-3 py-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-3/4 rounded" />
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-40 rounded" />
                    <Skeleton className="h-4 w-32 rounded" />
                    <Skeleton className="h-4 w-28 rounded" />
                  </div>
                </div>
              ) : heroIncident === null ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <Activity className="h-8 w-8 text-[#22C55E]/50" />
                  <p className="text-sm font-mono text-muted-foreground">
                    No active incidents
                  </p>
                </div>
              ) : (
                <Link
                  href={`/incidents`}
                  className="block cursor-pointer group"
                >
                  <div className="flex flex-col gap-4">
                    {/* Severity badge */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold font-mono uppercase tracking-wider ${severityColor(heroIncident.severity)}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full animate-pulse ${severityDot(heroIncident.severity)}`}
                        />
                        {heroIncident.severity}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-mono text-muted-foreground capitalize">
                        {heroIncident.status}
                      </span>
                    </div>

                    {/* Title */}
                    <div>
                      <p className="text-base font-semibold text-foreground group-hover:text-[#22C55E] transition-colors leading-snug">
                        {heroIncident.title}
                      </p>
                    </div>

                    <Separator />

                    {/* Meta */}
                    <div className="flex flex-col gap-2 text-xs font-mono">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Activity className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-foreground/70">Service:</span>
                        <span className="text-foreground font-medium">
                          {heroIncident.serviceId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-foreground/70">Opened:</span>
                        <span className="text-foreground">
                          {formatRelativeTime(heroIncident.createdAt)}
                        </span>
                      </div>
                      {heroIncident.assigneeId && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-foreground/70">Assignee:</span>
                          <span className="text-foreground">
                            {heroIncident.assigneeId}
                          </span>
                        </div>
                      )}
                      {heroIncident.environment && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Env:</span>
                          <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground uppercase">
                            {heroIncident.environment}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Linked deployment */}
                    {heroDeployment && (
                      <>
                        <Separator />
                        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
                          <p className="text-[10px] font-mono uppercase tracking-wider text-orange-400/80 mb-2">
                            Linked Deployment
                          </p>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-mono font-medium text-foreground">
                                {heroDeployment.version}
                              </p>
                              <p className="text-[11px] font-mono text-muted-foreground">
                                {heroDeployment.service_id}
                              </p>
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase ${deploymentStatusColor(heroDeployment.status)}`}
                            >
                              {heroDeployment.status}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Deployment risk overview ── */}
        <div className="xl:col-span-3">
          <Card className="h-full">
            <CardHeader className="border-b border-border/50 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
                  Deployment Risk Overview
                </CardTitle>
                <Link
                  href="/deployments"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  View all
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-3 px-0">
              {deployments === null ? (
                <div className="divide-y divide-border/50">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <Skeleton className="h-2 w-2 rounded-full shrink-0" />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-3.5 w-24 rounded" />
                          <Skeleton className="h-4 w-12 rounded" />
                        </div>
                        <Skeleton className="h-3 w-32 rounded" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                    </div>
                  ))}
                </div>
              ) : recentDeployments?.length === 0 ? (
                <div className="flex items-center justify-center h-40">
                  <p className="text-sm font-mono text-muted-foreground">
                    No deployments found
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentDeployments?.map((dep) => (
                    <Link
                      key={dep.id}
                      href={`/deployments`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer group"
                    >
                      {/* Status indicator dot */}
                      <div
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          dep.status === "failed"
                            ? "bg-red-500"
                            : dep.status === "running"
                            ? "bg-blue-500 animate-pulse"
                            : dep.status === "succeeded"
                            ? "bg-green-500"
                            : dep.status === "rolled_back"
                            ? "bg-amber-500"
                            : "bg-muted-foreground/40"
                        }`}
                      />

                      {/* Service + version */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-mono font-medium text-foreground group-hover:text-[#22C55E] transition-colors truncate">
                            {dep.service_id}
                          </span>
                          <span className="shrink-0 text-[10px] font-mono text-muted-foreground border border-border rounded px-1 py-0.5">
                            {dep.version}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-muted-foreground uppercase">
                            {dep.environment}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">
                            ·
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {formatDistanceToNow(new Date(dep.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Rollout progress (only when running) */}
                      {dep.status === "running" && (
                        <div className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono text-blue-400">
                          <div className="h-1 w-16 rounded-full bg-blue-500/20 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${dep.rollout_percent}%` }}
                            />
                          </div>
                          {dep.rollout_percent}%
                        </div>
                      )}

                      {/* Status badge */}
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide ${deploymentStatusColor(dep.status)}`}
                      >
                        {dep.status.replace("_", " ")}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Recent audit log feed ── */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
              Recent Audit Log
            </CardTitle>
            <Link
              href="/audit"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              View all
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-0">
          {auditLogs === null ? (
            <div className="divide-y divide-border/50">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <Skeleton className="h-3.5 w-24 rounded shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Skeleton className="h-3.5 w-48 rounded" />
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full shrink-0" />
                  <Skeleton className="h-3 w-16 rounded shrink-0" />
                </div>
              ))}
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="flex items-center justify-center h-24">
              <p className="text-sm font-mono text-muted-foreground">
                No audit log entries
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
                >
                  {/* Actor */}
                  <div className="flex items-center gap-1.5 shrink-0 w-32 min-w-0">
                    <User className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    <span className="text-xs font-mono text-foreground truncate">
                      {log.actor_id}
                    </span>
                  </div>

                  {/* Action */}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground truncate">
                      <span className="text-foreground/80">
                        {log.action_type.replace(/_/g, " ")}
                      </span>
                      {" on "}
                      <span className="text-[#22C55E]/80">
                        {log.target_type}
                      </span>
                      {log.target_id && (
                        <span className="text-muted-foreground/60">
                          {" "}
                          #{log.target_id.slice(0, 8)}
                        </span>
                      )}
                    </span>
                    {log.reason && (
                      <p className="text-[10px] font-mono text-muted-foreground/60 truncate mt-0.5">
                        {log.reason}
                      </p>
                    )}
                  </div>

                  {/* Result badge */}
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase ${auditResultColor(log.result)}`}
                  >
                    {log.result}
                  </span>

                  {/* Timestamp */}
                  <span className="shrink-0 text-[10px] font-mono text-muted-foreground/60 whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
