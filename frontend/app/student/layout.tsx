import type { ReactNode } from "react";
import { StudentTopBar } from "@/components/dashboard/student-topbar";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <StudentTopBar />
      <main className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</main>
    </div>
  );
}
