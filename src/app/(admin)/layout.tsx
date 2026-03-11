"use client";

import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { Header } from "@/components/admin/header";
import { ErrorBoundary } from "@/components/admin/error-boundary";
import { OperatorProvider } from "@/lib/operators";
import { ChatPanel } from "@/components/chat/chat-panel";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div className="min-h-svh bg-background" />;
  }

  return (
    <OperatorProvider>
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />
        <SidebarInset>
          <Header
            onChatToggle={() => setIsChatOpen((prev) => !prev)}
            isChatOpen={isChatOpen}
          />
          <ErrorBoundary>
            <div className="flex flex-1 flex-col gap-0 overflow-auto">
              {children}
            </div>
          </ErrorBoundary>
        </SidebarInset>
        <ChatPanel
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      </SidebarProvider>
    </OperatorProvider>
  );
}
