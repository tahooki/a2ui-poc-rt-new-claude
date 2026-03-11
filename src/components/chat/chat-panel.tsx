"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, X, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOperator } from "@/lib/operators";
import { ChatMessage } from "./chat-message";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ScenarioQuestionSuggestion {
  id: string;
  question: string;
}

const PAGE_SUGGESTIONS: Record<string, string[]> = {
  "/dashboard": [
    "현재 시스템 상태를 요약해줘",
    "오늘 발생한 인시던트를 알려줘",
    "최근 배포 현황은 어때?",
    "주요 지표에서 이상 징후가 있어?",
  ],
  "/incidents": [
    "현재 열린 인시던트 목록을 보여줘",
    "심각도 높은 인시던트는 뭐야?",
    "인시던트 평균 해결 시간은?",
    "이번 주 인시던트 트렌드를 분석해줘",
  ],
  "/deployments": [
    "최근 배포 상태를 알려줘",
    "실패한 배포가 있어?",
    "롤백이 필요한 배포는?",
    "오늘 예정된 배포 일정은?",
  ],
  "/jobs": [
    "실행 중인 잡 목록을 보여줘",
    "실패한 잡이 있어?",
    "가장 오래 걸리는 잡은?",
    "잡 성공률을 알려줘",
  ],
  "/reports": [
    "지난 주 운영 보고서를 요약해줘",
    "SLA 달성률은 어때?",
    "주요 성능 지표를 보여줘",
    "이번 달 인시던트 통계는?",
  ],
  "/audit": [
    "최근 감사 로그에서 이상 활동이 있어?",
    "오늘 변경된 설정을 알려줘",
    "누가 가장 많은 작업을 했어?",
    "보안 관련 이벤트를 보여줘",
  ],
};

function getPageSuggestions(pathname: string): string[] {
  for (const [prefix, suggestions] of Object.entries(PAGE_SUGGESTIONS)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return suggestions;
    }
  }
  return [
    "현재 시스템 상태를 요약해줘",
    "도움이 필요한 작업이 있어?",
    "최근 이슈를 알려줘",
    "운영 현황을 요약해줘",
  ];
}

function getChatPage(pathname: string): string {
  const page = pathname.replace(/^\/+/, "").split("/")[0];
  return page || "dashboard";
}

/** Convert a DB message row into a UIMessage for the useChat hook. */
function dbMessageToUIMessage(row: {
  id: string;
  role: string;
  content: string;
}): UIMessage {
  return {
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: [{ type: "text" as const, text: row.content }],
  };
}

