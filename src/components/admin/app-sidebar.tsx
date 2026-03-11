"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  AlertTriangle,
  Rocket,
  Briefcase,
  FileText,
  ClipboardList,
  Terminal,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Incidents",
    href: "/incidents",
    icon: AlertTriangle,
  },
  {
    label: "Deployments",
    href: "/deployments",
    icon: Rocket,
  },
  {
    label: "Jobs",
    href: "/jobs",
    icon: Briefcase,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileText,
  },
  {
    label: "Audit Log",
    href: "/audit",
    icon: ClipboardList,
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3 pb-2">
        <div className="flex items-center gap-2 px-1 py-1 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#22C55E]">
            <Terminal className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-sm text-sidebar-foreground truncate group-data-[collapsible=icon]:hidden">
            Ops Console
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard" || pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      className={cn(
                        "transition-colors duration-150",
                        isActive &&
                          "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      )}
                      render={<Link href={item.href} />}
                    >
                      <item.icon
                        className={cn(
                          "h-4 w-4",
                          isActive ? "text-[#22C55E]" : "text-sidebar-foreground/70"
                        )}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
          <p className="text-[10px] text-sidebar-foreground/40 font-mono">
            DevOps Ops Console
          </p>
          <p className="text-[10px] text-sidebar-foreground/30 font-mono">v0.1.0-poc</p>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
