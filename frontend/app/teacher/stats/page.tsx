"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { StatsCard } from "@/components/dashboard/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { ApiResponse } from "@/types";

interface StatsPayload {
  total_students: number;
  total_courses: number;
  total_files: number;
}

export default function TeacherStatsPage() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get<ApiResponse<StatsPayload>>("/teacher/stats");
        setStats(response.data.data);
      } catch (error: any) {
        toast.error(error?.response?.data?.message ?? "Failed to fetch stats");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading || !stats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const chartData = [
    { name: "Students", value: stats.total_students },
    { name: "Courses", value: stats.total_courses },
    { name: "Files", value: stats.total_files },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Stats</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard title="Total Students" value={stats.total_students} />
        <StatsCard title="Total Courses" value={stats.total_courses} />
        <StatsCard title="Total Files" value={stats.total_files} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Department Impact</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
