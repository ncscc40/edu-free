import Link from "next/link";

import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl p-6 md:p-10">
      <Breadcrumb items={[{ label: "Home" }]} />
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">College Learning Portal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose your role to continue quickly.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Admin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Manage teachers, departments, and mappings.
            </p>
            <div className="flex gap-2">
              <Link href="/login" className="w-full">
                <Button className="w-full">Admin Login</Button>
              </Link>
              <Link href="/register-admin" className="w-full">
                <Button variant="outline" className="w-full">
                  Register
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Teacher</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create courses, upload resources, and view stats.
            </p>
            <Link href="/login" className="block">
              <Button className="w-full">Teacher Login</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Student</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Register, access your department courses, and open resources.
            </p>
            <div className="flex gap-2">
              <Link href="/login" className="w-full">
                <Button className="w-full">Student Login</Button>
              </Link>
              <Link href="/register" className="w-full">
                <Button variant="outline" className="w-full">
                  Register
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
