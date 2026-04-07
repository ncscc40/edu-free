import type { ReactNode } from "react";
import { RoleShell } from "@/components/dashboard/role-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RoleShell role="admin">{children}</RoleShell>;
}
