"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Edit3, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { ApiResponse, Department, Teacher } from "@/types";

const schema = z.object({
  name: z.string().min(2),
});

type FormValues = z.infer<typeof schema>;

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Array<Department & { teachers?: Array<{ id: number; name: string }> }>>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [deleteDepartment, setDeleteDepartment] = useState<Department | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [assignDepartment, setAssignDepartment] = useState<Department | null>(null);
  const [teacherId, setTeacherId] = useState("");

  const availableTeachersForDepartment = useMemo(() => {
    if (!assignDepartment) return teachers;
    const selectedDepartment = departments.find((department) => department.id === assignDepartment.id);
    const assignedTeacherIds = new Set((selectedDepartment?.teachers ?? []).map((teacher) => teacher.id));
    return teachers.filter((teacher) => !assignedTeacherIds.has(teacher.id));
  }, [assignDepartment, departments, teachers]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const [depRes, teacherRes] = await Promise.all([
        api.get<ApiResponse<{ departments: Array<Department & { teachers?: Array<{ id: number; name: string }> }> }>>("/admin/departments"),
        api.get<ApiResponse<{ teachers: Teacher[] }>>("/admin/teachers"),
      ]);
      const response = depRes;
      setDepartments(response.data.data.departments ?? []);
      setTeachers(teacherRes.data.data.teachers ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to fetch departments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const onSubmit = async (values: FormValues) => {
    try {
      await api.post("/admin/create-department", values);
      toast.success("Department created");
      reset();
      fetchDepartments();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to create department");
    }
  };

  const onUpdateDepartment = async () => {
    if (!editingDepartment) return;
    try {
      await api.put(`/admin/department/${editingDepartment.id}`, { name: editingDepartment.name });
      toast.success("Department updated");
      setEditingDepartment(null);
      fetchDepartments();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to update department");
    }
  };

  const onDeleteDepartment = async () => {
    if (!deleteDepartment) return;
    if (deleteConfirm !== deleteDepartment.name) {
      toast.error("Type department name exactly to confirm delete");
      return;
    }
    try {
      await api.delete(`/admin/department/${deleteDepartment.id}`);
      toast.success("Department deleted");
      setDeleteDepartment(null);
      setDeleteConfirm("");
      fetchDepartments();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to delete department");
    }
  };

  const onAssignTeacher = async () => {
    if (!assignDepartment || !teacherId) {
      toast.error("Please select a teacher");
      return;
    }
    try {
      await api.post("/admin/assign-department", {
        teacher_id: Number(teacherId),
        department_ids: [assignDepartment.id],
      });
      toast.success("Teacher assigned to department");
      setAssignDepartment(null);
      setTeacherId("");
      fetchDepartments();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Assignment failed");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Departments</h2>

      <Card>
        <CardHeader>
          <CardTitle>Create Department</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex gap-3">
            <div className="w-full max-w-md">
              <Input placeholder="Department Name" {...register("name")} />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <Button disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Departments List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left">Department</th>
                    <th className="px-2 py-2 text-left">Assigned Teachers</th>
                    <th className="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((department) => (
                    <tr key={department.id} className="border-b">
                      <td className="px-2 py-2">{department.name}</td>
                      <td className="px-2 py-2">
                        {department.teachers?.length
                          ? department.teachers.map((teacher) => teacher.name).join(", ")
                          : "No teachers"}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setAssignDepartment(department)}>
                            <UserPlus className="mr-2 h-4 w-4" /> Assign Teacher
                          </Button>
                          <Button variant="outline" onClick={() => setEditingDepartment({ id: department.id, name: department.name })}>
                            <Edit3 className="mr-2 h-4 w-4" /> Edit
                          </Button>
                          <Button variant="outline" className="border-red-500/40 text-red-500 hover:bg-red-500/10" onClick={() => setDeleteDepartment({ id: department.id, name: department.name })}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(assignDepartment)} onOpenChange={(open) => !open && setAssignDepartment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Teacher</DialogTitle>
            <DialogDescription>Assign a teacher to department: {assignDepartment?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Teacher</label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select teacher" />
                </SelectTrigger>
                <SelectContent>
                  {availableTeachersForDepartment.map((teacher) => (
                    <SelectItem key={teacher.id} value={String(teacher.id)}>
                      {teacher.name} {teacher.email ? `(${teacher.email})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!availableTeachersForDepartment.length && (
              <p className="text-sm text-muted-foreground">All teachers are already assigned to this department.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignDepartment(null)}>Cancel</Button>
              <Button onClick={onAssignTeacher} disabled={!availableTeachersForDepartment.length}>Assign</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingDepartment)} onOpenChange={(open) => !open && setEditingDepartment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Department</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Department Name</label>
              <Input
                placeholder="Department name"
                value={editingDepartment?.name ?? ""}
                onChange={(e) => setEditingDepartment((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingDepartment(null)}>Cancel</Button>
              <Button onClick={onUpdateDepartment}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteDepartment)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDepartment(null);
            setDeleteConfirm("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-500">Delete Department</DialogTitle>
            <DialogDescription>
              This action is permanent. Type <span className="font-semibold">{deleteDepartment?.name}</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Confirm Department Name</label>
              <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="Type department name" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteDepartment(null)}>Cancel</Button>
              <Button className="bg-red-600 text-white hover:bg-red-700" onClick={onDeleteDepartment}>Delete Department</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
