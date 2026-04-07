"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { ApiResponse, Department, Teacher } from "@/types";

export default function AssignDepartmentsPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tRes, dRes] = await Promise.all([
        api.get<ApiResponse<{ teachers: Teacher[] }>>("/admin/teachers"),
        api.get<ApiResponse<{ departments: Department[] }>>("/admin/departments"),
      ]);
      setTeachers(tRes.data.data.teachers ?? []);
      setDepartments(dRes.data.data.departments ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to load assignment data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const submit = async () => {
    if (!teacherId || selectedDepartments.length === 0) {
      toast.error("Please select teacher and at least one department");
      return;
    }

    try {
      setSubmitting(true);
      await api.post("/admin/assign-department", {
        teacher_id: Number(teacherId),
        department_ids: selectedDepartments,
      });
      toast.success("Departments assigned successfully");
      setSelectedDepartments([]);
      loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Assignment failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Assign Departments</h2>
      <Card>
        <CardHeader>
          <CardTitle>Teacher to Department Mapping</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
              >
                <option value="">Select Teacher</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
              <select
                multiple
                className="h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedDepartments.map(String)}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((option) => Number(option.value));
                  setSelectedDepartments(selected);
                }}
              >
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Assigning..." : "Assign Departments"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
