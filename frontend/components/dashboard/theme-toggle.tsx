"use client";

import { cn } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      className={cn("w-full", collapsed && "px-0")}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={collapsed ? "Toggle theme" : undefined}
    >
      {isDark ? <Sun className={cn("h-4 w-4", !collapsed && "mr-2")} /> : <Moon className={cn("h-4 w-4", !collapsed && "mr-2")} />}
      {!collapsed && (isDark ? "Light mode" : "Dark mode")}
    </Button>
  );
}
