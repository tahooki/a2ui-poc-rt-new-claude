"use client";

import { ChevronDown, UserCircle2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOperator, ROLE_LABELS, ROLE_COLORS, getInitials, type Operator } from "@/lib/operators";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function OperatorSwitcher() {
  const { currentOperator, operators, setCurrentOperator, isLoading } = useOperator();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-4 w-24 hidden sm:block" />
      </div>
    );
  }

  if (!currentOperator) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center h-auto px-2 py-1.5 gap-2 cursor-pointer rounded-md hover:bg-accent/50 transition-colors duration-150"
      >
        <Avatar size="sm">
          <AvatarFallback className="text-xs font-semibold bg-[#1E293B] text-[#F8FAFC]">
            {getInitials(currentOperator.name)}
          </AvatarFallback>
        </Avatar>
        <div className="hidden sm:flex flex-col items-start gap-0.5 min-w-0">
          <span className="text-xs font-medium leading-none truncate max-w-[120px]">
            {currentOperator.name}
          </span>
          <span className="text-[10px] text-muted-foreground leading-none truncate max-w-[120px]">
            {ROLE_LABELS[currentOperator.role]}
          </span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal pb-1">
          <div className="flex items-center gap-1.5">
            <UserCircle2 className="h-3.5 w-3.5" />
            Switch Operator
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {operators.map((operator) => (
          <OperatorItem
            key={operator.id}
            operator={operator}
            isSelected={operator.id === currentOperator.id}
            onSelect={() => setCurrentOperator(operator)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OperatorItem({
  operator,
  isSelected,
  onSelect,
}: {
  operator: Operator;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      className={cn(
        "flex items-center gap-2.5 cursor-pointer py-2 px-2 transition-colors duration-150",
        isSelected && "bg-accent"
      )}
      onSelect={onSelect}
    >
      <Avatar size="sm">
        <AvatarFallback className="text-xs font-semibold bg-[#1E293B] text-[#F8FAFC]">
          {getInitials(operator.name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm font-medium leading-none truncate">{operator.name}</span>
        <Badge
          variant="outline"
          className={cn(
            "w-fit text-[10px] px-1.5 py-0 h-4 font-normal border",
            ROLE_COLORS[operator.role]
          )}
        >
          {ROLE_LABELS[operator.role]}
        </Badge>
      </div>
      {isSelected && (
        <div className="h-1.5 w-1.5 rounded-full bg-[#22C55E] shrink-0" />
      )}
    </DropdownMenuItem>
  );
}
