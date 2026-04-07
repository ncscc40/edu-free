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
import type { ApiResponse, Teacher } from "@/types";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(8),
});

type FormValues = z.infer<typeof schema>;

type SortBy = "name" | "email";

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [deleteTeacher, setDeleteTeacher] = useState<Teacher | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const fetchTeachers = async () => {
    try {
      setLoading(true);
      const response = await api.get<ApiResponse<{ teachers: Teacher[] }>>("/admin/teachers");
      setTeachers(response.data.data.teachers ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to fetch teachers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const onSubmit = async (values: FormValues) => {
    try {
      await api.post("/admin/create-teacher", {
        name: values.name,
        email: values.email || null,
        password: values.password,
      });
      toast.success("Teacher created");
      reset();
      fetchTeachers();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to create teacher");
    }
  };

  const onUpdateTeacher = async () => {
    if (!editingTeacher) return;
    try {
      await api.put(`/admin/teacher/${editingTeacher.id}`, {
        name: editingTeacher.name,
        email: editingTeacher.email || null,
      });
      toast.success("Teacher updated");
      setEditingTeacher(null);
      fetchTeachers();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to update teacher");
    }
  };

  const onDeleteTeacher = async () => {
    if (!deleteTeacher) return;
    if (deleteConfirm !== deleteTeacher.name) {
      toast.error("Type teacher name exactly to confirm delete");
      return;
    }

    try {
      await api.delete(`/admin/teacher/${deleteTeacher.id}`);
      toast.success("Teacher deleted");
      setDeleteTeacher(null);
      setDeleteConfirm("");
      fetchTeachers();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to delete teacher");
    }
  };

  const sorted = useMemo(() => {
    return [...teachers].sort((a, b) => {
      const av = (a[sortBy] || "").toLowerCase();
      const bv = (b[sortBy] || "").toLowerCase();
      return av.localeCompare(bv);
    });
  }, [teachers, sortBy]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Teachers</h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Create Teacher</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 md:grid-cols-3">
            <div>
              <Input placeholder="Name" {...register("name")} />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div>
              <Input placeholder="Email (optional)" {...register("email")} />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div>
              <Input type="password" placeholder="Password" {...register("password")} />
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>
            <Button disabled={isSubmitting} className="md:col-span-3 md:w-fit">
              {isSubmitting ? "Creating..." : "Create Teacher"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Teachers List</CardTitle>
          <div className="w-48">
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
              <SelectTrigger>
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort by Name</SelectItem>
                <SelectItem value="email">Sort by Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-left">Email</th>
                    <th className="px-2 py-2 text-left">Departments</th>
                    <th className="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((teacher) => (
                    <tr key={teacher.id} className="border-b">
                      <td className="px-2 py-2">{teacher.name}</td>
                      <td className="px-2 py-2">{teacher.email || "—"}</td>
                      <td className="px-2 py-2">
                        {teacher.departments?.length
                          ? teacher.departments.map((d) => d.name).join(", ")
                          : "Not assigned"}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setEditingTeacher(teacher)}>
                            <Edit3 className="mr-2 h-4 w-4" /> Edit
                          </Button>
                          <Button variant="outline" className="border-red-500/40 text-red-500 hover:bg-red-500/10" onClick={() => setDeleteTeacher(teacher)}>
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

      <Dialog open={Boolean(editingTeacher)} onOpenChange={(open) => !open && setEditingTeacher(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Teacher</DialogTitle>
            <DialogDescription>Update teacher profile details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Teacher Name</label>
              <Input
                placeholder="Teacher Name"
                value={editingTeacher?.name ?? ""}
                onChange={(e) => setEditingTeacher((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <Input
                placeholder="Email"
                value={editingTeacher?.email ?? ""}
                onChange={(e) => setEditingTeacher((prev) => (prev ? { ...prev, email: e.target.value } : prev))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingTeacher(null)}>Cancel</Button>
              <Button onClick={onUpdateTeacher}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTeacher)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTeacher(null);
            setDeleteConfirm("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-500">Delete Teacher</DialogTitle>
            <DialogDescription>
              This action is permanent. Type <span className="font-semibold">{deleteTeacher?.name}</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Confirm Teacher Name</label>
              <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="Type teacher name" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTeacher(null)}>Cancel</Button>
              <Button className="bg-red-600 text-white hover:bg-red-700" onClick={onDeleteTeacher}>Delete Teacher</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
