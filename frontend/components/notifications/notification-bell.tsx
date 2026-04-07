"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, MessageSquare, Reply, Trash2, Upload, X } from "lucide-react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ApiResponse, AppNotification } from "@/types";

const ICON_MAP = {
  comment: MessageSquare,
  reply: Reply,
  upload: Upload,
} as const;

const COLOR_MAP = {
  comment: "text-blue-500",
  reply: "text-purple-500",
  upload: "text-green-500",
} as const;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  /** API prefix: "teacher" or "student" */
  rolePrefix: "teacher" | "student";
  /** Position of the dropdown panel */
  align?: "left" | "right";
}

export function NotificationBell({ rolePrefix, align = "right" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<
        ApiResponse<{ notifications: AppNotification[]; unread_count: number }>
      >(`/${rolePrefix}/notifications`);
      setNotifications(res.data.data.notifications);
      setUnreadCount(res.data.data.unread_count);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [rolePrefix]);

  // Fetch on mount and every 30s
  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const markRead = async (id: number) => {
    try {
      await api.put(`/${rolePrefix}/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silent
    }
  };

  const markAllRead = async () => {
    try {
      await api.put(`/${rolePrefix}/notifications/read-all`);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  const deleteOne = async (id: number, wasUnread: boolean) => {
    try {
      await api.delete(`/${rolePrefix}/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silent
    }
  };

  const clearAll = async () => {
    try {
      await api.delete(`/${rolePrefix}/notifications/clear`);
      setNotifications([]);
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  const handleClick = (n: AppNotification) => {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    router.push(n.link);
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) fetchNotifications();
        }}
        className="relative rounded-md p-2 text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className={cn(
            "absolute top-full mt-2 z-50 w-[26rem] max-h-[36rem] overflow-hidden rounded-xl border border-border bg-popover shadow-lg flex flex-col",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-popover-foreground">Notifications</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Clear all"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = ICON_MAP[n.type] || MessageSquare;
                const iconColor = COLOR_MAP[n.type] || "text-muted-foreground";
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "group flex items-start gap-3 border-b border-border/50 px-4 py-3 transition-colors",
                      n.is_read
                        ? "bg-popover hover:bg-muted/50"
                        : "bg-primary/5 hover:bg-primary/10"
                    )}
                  >
                    {/* Icon */}
                    <div className={cn("mt-0.5 shrink-0", iconColor)}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content — clickable */}
                    <button
                      onClick={() => handleClick(n)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p
                        className={cn(
                          "text-sm leading-snug",
                          n.is_read
                            ? "text-muted-foreground"
                            : "text-popover-foreground font-medium"
                        )}
                      >
                        {n.message}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {timeAgo(n.created_at)}
                      </p>
                    </button>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!n.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markRead(n.id);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Mark as read"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteOne(n.id, !n.is_read);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
