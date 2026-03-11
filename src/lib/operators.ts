"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type OperatorRole = "oncall_engineer" | "release_manager" | "ops_engineer" | "support_lead";

export const ROLE_LABELS: Record<OperatorRole, string> = {
  oncall_engineer: "On-call Engineer",
  release_manager: "Release Manager",
  ops_engineer: "Operations Engineer",
  support_lead: "Support / Incident Lead",
};

export const ROLE_COLORS: Record<OperatorRole, string> = {
  oncall_engineer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  release_manager: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  ops_engineer: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  support_lead: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

export interface Operator {
  id: string;
  name: string;
  role: OperatorRole;
  avatar_url: string;
  is_active: number;
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface OperatorContextValue {
  currentOperator: Operator | null;
  operators: Operator[];
  setCurrentOperator: (operator: Operator) => void;
  isLoading: boolean;
}

const OperatorContext = createContext<OperatorContextValue | null>(null);

const STORAGE_KEY = "devops_console_operator_id";

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [currentOperator, setCurrentOperatorState] = useState<Operator | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadOperators() {
      try {
        const res = await fetch("/api/operators");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setOperators(data);
          }
        }
      } catch {
        // will stay empty
      } finally {
        setIsLoading(false);
      }
    }
    loadOperators();
  }, []);

  useEffect(() => {
    if (operators.length === 0) return;
    const savedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const found = savedId ? operators.find((o) => o.id === savedId) : null;
    setCurrentOperatorState(found ?? operators[0]);
  }, [operators]);

  const setCurrentOperator = useCallback((operator: Operator) => {
    setCurrentOperatorState(operator);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, operator.id);
    }
  }, []);

  return React.createElement(
    OperatorContext.Provider,
    { value: { currentOperator, operators, setCurrentOperator, isLoading } },
    children
  );
}

export function useOperator() {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error("useOperator must be used within OperatorProvider");
  return ctx;
}
