"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { ApiResponse, Department } from "@/types";

const schema = z.object({
  name: z.string().min(2),
  uid: z.string().min(3),
  password: z.string().min(8),
  department: z.coerce.number().min(1),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await api.get<ApiResponse<{ departments: Department[] }>>("/admin/departments");
        setDepartments(response.data.data.departments ?? []);
      } catch {
        setDepartments([]);
      }
    };
    fetchDepartments();
  }, []);

  const onSubmit = async (values: FormValues) => {
    try {
      await api.post("/auth/register-student", values);
      toast.success("Student registered successfully. Please login.");
      router.push("/login");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Registration failed");
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Register" }]} />
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Student Register</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Input placeholder="Name" {...register("name")} />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div>
              <Input placeholder="UID" {...register("uid")} />
              {errors.uid && <p className="mt-1 text-xs text-red-500">{errors.uid.message}</p>}
            </div>
            <div>
              <Input type="password" placeholder="Password" {...register("password")} />
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>
            <div>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...register("department")}
                defaultValue=""
              >
                <option value="" disabled>
                  Select department
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {errors.department && <p className="mt-1 text-xs text-red-500">{errors.department.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Register"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </main>
  );
}
