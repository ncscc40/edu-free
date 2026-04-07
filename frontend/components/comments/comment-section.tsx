"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, CornerDownRight, MoreVertical, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResourceComment } from "@/types";

/* ------------------------------------------------------------------ */
/* Time-ago helper                                                     */
/* ------------------------------------------------------------------ */

function timeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

function Avatar({ name, role }: { name: string; role: string }) {
  const initial = (name[0] ?? "?").toUpperCase();
  const bg =
    role === "teacher"
      ? "bg-blue-600 text-white"
      : role === "admin"
        ? "bg-red-600 text-white"
        : "bg-primary text-primary-foreground";

  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${bg}`}
    >
      {initial}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Role badge                                                          */
/* ------------------------------------------------------------------ */

function RoleBadge({ role }: { role: string }) {
  if (role === "student") return null;

  const colors =
    role === "teacher"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";

  return (
    <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-tight ${colors}`}>
      {role}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Three-dot menu                                                      */
/* ------------------------------------------------------------------ */

interface ThreeDotMenuProps {
  onReply?: () => void;
  onDelete?: () => void;
}

function ThreeDotMenu({ onReply, onDelete }: ThreeDotMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        aria-label="Comment actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[120px] rounded-md border bg-popover py-1 shadow-md">
          {onReply && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => { onReply(); setOpen(false); }}
            >
              <CornerDownRight className="h-3.5 w-3.5" />
              Reply
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-destructive hover:bg-muted"
              onClick={() => { onDelete(); setOpen(false); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Single comment row                                                  */
/* ------------------------------------------------------------------ */

/** Recursively count every reply (children + grandchildren + …) */
function countAllReplies(replies: ResourceComment[]): number {
  return replies.reduce((n, r) => n + 1 + countAllReplies(r.replies ?? []), 0);
}

interface CommentRowProps {
  comment: ResourceComment;
  currentUserId: number | null;
  canDeleteAny?: boolean;
  onDelete?: (commentId: number) => void;
  onReply?: (parentId: number, content: string) => void;
  depth?: number;
  isLast?: boolean;
  /** When true the row starts expanded (used for nested children once parent is opened) */
  forceOpen?: boolean;
}

function CommentRow({
  comment,
  currentUserId,
  canDeleteAny,
  onDelete,
  onReply,
  depth = 0,
  isLast = false,
  forceOpen = false,
}: CommentRowProps) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [repliesOpen, setRepliesOpen] = useState(forceOpen);
  const canDelete = canDeleteAny || comment.user.id === currentUserId;
  const isNested = depth > 0;
  const isDeleted = comment.is_deleted === true;

  const handleReply = () => {
    if (!replyText.trim()) return;
    onReply?.(comment.id, replyText.trim());
    setReplyText("");
    setShowReply(false);
  };

  const hasReplies = (comment.replies?.length ?? 0) > 0;
  const showMenu = !isDeleted && (canDelete || !!onReply);
  const childrenVisible = hasReplies && (depth > 0 || repliesOpen);

  /* ---- Deleted placeholder ---- */
  if (isDeleted) {
    return (
      <div className={isNested ? "relative pl-8 pt-3" : "relative mt-4 first:mt-0"}>
        {/* Horizontal connector from parent bridge to this avatar */}
        {isNested && (
          <div className="absolute left-[15px] top-[27px] h-0.5 w-[17px] bg-neutral-300 dark:bg-neutral-600" />
        )}
        {/* Mask: hide parent bridge below last child */}
        {isNested && isLast && (
          <div className="absolute left-[14px] top-[28px] bottom-0 z-[1] w-[5px] bg-card" />
        )}
        {/* Bridge to own children */}
        {childrenVisible && (
          <div className={`absolute bottom-0 w-0.5 bg-neutral-300 dark:bg-neutral-600 ${isNested ? "left-[48px] top-[44px]" : "left-[16px] top-[32px]"}`} />
        )}

        <div className="flex gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
            ?
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm italic text-muted-foreground">
              [This comment has been deleted]
            </p>
          </div>
        </div>

        {hasReplies && depth === 0 && (
          <>
            <button
              type="button"
              className="relative z-[2] ml-10 mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={() => setRepliesOpen((v) => !v)}
            >
              {repliesOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {repliesOpen ? "Hide" : "View"} {countAllReplies(comment.replies)} {countAllReplies(comment.replies) === 1 ? "reply" : "replies"}
            </button>
            {repliesOpen &&
              comment.replies.map((reply, idx) => (
                <CommentRow
                  key={reply.id}
                  comment={reply}
                  currentUserId={currentUserId}
                  canDeleteAny={canDeleteAny}
                  onDelete={onDelete}
                  onReply={onReply}
                  depth={depth + 1}
                  isLast={idx === comment.replies.length - 1}
                  forceOpen
                />
              ))}
          </>
        )}
        {hasReplies && depth > 0 &&
          comment.replies.map((reply, idx) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              canDeleteAny={canDeleteAny}
              onDelete={onDelete}
              onReply={onReply}
              depth={depth + 1}
              isLast={idx === comment.replies.length - 1}
              forceOpen
            />
          ))}
      </div>
    );
  }

  /* ---- Normal comment ---- */
  return (
    <div className={isNested ? "relative pl-8 pt-3" : "relative mt-4 first:mt-0"}>
      {/* Horizontal connector from parent bridge to this avatar */}
      {isNested && (
        <div className="absolute left-[16px] top-[26px] h-0.5 w-[16px] bg-neutral-300 dark:bg-neutral-600" />
      )}
      {/* Mask: hide parent bridge below last child */}
      {isNested && isLast && (
        <div className="absolute left-[14px] top-[28px] bottom-0 z-[1] w-[5px] bg-card" />
      )}
      {/* Bridge to own children */}
      {childrenVisible && (
        <div className={`absolute bottom-0 w-0.5 bg-neutral-300 dark:bg-neutral-600 ${isNested ? "left-[48px] top-[44px]" : "left-[16px] top-[32px]"}`} />
      )}

      <div className="flex gap-2.5">
        <Avatar name={comment.user.name} role={comment.user.role} />

        <div className="min-w-0 flex-1">
          {/* Header line */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold">{comment.user.name}</span>
              <RoleBadge role={comment.user.role} />
              <span className="text-xs text-muted-foreground">{timeAgo(comment.created_at)}</span>
            </div>

            {/* Three-dot menu */}
            {showMenu && (
              <ThreeDotMenu
                onReply={
                  onReply
                    ? () => setShowReply((prev) => !prev)
                    : undefined
                }
                onDelete={
                  canDelete && onDelete
                    ? () => onDelete(comment.id)
                    : undefined
                }
              />
            )}
          </div>

          {/* Content */}
          <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{comment.content}</p>

          {/* Inline reply box */}
          {showReply && (
            <div className="mb-2 mt-2 flex items-center gap-2 pb-1">
              <Input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Add a reply…"
                className="h-9 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleReply()}
                autoFocus
              />
              <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => { setShowReply(false); setReplyText(""); }}>
                Cancel
              </Button>
              <Button className="h-9 px-3 text-xs" onClick={handleReply} disabled={!replyText.trim()}>
                Reply
              </Button>
            </div>
          )}
        </div>
      </div>

      {hasReplies && depth === 0 && (
        <>
          <button
            type="button"
            className="relative z-[2] ml-10 mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            onClick={() => setRepliesOpen((v) => !v)}
          >
            {repliesOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {repliesOpen ? "Hide" : "View"} {countAllReplies(comment.replies)} {countAllReplies(comment.replies) === 1 ? "reply" : "replies"}
          </button>
          {repliesOpen &&
            comment.replies.map((reply, idx) => (
              <CommentRow
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                canDeleteAny={canDeleteAny}
                onDelete={onDelete}
                onReply={onReply}
                depth={depth + 1}
                isLast={idx === comment.replies.length - 1}
                forceOpen
              />
            ))}
        </>
      )}
      {hasReplies && depth > 0 &&
        comment.replies.map((reply, idx) => (
          <CommentRow
            key={reply.id}
            comment={reply}
            currentUserId={currentUserId}
            canDeleteAny={canDeleteAny}
            onDelete={onDelete}
            onReply={onReply}
            depth={depth + 1}
            isLast={idx === comment.replies.length - 1}
            forceOpen
          />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main comment section                                                */
/* ------------------------------------------------------------------ */

interface CommentSectionProps {
  comments: ResourceComment[];
  currentUserId: number | null;
  canDeleteAny?: boolean;
  onPost: (content: string) => void;
  onReply: (parentId: number, content: string) => void;
  onDelete: (commentId: number) => void;
}

export function CommentSection({
  comments,
  currentUserId,
  canDeleteAny = false,
  onPost,
  onReply,
  onDelete,
}: CommentSectionProps) {
  const [newComment, setNewComment] = useState("");
  const [focused, setFocused] = useState(false);

  const handlePost = () => {
    const clean = newComment.trim();
    if (!clean) return;
    onPost(clean);
    setNewComment("");
    setFocused(false);
  };

  /* Count only non-deleted comments recursively */
  const countVisible = (list: ResourceComment[]): number =>
    list.reduce((acc, c) => acc + (c.is_deleted ? 0 : 1) + countVisible(c.replies ?? []), 0);
  const visibleCount = countVisible(comments);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Comment count */}
      <p className="shrink-0 text-sm font-semibold">
        {visibleCount} Comment{visibleCount !== 1 ? "s" : ""}
      </p>

      {/* Add comment box */}
      <div className="mt-3 flex shrink-0 gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
          You
        </div>
        <div className="flex-1">
          <Input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment…"
            className="border-0 border-b border-border bg-transparent px-0 shadow-none focus-visible:ring-0"
            onFocus={() => setFocused(true)}
            onKeyDown={(e) => e.key === "Enter" && handlePost()}
          />
          {focused && (
            <div className="mt-2 flex justify-end gap-2">
              <Button
                variant="ghost"
                className="h-8 px-3 text-xs"
                onClick={() => { setFocused(false); setNewComment(""); }}
              >
                Cancel
              </Button>
              <Button
                className="h-8 rounded-full px-4 text-xs"
                onClick={handlePost}
                disabled={!newComment.trim()}
              >
                Comment
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Comment list — fixed height, scroll inside */}
      <div className="mt-3 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4 pr-1">
        {comments.length ? (
          comments.map((comment, idx) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              canDeleteAny={canDeleteAny}
              onDelete={onDelete}
              onReply={onReply}
              isLast={idx === comments.length - 1}
            />
          ))
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No comments yet. Be the first to comment!
          </p>
        )}
      </div>
    </div>
  );
}