/** Extract plain text content from a UIMessage's parts. */
function extractTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const pathname = usePathname();
  const { currentOperator } = useOperator();
  const [inputValue, setInputValue] = useState("");
  const [scenarioSuggestions, setScenarioSuggestions] = useState<string[] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persistence state
  const threadIdRef = useRef<string | null>(null);
  const savedMessageIdsRef = useRef<Set<string>>(new Set());
  const prevStatusRef = useRef<string>("");

  const pageContext = currentOperator
    ? {
        page: getChatPage(pathname),
        operatorId: currentOperator.id,
        operatorRole: currentOperator.role,
      }
    : null;
  const pageContextRef = useRef(pageContext);
  pageContextRef.current = pageContext;

  const { messages, setMessages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () =>
        pageContextRef.current
          ? { context: pageContextRef.current }
          : {},
    }),
  });

  const isLoading = status === "submitted" || status === "streaming";
  const canSend = Boolean(currentOperator) && !isLoading;
  const suggestions =
    scenarioSuggestions && scenarioSuggestions.length > 0
      ? scenarioSuggestions
      : getPageSuggestions(pathname);

  useEffect(() => {
    if (!isOpen) {
      setScenarioSuggestions(null);
      return;
    }

    const page = getChatPage(pathname);
    const controller = new AbortController();

    async function loadScenarioSuggestions() {
      try {
        const res = await fetch(
          `/api/runtime/scenario/questions?page=${encodeURIComponent(page)}&limit=4`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }

        const data = (await res.json()) as { questions?: ScenarioQuestionSuggestion[] };
        if (controller.signal.aborted) return;

        const nextSuggestions = (data.questions ?? [])
          .map((item) => item.question)
          .filter((item) => item.trim().length > 0);

        setScenarioSuggestions(nextSuggestions.length > 0 ? nextSuggestions : null);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("[ChatPanel] Failed to load scenario suggestions:", err);
        setScenarioSuggestions(null);
      }
    }

    loadScenarioSuggestions();

    return () => {
      controller.abort();
    };
  }, [isOpen, pathname]);

  // Load thread state only while the panel is open to avoid stale requests during navigation.
  useEffect(() => {
    if (!isOpen || !currentOperator) {
      threadIdRef.current = null;
      savedMessageIdsRef.current = new Set();
      setMessages([]);
      return;
    }

    const page = getChatPage(pathname);
    const operatorId = currentOperator.id;
    const controller = new AbortController();

    async function loadThread() {
      try {
        const res = await fetch(
          `/api/chat/threads?operatorId=${encodeURIComponent(operatorId)}&page=${encodeURIComponent(page)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;

        const data = await res.json();
        if (controller.signal.aborted) return;

        if (data.threadId && data.messages?.length > 0) {
          threadIdRef.current = data.threadId;
          const uiMessages: UIMessage[] = data.messages
            .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
            .map(dbMessageToUIMessage);

          // Mark all loaded messages as already saved
          for (const m of data.messages) {
            savedMessageIdsRef.current.add(m.id);
          }

          if (uiMessages.length > 0) {
            setMessages(uiMessages);
          }
        } else {
          threadIdRef.current = null;
          setMessages([]);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("[ChatPanel] Failed to load thread:", err);
      }
    }

    // Reset state when page/operator changes
    threadIdRef.current = null;
    savedMessageIdsRef.current = new Set();

    loadThread();
    return () => {
      controller.abort();
    };
  }, [currentOperator, isOpen, pathname, setMessages]);

  // Persist new messages when status transitions from streaming/submitted to ready
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;

    const wasActive = prevStatus === "streaming" || prevStatus === "submitted";
    const isNowReady = status === "ready";

    if (!wasActive || !isNowReady) return;
    if (!currentOperator || messages.length === 0) return;

    const page = getChatPage(pathname);

    async function persistMessages() {
      try {
        // Ensure we have a thread
        if (!threadIdRef.current) {
          const res = await fetch("/api/chat/threads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operatorId: currentOperator!.id,
              page,
            }),
          });
          if (!res.ok) return;
          const thread = await res.json();
          threadIdRef.current = thread.id;
        }

        const threadId = threadIdRef.current!;

        // Save any messages that haven't been saved yet
        for (const msg of messages) {
          if (savedMessageIdsRef.current.has(msg.id)) continue;
          if (msg.role !== "user" && msg.role !== "assistant") continue;

          const content = extractTextContent(msg);

          try {
            await fetch(`/api/chat/threads/${encodeURIComponent(threadId)}/messages`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: msg.id,
                role: msg.role,
                content,
              }),
            });
            savedMessageIdsRef.current.add(msg.id);
          } catch (err) {
            console.error("[ChatPanel] Failed to save message:", msg.id, err);
          }
        }
      } catch (err) {
        console.error("[ChatPanel] Failed to persist messages:", err);
      }
    }

    persistMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  function handleSend() {
    const text = inputValue.trim();
    if (!text || !canSend) return;
    setInputValue("");
    sendMessage({ text });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSuggestionClick(suggestion: string) {
    if (!canSend) return;
    setInputValue("");
    sendMessage({ text: suggestion });
  }

  const handleA2UIAction = useCallback(
    async (actionName: string, context: Record<string, unknown>) => {
      if (!currentOperator) return;

      // Convert context values to strings (A2UI context uses literalString format)
      const stringContext: Record<string, string> = {};
      for (const [key, val] of Object.entries(context)) {
        stringContext[key] = String(val ?? "");
      }

      try {
        const res = await fetch("/api/a2ui-action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actionName,
            context: stringContext,
            actorId: currentOperator.id,
          }),
        });

        const result = await res.json();

        if (result.success && result.message) {
          // Send the action result as a follow-up message to the chat
          sendMessage({
            text: `[A2UI 작업 완료] ${result.message}`,
          });
        } else if (result.error) {
          sendMessage({
            text: `[A2UI 작업 실패] ${result.error}`,
          });
        }
      } catch (err) {
        console.error("[A2UI Action Error]", err);
        sendMessage({
          text: `[A2UI 작업 오류] 작업 실행 중 오류가 발생했습니다: ${actionName}`,
        });
      }
    },
    [currentOperator, sendMessage],
  );

  return (
    <>
      {/* Backdrop (mobile only) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 sm:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed top-12 right-0 bottom-0 z-40 flex flex-col",
          "w-full sm:w-96",
          "bg-background border-l border-border",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500/15">
              <Bot className="h-4 w-4 text-green-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground leading-none">
                AI Copilot
              </span>
              <span className="flex items-center gap-1 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-muted-foreground">온라인</span>
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground shrink-0"
            onClick={onClose}
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-4 p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                  <Bot className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    AI Copilot
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    DevOps 운영을 도와드립니다.
                    <br />
                    아래 질문을 선택하거나 직접 입력하세요.
                  </p>
                </div>

                {/* Suggested questions */}
                <div className="flex flex-col gap-2 w-full">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="cursor-pointer rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-left text-xs text-muted-foreground hover:border-green-500/40 hover:bg-green-500/5 hover:text-foreground transition-colors duration-150"
                      onClick={() => handleSuggestionClick(suggestion)}
                      disabled={!canSend}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} onA2UIAction={handleA2UIAction} />
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex gap-2 items-center">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/20">
                      <Bot className="h-3.5 w-3.5 text-green-500" />
                    </div>
                    <div className="bg-card border border-border/50 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Loader2 className="h-3 w-3 text-green-500 animate-spin" />
                        <span className="text-xs text-muted-foreground">
                          {status === "submitted" ? "전송 중..." : "응답 생성 중..."}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="shrink-0 border-t border-border p-3 space-y-2">
          {/* Suggestion chips (when there are messages) */}
          {messages.length > 0 && !isLoading && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {suggestions.slice(0, 2).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="cursor-pointer whitespace-nowrap rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-green-500/40 hover:text-foreground transition-colors shrink-0"
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={!canSend}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentOperator ? "메시지를 입력하세요..." : "운영자 정보를 불러오는 중..."}
              disabled={!canSend}
              className="flex-1 text-sm h-9"
            />
            <Button
              type="button"
              size="icon"
              className={cn(
                "h-9 w-9 shrink-0 cursor-pointer transition-colors",
                "bg-green-600 hover:bg-green-500 text-white border-0"
              )}
              onClick={handleSend}
              disabled={!inputValue.trim() || !canSend}
              aria-label="전송"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
