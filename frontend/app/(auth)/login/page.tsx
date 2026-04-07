"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getRoleRedirect } from "@/lib/auth";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { ApiResponse, User } from "@/types";

const schema = z.object({
  identifier: z.string().min(1, "UID or email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const body = values.identifier.includes("@")
        ? { email: values.identifier, password: values.password }
        : { uid: values.identifier, password: values.password };

      const response = await api.post<ApiResponse<{ access_token: string; refresh_token: string; user: User }>>(
        "/auth/login",
        body
      );

      const payload = response.data.data;
      setSession({
        user: payload.user,
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
      });

      toast.success("Login successful");
      router.push(getRoleRedirect(payload.user.role));
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Login failed");
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Login" }]} />
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Input placeholder="UID or Email" {...register("identifier")} />
              {errors.identifier && <p className="mt-1 text-xs text-red-500">{errors.identifier.message}</p>}
            </div>
            <div>
              <Input type="password" placeholder="Password" {...register("password")} />
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </main>
  );
}
