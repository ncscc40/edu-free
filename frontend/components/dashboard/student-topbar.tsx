"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, LogOut } from "lucide-react";

import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";

export function StudentTopBar() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 md:px-6">
        <Link href="/student/courses" className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-primary" />
          Student Learning Hub
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell rolePrefix="student" align="right" />
          <ThemeToggle />
          <Button
            variant="outline"
            onClick={() => {
              logout();
              router.push("/login");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
