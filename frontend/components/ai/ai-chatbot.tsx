"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  ChevronDown,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { ApiResponse } from "@/types";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AIChatbotProps {
  /** Course ID for course-specific chat. Omit for general chat. */
  courseId?: number;
  /** Course name for display */
  courseName?: string;
}

/* ------------------------------------------------------------------ */
/* Markdown-lite renderer                                              */
/* ------------------------------------------------------------------ */

function renderMarkdown(text: string) {
  // Simple markdown: bold, italic, code, lists, headings
  const lines = text.split("\n");
  const elements: JSX.Element[] = [];

  lines.forEach((line, idx) => {
    let content = line;

    // Headings
    if (content.startsWith("### ")) {
      elements.push(
        <h4 key={idx} className="mt-3 mb-1 text-sm font-bold">
          {formatInline(content.slice(4))}
        </h4>
      );
      return;
    }
    if (content.startsWith("## ")) {
      elements.push(
        <h3 key={idx} className="mt-3 mb-1 text-sm font-bold">
          {formatInline(content.slice(3))}
        </h3>
      );
      return;
    }
    if (content.startsWith("# ")) {
      elements.push(
        <h3 key={idx} className="mt-3 mb-1 font-bold">
          {formatInline(content.slice(2))}
        </h3>
      );
      return;
    }

    // Bullet points
    if (/^\s*[-*]\s/.test(content)) {
      elements.push(
        <li key={idx} className="ml-4 list-disc text-sm">
          {formatInline(content.replace(/^\s*[-*]\s/, ""))}
        </li>
      );
      return;
    }

    // Numbered lists
    if (/^\s*\d+\.\s/.test(content)) {
      elements.push(
        <li key={idx} className="ml-4 list-decimal text-sm">
          {formatInline(content.replace(/^\s*\d+\.\s/, ""))}
        </li>
      );
      return;
    }

    // Empty lines
    if (!content.trim()) {
      elements.push(<div key={idx} className="h-2" />);
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={idx} className="text-sm">
        {formatInline(content)}
      </p>
    );
  });

  return <div className="space-y-0.5">{elements}</div>;
}

function formatInline(text: string) {
  // Replace **bold**, *italic*, `code`
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let keyIdx = 0;

  // Code blocks
  while (remaining.includes("`")) {
    const start = remaining.indexOf("`");
    const end = remaining.indexOf("`", start + 1);
    if (end === -1) break;

    if (start > 0) parts.push(remaining.slice(0, start));
    parts.push(
      <code key={`code-${keyIdx++}`} className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
        {remaining.slice(start + 1, end)}
      </code>
    );
    remaining = remaining.slice(end + 1);
  }

  // Bold
  if (remaining.includes("**")) {
    const regex = /\*\*(.*?)\*\*/g;
    let lastIndex = 0;
    let match;
    const boldParts: (string | JSX.Element)[] = [];
    while ((match = regex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        boldParts.push(remaining.slice(lastIndex, match.index));
      }
      boldParts.push(
        <strong key={`bold-${keyIdx++}`} className="font-semibold">
          {match[1]}
        </strong>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < remaining.length) {
      boldParts.push(remaining.slice(lastIndex));
    }
    parts.push(...boldParts);
  } else {
    parts.push(remaining);
  }

  return <>{parts}</>;
}

/* ------------------------------------------------------------------ */
/* Chatbot Component                                                   */
/* ------------------------------------------------------------------ */

export function AIChatbot({ courseId, courseName }: AIChatbotProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const resp = await api.post<ApiResponse<{ reply: string; chat_id: number | null }>>("/ai/chat", {
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        course_id: courseId || undefined,
        chat_id: chatId || undefined,
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: resp.data.data.reply,
      };
      setMessages([...newMessages, assistantMsg]);
      if (resp.data.data.chat_id) {
        setChatId(resp.data.data.chat_id);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "AI chat failed");
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setChatId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Suggested prompts
  const suggestions = courseId
    ? [
        "Summarize the key concepts in this course",
        "What should I focus on to prepare for exams?",
        "Explain the main topics covered",
        "Create a study plan for this course",
      ]
    : [
        "Help me create a study schedule",
        "Tips for effective note-taking",
        "How to prepare for exams effectively",
        "Explain active recall and spaced repetition",
      ];

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl"
          aria-label="Open AI Chat"
        >
          <MessageSquare className="h-6 w-6" />
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-bold text-black">
            AI
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl transition-all ${
            expanded
              ? "bottom-4 left-4 right-4 top-4 sm:bottom-6 sm:left-auto sm:right-6 sm:top-6 sm:h-[calc(100vh-48px)] sm:w-[600px]"
              : "bottom-6 right-6 h-[560px] w-[400px] max-h-[80vh]"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">AI Study Assistant</h3>
                <p className="text-[11px] text-muted-foreground">
                  {courseId ? `Course: ${courseName || "Current"}` : "General Study Help"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  title="Clear chat"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                title={expanded ? "Minimize" : "Expand"}
              >
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h4 className="text-sm font-semibold mb-1">
                  {courseId ? "Course AI Assistant" : "AI Study Assistant"}
                </h4>
                <p className="text-xs text-muted-foreground mb-4 max-w-[250px]">
                  {courseId
                    ? "Ask me anything about this course! I have context about all resources and materials."
                    : "I can help with study tips, exam prep, explanations, and more!"}
                </p>
                <div className="w-full space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Suggestions
                  </p>
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInput(s);
                        inputRef.current?.focus();
                      }}
                      className="block w-full rounded-lg border bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    renderMarkdown(msg.content)
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="rounded-2xl bg-muted px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border bg-muted/30 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary"
                rows={1}
                disabled={loading}
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="h-10 w-10 shrink-0 rounded-xl p-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
              AI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
