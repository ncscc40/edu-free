"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Clock3, Target, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AIChatbot } from "@/components/ai/ai-chatbot";
import { api } from "@/lib/api";
import type { ApiResponse, Course } from "@/types";

export default function StudentCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in-progress" | "completed">("all");
  const [progressMap, setProgressMap] = useState<Record<number, number>>({});
  const [lastViewedMap, setLastViewedMap] = useState<Record<number, string>>({});

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await api.get<ApiResponse<{ courses: Course[] }>>("/student/courses");
        setCourses(response.data.data.courses ?? []);
      } catch (error: any) {
        toast.error(error?.response?.data?.message ?? "Failed to fetch courses");
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  useEffect(() => {
    if (!courses.length) return;

    const nextProgress: Record<number, number> = {};
    const nextLastViewed: Record<number, string> = {};

    courses.forEach((course) => {
      const total = course.resources?.length ?? 0;
      const doneRaw = localStorage.getItem(`student-course-complete-${course.id}`);
      const lastViewed = localStorage.getItem(`student-course-last-open-${course.id}`);

      let completedCount = 0;
      try {
        const doneList = doneRaw ? (JSON.parse(doneRaw) as number[]) : [];
        completedCount = Array.isArray(doneList) ? doneList.length : 0;
      } catch {
        completedCount = 0;
      }

      nextProgress[course.id] = total ? Math.min(100, Math.round((completedCount / total) * 100)) : 0;
      if (lastViewed) nextLastViewed[course.id] = lastViewed;
    });

    setProgressMap(nextProgress);
    setLastViewedMap(nextLastViewed);
  }, [courses]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return courses.filter((course) => {
      const matchesText = course.name.toLowerCase().includes(q) || (course.description ?? "").toLowerCase().includes(q);
      if (!matchesText) return false;

      const progress = progressMap[course.id] ?? 0;
      if (statusFilter === "completed") return progress >= 100;
      if (statusFilter === "in-progress") return progress > 0 && progress < 100;
      return true;
    });
  }, [courses, progressMap, search, statusFilter]);

  const totalResources = useMemo(
    () => courses.reduce((sum, course) => sum + (course.resources?.length ?? 0), 0),
    [courses]
  );

  const avgProgress = useMemo(() => {
    if (!courses.length) return 0;
    const total = courses.reduce((sum, course) => sum + (progressMap[course.id] ?? 0), 0);
    return Math.round(total / courses.length);
  }, [courses, progressMap]);

  const completedCourses = useMemo(
    () => courses.filter((course) => (progressMap[course.id] ?? 0) >= 100).length,
    [courses, progressMap]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Courses</h2>
        <p className="mt-1 text-sm text-muted-foreground">Track progress, continue where you stopped, and level up your learning.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total Courses</p>
            <p className="mt-1 flex items-center gap-2 text-xl font-bold"><BookOpen className="h-5 w-5" />{courses.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Resources</p>
            <p className="mt-1 flex items-center gap-2 text-xl font-bold"><Target className="h-5 w-5" />{totalResources}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Avg Progress</p>
            <p className="mt-1 flex items-center gap-2 text-xl font-bold"><Clock3 className="h-5 w-5" />{avgProgress}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="mt-1 flex items-center gap-2 text-xl font-bold"><Trophy className="h-5 w-5" />{completedCourses}</p>
          </CardContent>
        </Card>
      </div>

      <Input placeholder="Search courses..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-full border px-3 py-1 text-xs ${statusFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={() => setStatusFilter("all")}
        >
          All
        </button>
        <button
          type="button"
          className={`rounded-full border px-3 py-1 text-xs ${statusFilter === "in-progress" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={() => setStatusFilter("in-progress")}
        >
          In Progress
        </button>
        <button
          type="button"
          className={`rounded-full border px-3 py-1 text-xs ${statusFilter === "completed" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          onClick={() => setStatusFilter("completed")}
        >
          Completed
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <BookOpen className="h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            {courses.length === 0
              ? "No courses available for your department yet."
              : "No courses match your filters."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {courses.length === 0
              ? "Check back later or contact your department."
              : "Try changing your search or filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((course) => (
            <Link key={course.id} href={`/student/courses/${course.id}`}>
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{course.name}</CardTitle>
                    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Level {Math.max(1, (course.resources?.length ?? 1))}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">By: {course.teacher?.name ?? "Unknown teacher"}</p>
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {course.description || "No description"}
                  </p>
                  <p className="mt-3 text-xs">Resources: {course.resources?.length ?? 0}</p>
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{progressMap[course.id] ?? 0}%</span>
                    </div>
                    <progress
                      className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                      value={progressMap[course.id] ?? 0}
                      max={100}
                    />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {lastViewedMap[course.id] ? `Last opened: ${new Date(lastViewedMap[course.id]).toLocaleString()}` : "Not opened yet"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* General AI Chatbot */}
      <AIChatbot />
    </div>
  );
}
