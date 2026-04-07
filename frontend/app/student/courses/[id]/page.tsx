"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, CirclePlay, Download, ExternalLink, Flame, Sparkles, Trophy, User, X, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentSection } from "@/components/comments/comment-section";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AISummaryPanel } from "@/components/ai/ai-summary-panel";
import { AIChatbot } from "@/components/ai/ai-chatbot";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { ApiResponse, Course, ResourceComment, ResourceItem } from "@/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000/api").replace(/\/api\/?$/, "");

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"];

function isVideoResource(url: string) {
  const lower = url.toLowerCase();
  if (VIDEO_EXTENSIONS.some((ext) => lower.includes(ext))) return true;
  return /youtube\.com|youtu\.be|vimeo\.com/.test(lower);
}

function getYoutubeEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

function toResourceUrl(urlOrPath: string) {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) return urlOrPath;
  return `${API_BASE_URL}/${urlOrPath.replace(/^\/+/, "")}`;
}

function getFileExtension(urlOrPath: string) {
  const clean = urlOrPath.split("?")[0].toLowerCase();
  const parts = clean.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function canPreviewInModal(resource: ResourceItem) {
  if (isVideoResource(resource.url_or_path)) return true;
  const ext = getFileExtension(resource.url_or_path);
  return ["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt"].includes(ext) || resource.type === "link";
}

export default function StudentCourseDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<ResourceItem | null>(null);
  const [commentsResource, setCommentsResource] = useState<ResourceItem | null>(null);
  const [comments, setComments] = useState<ResourceComment[]>([]);
  const user = useAuthStore((s) => s.user);
  const [completedResourceIds, setCompletedResourceIds] = useState<number[]>([]);
  const [streakDays, setStreakDays] = useState(1);
  const [quickNotes, setQuickNotes] = useState("");
  const highlightHandled = useRef(false);

  const updateStreak = () => {
    const currentDate = new Date();
    const today = currentDate.toISOString().slice(0, 10);
    const streakLastDayKey = "student-learning-last-day";
    const streakCountKey = "student-learning-streak";
    const lastDay = localStorage.getItem(streakLastDayKey);
    const existingStreak = Number(localStorage.getItem(streakCountKey) ?? "1") || 1;

    if (!lastDay) {
      localStorage.setItem(streakLastDayKey, today);
      localStorage.setItem(streakCountKey, "1");
      setStreakDays(1);
      return;
    }

    if (lastDay === today) {
      setStreakDays(existingStreak);
      return;
    }

    const previous = new Date(`${lastDay}T00:00:00`);
    const now = new Date(`${today}T00:00:00`);
    const diffDays = Math.round((now.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));

    const nextStreak = diffDays === 1 ? existingStreak + 1 : 1;
    localStorage.setItem(streakLastDayKey, today);
    localStorage.setItem(streakCountKey, String(nextStreak));
    setStreakDays(nextStreak);
  };

  const persistCompletion = (courseId: number, ids: number[]) => {
    localStorage.setItem(`student-course-complete-${courseId}`, JSON.stringify(ids));
  };

  const toggleResourceCompleted = (resourceId: number) => {
    if (!course) return;
    setCompletedResourceIds((prev) => {
      const next = prev.includes(resourceId) ? prev.filter((id) => id !== resourceId) : [...prev, resourceId];
      persistCompletion(course.id, next);
      return next;
    });
  };

  const saveNotes = () => {
    if (!course) return;
    localStorage.setItem(`student-course-notes-${course.id}`, quickNotes);
    toast.success("Notes saved");
  };

  const openComments = useCallback(async (resource: ResourceItem) => {
    try {
      setCommentsResource(resource);
      const response = await api.get<ApiResponse<{ comments: ResourceComment[] }>>(`/student/resource/${resource.id}/comments`);
      setComments(response.data.data.comments ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to load comments");
    }
  }, []);

  const submitComment = async (resourceId: number, content: string, parentId?: number) => {
    const clean = content.trim();
    if (!clean) {
      toast.error("Comment cannot be empty");
      return;
    }

    try {
      await api.post(`/student/resource/${resourceId}/comments`, {
        content: clean,
        ...(parentId ? { parent_id: parentId } : {}),
      });

      const response = await api.get<ApiResponse<{ comments: ResourceComment[] }>>(`/student/resource/${resourceId}/comments`);
      setComments(response.data.data.comments ?? []);
      toast.success(parentId ? "Reply added" : "Comment added");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to post comment");
    }
  };

  const deleteComment = async (resourceId: number, commentId: number) => {
    try {
      await api.delete(`/student/resource/${resourceId}/comments/${commentId}`);
      const response = await api.get<ApiResponse<{ comments: ResourceComment[] }>>(`/student/resource/${resourceId}/comments`);
      setComments(response.data.data.comments ?? []);
      toast.success("Comment deleted");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to delete comment");
    }
  };

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const response = await api.get<ApiResponse<Course>>(`/student/course/${params.id}`);
        setCourse(response.data.data);
      } catch (error: any) {
        toast.error(error?.response?.data?.message ?? "Failed to fetch course details");
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [params.id]);

  useEffect(() => {
    if (!course) return;

    updateStreak();
    localStorage.setItem(`student-course-last-open-${course.id}`, new Date().toISOString());

    const doneRaw = localStorage.getItem(`student-course-complete-${course.id}`);
    const notesRaw = localStorage.getItem(`student-course-notes-${course.id}`);

    try {
      const done = doneRaw ? (JSON.parse(doneRaw) as number[]) : [];
      setCompletedResourceIds(Array.isArray(done) ? done : []);
    } catch {
      setCompletedResourceIds([]);
    }

    setQuickNotes(notesRaw ?? "");
  }, [course]);

  /* Auto-open comments when navigating from a notification */
  useEffect(() => {
    if (!course || highlightHandled.current) return;
    const highlight = searchParams.get("highlight");
    if (!highlight) return;
    const match = highlight.match(/^resource-(\d+)$/);
    if (!match) return;
    const resourceId = Number(match[1]);
    const resource = (course.resources ?? []).find((r) => r.id === resourceId);
    if (resource) {
      highlightHandled.current = true;
      openComments(resource);
    }
  }, [course, searchParams, openComments]);

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!course) {
    return <p className="text-sm text-muted-foreground">Course not found.</p>;
  }

  const resources = course.resources ?? [];
  const totalResources = resources.length;
  const videoCount = resources.filter((resource) => isVideoResource(resource.url_or_path)).length;
  const fileCount = resources.filter((resource) => resource.type === "file" && !isVideoResource(resource.url_or_path)).length;
  const linkCount = resources.filter((resource) => resource.type === "link" && !isVideoResource(resource.url_or_path)).length;
  const completionPercent = totalResources ? Math.min(100, Math.round((completedResourceIds.length / totalResources) * 100)) : 0;
  const xpPoints = completedResourceIds.length * 20 + videoCount * 5 + linkCount * 3 + fileCount * 4;
  const estimatedMinutes = videoCount * 20 + fileCount * 10 + linkCount * 6;
  const nextResource = resources.find((resource) => !completedResourceIds.includes(resource.id));

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <Link href="/student/courses">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to courses
          </Button>
        </Link>
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          Learning Track
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Course Overview</p>
              <h2 className="text-2xl font-bold">{course.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{course.description || "No description"}</p>
            </div>
            <div className="rounded-lg border bg-background/60 px-4 py-3 text-right">
              <p className="text-xs text-muted-foreground">XP Progress</p>
              <p className="text-xl font-bold">{completionPercent}%</p>
            </div>
          </div>
          <progress
            className="mt-4 h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
            value={completionPercent}
            max={100}
          />
        </div>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Instructor</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-medium">
              <User className="h-4 w-4" />
              {course.teacher?.name ?? "Unknown teacher"}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Total Resources</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-medium">
              <BookOpen className="h-4 w-4" />
              {totalResources}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Videos</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-medium">
              <CirclePlay className="h-4 w-4" />
              {videoCount}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Reward Tier</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-medium">
              <Trophy className="h-4 w-4" />
              {completionPercent >= 80 ? "Gold" : completionPercent >= 50 ? "Silver" : "Bronze"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-stretch gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Resources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {resources.length ? (
              resources.map((resource, index) => (
                <div key={resource.id} className="rounded-lg border bg-muted/20 p-4 text-sm">
                  <div className="mb-3 flex w-full items-center justify-between gap-3 text-left">
                    <p className="font-semibold">
                      #{index + 1} {resource.title}
                    </p>
                    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {resource.type === "file" ? "File" : "Link"}
                    </span>
                  </div>
                  {resource.notes ? (
                    <p className="mb-3 text-xs text-muted-foreground">Note: {resource.notes}</p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedResource(resource)}
                      disabled={!canPreviewInModal(resource)}
                    >
                      Open Preview
                    </Button>
                    <Button
                      variant={completedResourceIds.includes(resource.id) ? "default" : "ghost"}
                      onClick={() => toggleResourceCompleted(resource.id)}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {completedResourceIds.includes(resource.id) ? "Completed" : "Mark Complete"}
                    </Button>
                    <a href={toResourceUrl(resource.url_or_path)} target="_blank" rel="noreferrer">
                      <Button variant="outline">
                        <ExternalLink className="mr-2 h-4 w-4" /> Open in new tab
                      </Button>
                    </a>
                    <Button variant="outline" onClick={() => openComments(resource)}>
                      Comments
                    </Button>
                    <a href={toResourceUrl(resource.url_or_path)} target="_blank" rel="noreferrer">
                      <Button>
                        <Download className="mr-2 h-4 w-4" /> Download
                      </Button>
                    </a>
                  </div>

                  {/* AI Analysis Panel */}
                  <div className="mt-3">
                    <AISummaryPanel resource={resource} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No resources found for this course.</p>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Learning Stats</CardTitle>
          </CardHeader>
          <CardContent className="grid h-full content-start gap-2.5 text-sm">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Daily Streak</p>
              <p className="mt-1 inline-flex items-center gap-2 font-medium">
                <Flame className="h-4 w-4" />
                {streakDays} day{streakDays > 1 ? "s" : ""}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">XP Points</p>
              <p className="mt-1 inline-flex items-center gap-2 font-medium">
                <Zap className="h-4 w-4" />
                {xpPoints}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Estimated Study Time</p>
              <p className="mt-1 inline-flex items-center gap-2 font-medium">
                <BookOpen className="h-4 w-4" />
                {estimatedMinutes} mins
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Next Recommended</p>
              <p className="mt-1 font-medium">
                {nextResource ? nextResource.title : "All resources completed 🎉"}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="mb-2 text-xs text-muted-foreground">Quick Notes</p>
              <textarea
                value={quickNotes}
                onChange={(event) => setQuickNotes(event.target.value)}
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                placeholder="Write your key points or revision notes..."
              />
              <Button onClick={saveNotes} className="mt-2 w-full">Save Notes</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selectedResource)} onOpenChange={(open) => !open && setSelectedResource(null)}>
        <DialogContent showCloseButton={false} className="w-[92vw] max-w-5xl max-h-[95vh] overflow-hidden p-0 sm:rounded-xl">
          <DialogHeader>
            <div className="border-b px-4 py-2.5 sm:px-5 sm:py-3">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="line-clamp-1 min-w-0 text-sm font-semibold sm:text-base">{selectedResource?.title}</DialogTitle>
                <div className="flex shrink-0 items-center gap-2">
                  {selectedResource && (
                    <>
                      <a href={toResourceUrl(selectedResource.url_or_path)} target="_blank" rel="noreferrer">
                        <Button variant="outline" className="h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm">
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                        </Button>
                      </a>
                      <a href={toResourceUrl(selectedResource.url_or_path)} target="_blank" rel="noreferrer">
                        <Button className="h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm">
                          <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                        </Button>
                      </a>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background text-foreground transition-colors hover:bg-muted sm:h-9 sm:w-9"
                  onClick={() => setSelectedResource(null)}
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </DialogHeader>
          {selectedResource && (
            <div className="space-y-3 overflow-y-auto px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
              <div className="overflow-hidden rounded-lg border bg-muted/20">
              {isVideoResource(selectedResource.url_or_path) ? (
                getYoutubeEmbedUrl(selectedResource.url_or_path) ? (
                  <iframe
                    className="aspect-video max-h-[72vh] w-full sm:max-h-[76vh]"
                    src={getYoutubeEmbedUrl(selectedResource.url_or_path) ?? ""}
                    title={selectedResource.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video className="max-h-[72vh] w-full sm:max-h-[76vh]" controls>
                    <source src={toResourceUrl(selectedResource.url_or_path)} />
                    Your browser does not support the video tag.
                  </video>
                )
              ) : selectedResource.type === "file" ? (
                getFileExtension(selectedResource.url_or_path) === "pdf" ? (
                  <iframe className="h-[70vh] w-full sm:h-[74vh]" src={toResourceUrl(selectedResource.url_or_path)} title={selectedResource.title} />
                ) : ["png", "jpg", "jpeg", "gif", "webp"].includes(getFileExtension(selectedResource.url_or_path)) ? (
                  <img src={toResourceUrl(selectedResource.url_or_path)} alt={selectedResource.title} className="max-h-[70vh] w-full object-contain sm:max-h-[74vh]" />
                ) : (
                  <iframe className="h-[70vh] w-full sm:h-[74vh]" src={toResourceUrl(selectedResource.url_or_path)} title={selectedResource.title} />
                )
              ) : (
                <iframe className="h-[70vh] w-full sm:h-[74vh]" src={toResourceUrl(selectedResource.url_or_path)} title={selectedResource.title} />
              )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Chatbot — course-specific */}
      <AIChatbot courseId={course.id} courseName={course.name} />

      <Dialog open={Boolean(commentsResource)} onOpenChange={(open) => !open && setCommentsResource(null)}>
        <DialogContent className="flex h-[90vh] max-w-2xl flex-col" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Comments &bull; {commentsResource?.title}</DialogTitle>
          </DialogHeader>

          <CommentSection
            comments={comments}
            currentUserId={user?.id ?? null}
            onPost={(content) => commentsResource && submitComment(commentsResource.id, content)}
            onReply={(parentId, content) => commentsResource && submitComment(commentsResource.id, content, parentId)}
            onDelete={(commentId) => commentsResource && deleteComment(commentsResource.id, commentId)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
