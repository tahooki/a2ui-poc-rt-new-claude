"use client";

import { usePathname } from "next/navigation";
import { MessageSquare, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { OperatorSwitcher } from "./operator-switcher";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/incidents": "Incidents",
  "/deployments": "Deployments",
  "/jobs": "Jobs",
  "/reports": "Reports",
  "/audit": "Audit Log",
};

function getPageTitle(pathname: string): string {
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return title;
    }
  }
  return "DevOps Console";
}

interface HeaderProps {
  onChatToggle?: () => void;
  isChatOpen?: boolean;
}

export function Header({ onChatToggle, isChatOpen }: HeaderProps) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border/50 bg-background/95 backdrop-blur-sm px-3">
      <div className="flex items-center gap-1.5">
        <SidebarTrigger className="-ml-1 cursor-pointer" />
        <Separator orientation="vertical" className="h-4 mx-1" />
        <h1 className="text-sm font-semibold text-foreground tracking-tight font-mono">
          {pageTitle}
        </h1>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground transition-colors duration-150"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </Button>

        <Button
          variant={isChatOpen ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground transition-colors duration-150"
          onClick={onChatToggle}
          aria-label="Toggle AI chat"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <OperatorSwitcher />
      </div>
    </header>
  );
}
