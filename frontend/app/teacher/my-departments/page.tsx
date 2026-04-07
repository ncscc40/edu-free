"use client";

import { Building2, FileText, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { StatsCard } from "@/components/dashboard/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { ApiResponse, Department } from "@/types";

interface StatsPayload {
  total_students: number;
  total_courses: number;
  total_files: number;
}

export default function TeacherMyDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [departmentRes, statsRes] = await Promise.all([
          api.get<ApiResponse<{ departments: Department[] }>>("/teacher/my-departments"),
          api.get<ApiResponse<StatsPayload>>("/teacher/stats"),
        ]);

        setDepartments(departmentRes.data.data.departments ?? []);
        setStats(statsRes.data.data);
      } catch (error: any) {
        toast.error(error?.response?.data?.message ?? "Failed to load overview");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading || !stats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const chartData = [
    { label: "Students", value: stats.total_students },
    { label: "Courses", value: stats.total_courses },
    { label: "Files", value: stats.total_files },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">My Departments & Stats</h2>
        <p className="text-sm text-muted-foreground">Single view for your assigned departments and teaching performance.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard title="Total Students" value={stats.total_students} />
        <StatsCard title="Total Courses" value={stats.total_courses} />
        <StatsCard title="Total Files" value={stats.total_files} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Assigned Departments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {departments.length ? (
            <ul className="space-y-2">
              {departments.map((department) => (
                <li key={department.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span>{department.name}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Active</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No assigned departments.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Performance Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Quick Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use this page as your teaching control center. Create courses from the sidebar and track growth here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
