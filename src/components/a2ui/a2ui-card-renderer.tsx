"use client";

import dynamic from "next/dynamic";
import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  buildRollbackSummaryCard,
  buildEvidenceComparisonCard,
  buildDryRunStepperCard,
  buildJobSpecReviewCard,
  buildReportTemplateCard,
  type A2UICardDef,
} from "@/lib/a2ui-bridge";

// Dynamically import A2UIViewer with no SSR (client-only)
const A2UIViewer = dynamic(
  () => import("@a2ui/react").then((mod) => mod.A2UIViewer),
  {
    ssr: false,
    loading: () => <A2UILoadingSkeleton />,
  },
);

function A2UILoadingSkeleton() {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2 animate-pulse">
      <div className="h-4 w-32 bg-muted rounded" />
      <div className="h-3 w-full bg-muted rounded" />
      <div className="h-3 w-4/5 bg-muted rounded" />
      <div className="h-3 w-3/5 bg-muted rounded" />
    </div>
  );
}

// ─── Error Boundary ──────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  cardType: string;
}

class A2UIErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[A2UICardRenderer] Render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <span className="font-medium">카드 렌더링 오류</span>
          <span className="ml-2 text-xs text-muted-foreground">
            ({this.props.cardType}): {this.state.errorMessage}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Card builder map ────────────────────────────────────────────────────────

function buildCardDef(
  cardType: string,
  cardData: Record<string, unknown>,
): A2UICardDef | null {
  switch (cardType) {
    case "rollback_summary": {
      const deployment = (cardData["deployment"] as Record<string, unknown>) ?? {};
      const riskChecks = (cardData["riskChecks"] as Array<Record<string, unknown>>) ?? [];
      const rollbackPlan = (cardData["rollbackPlan"] as Record<string, unknown>) ?? null;
      return buildRollbackSummaryCard(deployment, riskChecks, rollbackPlan);
    }
    case "evidence_comparison": {
      const incident = (cardData["incident"] as Record<string, unknown>) ?? {};
      const evidence = (cardData["evidence"] as Array<Record<string, unknown>>) ?? [];
      return buildEvidenceComparisonCard(incident, evidence);
    }
    case "dry_run_stepper": {
      const rollbackPlan = (cardData["rollbackPlan"] as Record<string, unknown>) ?? {};
      const steps = (cardData["steps"] as Array<Record<string, unknown>>) ?? [];
      return buildDryRunStepperCard(rollbackPlan, steps);
    }
    case "job_spec_review": {
      const jobRun = (cardData["jobRun"] as Record<string, unknown>) ?? {};
      const template = (cardData["template"] as Record<string, unknown>) ?? null;
      const dryRunResult = (cardData["dryRunResult"] as Record<string, unknown>) ?? null;
      return buildJobSpecReviewCard(jobRun, template, dryRunResult);
    }
    case "report_template": {
      const incident = (cardData["incident"] as Record<string, unknown>) ?? {};
      const reportType = String(cardData["reportType"] ?? "default");
      return buildReportTemplateCard(incident, reportType);
    }
    default:
      return null;
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

interface A2UICardRendererProps {
  cardType: string;
  cardData: Record<string, unknown>;
  onAction?: (actionName: string, context: Record<string, unknown>) => void;
}

export function A2UICardRenderer({
  cardType,
  cardData,
  onAction,
}: A2UICardRendererProps) {
  const cardDef = buildCardDef(cardType, cardData);

  if (!cardDef) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm text-muted-foreground">
        알 수 없는 카드 유형: <code className="font-mono text-xs">{cardType}</code>
      </div>
    );
  }

  return (
    <A2UIErrorBoundary cardType={cardType}>
      <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
        <A2UIViewer
          root={cardDef.root}
          components={cardDef.components}
          data={cardDef.data}
          onAction={(action) => {
            if (onAction) {
              onAction(action.actionName, action.context ?? {});
            }
          }}
        />
      </div>
    </A2UIErrorBoundary>
  );
}
