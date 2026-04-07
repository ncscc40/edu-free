"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Building2, GraduationCap, LogOut, PanelLeftClose, PanelLeftOpen, ShieldCheck, UserCog } from "lucide-react";

import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import type { Role } from "@/types";

const NAV: Record<Role, Array<{ href: string; label: string; icon: ComponentType<{ className?: string }> }>> = {
  admin: [
    { href: "/admin/teachers", label: "Teachers", icon: UserCog },
    { href: "/admin/departments", label: "Departments", icon: Building2 },
  ],
  teacher: [
    { href: "/teacher/my-departments", label: "My Departments", icon: Building2 },
    { href: "/teacher/create-course", label: "Upload Resources", icon: BookOpen },
    { href: "/teacher/my-courses", label: "My Courses", icon: GraduationCap },
  ],
  student: [
    { href: "/student/courses", label: "Courses", icon: BookOpen },
  ],
};

export function Sidebar({ role, collapsed, onToggle }: { role: Role; collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col border-r border-border bg-card/95 p-3 backdrop-blur transition-all duration-300",
        collapsed ? "w-20" : "w-72"
      )}
    >
      <div className="mb-3 flex h-12 items-center justify-between gap-2">
        <div className={cn("min-w-0 transition-all duration-300", collapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-content-center rounded-lg bg-primary/15 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Signed in as</p>
                <p className="text-sm font-semibold leading-tight">{roleLabel}</p>
              </div>
            </div>
          )}
        </div>
        <Button variant="ghost" onClick={onToggle} className="h-9 w-9 p-0" title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 pr-1">
        {NAV[role].map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "relative flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                collapsed ? "justify-center" : "gap-2.5",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground"
              )}
            >
              {active && !collapsed && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-primary-foreground/80" />}
              <span
                className={cn(
                  "grid h-6 w-6 place-content-center rounded-md",
                  active ? "bg-primary-foreground/20" : "bg-transparent"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-2 flex items-center gap-2">
          <ThemeToggle collapsed={collapsed} />
        </div>
        <Button
          variant="outline"
          className={cn("w-full", collapsed && "px-0")}
          onClick={() => {
            logout();
            router.push("/login");
          }}
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut className={cn("h-4 w-4", !collapsed && "mr-2")} />
          {!collapsed && "Logout"}
        </Button>
      </div>
    </aside>
  );
}
