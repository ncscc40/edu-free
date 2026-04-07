"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import type { Role } from "@/types";

export function RoleShell({ role, children }: { role: Role; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("sidebar-collapsed");
    if (saved) {
      setCollapsed(saved === "1");
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role={role} collapsed={collapsed} onToggle={toggleCollapsed} />
      <main className="h-screen flex-1 overflow-y-auto p-4 md:p-6">
        {role === "teacher" && (
          <div className="mx-auto mb-4 flex w-full max-w-7xl items-center justify-end">
            <NotificationBell rolePrefix="teacher" align="right" />
          </div>
        )}
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
