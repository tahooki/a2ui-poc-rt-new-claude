"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Bot, User, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  UIMessage,
  UIMessagePart,
  UIDataTypes,
  UITools,
  DynamicToolUIPart,
  ReasoningUIPart,
  TextUIPart,
} from "ai";

const A2UICardRenderer = dynamic(
  () =>
    import("@/components/a2ui/a2ui-card-renderer").then(
      (mod) => mod.A2UICardRenderer,
    ),
  { ssr: false },
);

interface ChatMessageProps {
  message: UIMessage;
  onA2UIAction?: (actionName: string, context: Record<string, unknown>) => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function renderTextContent(text: string) {
  const lines = text.split("\n");
  return lines.map((line, lineIdx) => {
    // Bold: **text**
    const boldParts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = boldParts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      // Inline code: `code`
      const codeParts = part.split(/(`[^`]+`)/g);
      return codeParts.map((codePart, codeIdx) => {
        if (codePart.startsWith("`") && codePart.endsWith("`")) {
          return (
            <code
              key={`${idx}-${codeIdx}`}
              className="bg-muted px-1 py-0.5 rounded text-xs font-mono text-green-400"
            >
              {codePart.slice(1, -1)}
            </code>
          );
        }
        return <span key={`${idx}-${codeIdx}`}>{codePart}</span>;
      });
    });

    // List items
    if (line.startsWith("- ") || line.startsWith("• ")) {
      return (
        <div key={lineIdx} className="flex gap-1.5 items-start">
          <span className="text-green-500 mt-0.5 shrink-0">•</span>
          <span>{rendered}</span>
        </div>
      );
    }

    if (line === "") {
      return <div key={lineIdx} className="h-1" />;
    }

    return <div key={lineIdx}>{rendered}</div>;
  });
}

type AnyPart = UIMessagePart<UIDataTypes, UITools>;

// Extract tool display info from a dynamic-tool part
function getDynamicToolInfo(part: DynamicToolUIPart): {
  toolName: string;
  stateLabel: string;
  result: unknown;
} {
  const toolName = part.toolName;
  let stateLabel = "";
  let result: unknown = undefined;

  if (part.state === "input-streaming" || part.state === "input-available") {
    stateLabel = "실행 중...";
  } else if (part.state === "approval-requested") {
    stateLabel = "승인 대기";
  } else if (part.state === "approval-responded") {
    stateLabel = "승인됨";
  } else if (part.state === "output-available") {
    stateLabel = "완료";
    result = part.output;
  } else if (part.state === "output-error") {
    stateLabel = "오류";
    result = part.errorText;
  } else if (part.state === "output-denied") {
    stateLabel = "거부됨";
  }

  return { toolName, stateLabel, result };
}

// Extract tool display info from a static tool part (type starts with "tool-")
function getStaticToolInfo(part: AnyPart & { type: string }): {
  toolName: string;
  stateLabel: string;
  result: unknown;
} | null {
  if (!part.type.startsWith("tool-")) return null;

  const toolName = part.type.slice(5);
  // The part is a ToolUIPart which has the same discriminated union structure
  const toolPart = part as unknown as DynamicToolUIPart & { type: string };

  if (!("state" in toolPart)) {
    return { toolName, stateLabel: "", result: undefined };
  }

  return getDynamicToolInfo({ ...toolPart, type: "dynamic-tool", toolName });
}

function isA2UIRenderResult(
  result: unknown,
): result is {
  type: "a2ui_render";
  cardType: string;
  cardData: Record<string, unknown>;
  template?: {
    templateId?: string;
    toolName?: string;
    cardType?: string;
  };
  decision?: {
    strategy?: string;
    confidence?: number;
    decisionReason?: string;
    matchedSignals?: string[];
    missingInputs?: string[];
    collectedInputs?: Record<string, unknown>;
  };
} {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as Record<string, unknown>)["type"] === "a2ui_render" &&
    typeof (result as Record<string, unknown>)["cardType"] === "string" &&
    typeof (result as Record<string, unknown>)["cardData"] === "object"
  );
}

function ToolPartCard({ part, onA2UIAction }: { part: AnyPart; onA2UIAction?: (actionName: string, context: Record<string, unknown>) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDecisionExpanded, setIsDecisionExpanded] = useState(false);

  let info: { toolName: string; stateLabel: string; result: unknown } | null = null;

  if (part.type === "dynamic-tool") {
    info = getDynamicToolInfo(part as DynamicToolUIPart);
  } else if (part.type.startsWith("tool-")) {
    info = getStaticToolInfo(part as AnyPart & { type: string });
  }

  if (!info) return null;

  const { toolName, stateLabel, result } = info;

  // Render A2UI card inline instead of raw JSON when the result is an a2ui_render payload
  if (isA2UIRenderResult(result)) {
    const hasDecisionMeta =
      typeof result.decision === "object" && result.decision !== null;
    const decisionJson = hasDecisionMeta
      ? JSON.stringify(
          {
            template: result.template ?? null,
            decision: result.decision,
          },
          null,
          2,
        )
      : null;

    return (
      <div className="mt-1.5 space-y-1.5">
        <div className="flex items-center gap-2 px-0.5">
          <Badge variant="secondary" className="text-[10px] h-4 font-mono shrink-0">
            {toolName}
          </Badge>
          <span className="text-[11px] text-muted-foreground">{stateLabel}</span>
        </div>
        {hasDecisionMeta && decisionJson && (
          <div className="rounded-md border border-border/60 bg-muted/30 overflow-hidden text-xs">
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => setIsDecisionExpanded((v) => !v)}
            >
              <Badge variant="outline" className="text-[10px] h-4 font-mono shrink-0">
                decision
              </Badge>
              <span className="text-muted-foreground flex-1 text-left truncate">
                {(result.decision?.decisionReason as string | undefined) ?? "선택 근거 정보"}
              </span>
              {isDecisionExpanded ? (
                <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
            </button>
            {isDecisionExpanded && (
              <pre className="px-2.5 py-2 text-[10px] font-mono text-muted-foreground overflow-auto max-h-40 border-t border-border/40">
                {decisionJson}
              </pre>
            )}
          </div>
        )}
        <A2UICardRenderer
          cardType={result.cardType}
          cardData={result.cardData}
          onAction={onA2UIAction}
        />
      </div>
    );
  }

  const resultStr = result !== undefined ? JSON.stringify(result, null, 2) : null;

  return (
    <div className="mt-1.5 rounded-md border border-border/60 bg-muted/30 overflow-hidden text-xs">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={() => setIsExpanded((v) => !v)}
      >
        <Badge variant="secondary" className="text-[10px] h-4 font-mono shrink-0">
          {toolName}
        </Badge>
        <span className="text-muted-foreground flex-1 text-left truncate">
          {stateLabel}
        </span>
        {resultStr && (
          isExpanded
            ? <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
            : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
      </button>
      {isExpanded && resultStr && (
        <pre className="px-2.5 py-2 text-[10px] font-mono text-muted-foreground overflow-auto max-h-32 border-t border-border/40">
          {resultStr.length > 500 ? resultStr.slice(0, 500) + "\n..." : resultStr}
        </pre>
      )}
    </div>
  );
}

export function ChatMessage({ message, onA2UIAction }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const timestamp = formatTime(new Date());

  return (
    <div className={cn("flex gap-2 group", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5",
          isUser
            ? "bg-primary/20 text-primary"
            : "bg-green-500/20 text-green-500"
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      {/* Content */}
      <div className={cn("flex-1 min-w-0 space-y-1", isUser && "items-end flex flex-col")}>
        {message.parts && message.parts.length > 0 ? (
          message.parts.map((part, idx) => {
            const p = part as AnyPart;

            if (p.type === "step-start") {
              return null;
            }

            if (p.type === "text") {
              const textPart = p as TextUIPart;
              return (
                <div
                  key={idx}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm leading-relaxed",
                    isUser
                      ? "bg-primary text-primary-foreground max-w-[85%]"
                      : "bg-card border border-border/50 text-card-foreground"
                  )}
                >
                  {isAssistant ? (
                    <div className="space-y-0.5">{renderTextContent(textPart.text)}</div>
                  ) : (
                    textPart.text
                  )}
                </div>
              );
            }

            if (p.type === "reasoning") {
              const reasonPart = p as ReasoningUIPart;
              const displayText = reasonPart.text ?? "";
              return (
                <div key={idx} className="text-[11px] text-muted-foreground italic px-1">
                  {displayText.length > 100 ? displayText.slice(0, 100) + "..." : displayText}
                </div>
              );
            }

            // Tool parts (static or dynamic)
            if (p.type === "dynamic-tool" || p.type.startsWith("tool-")) {
              return <ToolPartCard key={idx} part={p} onA2UIAction={onA2UIAction} />;
            }

            return null;
          })
        ) : (
          <div
            className={cn(
              "rounded-xl px-3 py-2 text-sm leading-relaxed",
              isUser
                ? "bg-primary text-primary-foreground max-w-[85%]"
                : "bg-card border border-border/50 text-card-foreground"
            )}
          >
            <span className="text-muted-foreground text-xs italic">빈 메시지</span>
          </div>
        )}

        {/* Timestamp */}
        <span
          className={cn(
            "text-[10px] text-muted-foreground/60 px-1 opacity-0 group-hover:opacity-100 transition-opacity",
            isUser && "text-right"
          )}
        >
          {timestamp}
        </span>
      </div>
    </div>
  );
}
