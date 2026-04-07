"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { ApiResponse, Course } from "@/types";

const resourceSchema = z.object({
  course_id: z.string().min(1, "Course is required"),
});

type ResourceForm = z.infer<typeof resourceSchema>;

interface LinkRow {
  id: number;
  title: string;
  url: string;
  notes: string;
}

interface FileRow {
  id: number;
  title: string;
  file: File | null;
  notes: string;
}

export default function TeacherCreateCoursePage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([{ id: 1, title: "", url: "", notes: "" }]);
  const [files, setFiles] = useState<FileRow[]>([{ id: 1, title: "", file: null, notes: "" }]);

  const resourceForm = useForm<ResourceForm>({
    resolver: zodResolver(resourceSchema),
  });

  const fetchCourses = async () => {
    try {
      const response = await api.get<ApiResponse<{ courses: Course[] }>>("/teacher/my-courses");
      setCourses(response.data.data.courses ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Unable to fetch courses");
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const submitResource = async (values: ResourceForm) => {
    try {
      const linkItems = links.filter((item) => item.title.trim() && item.url.trim());
      const fileItems = files.filter((item) => item.title.trim() && item.file);

      if (!linkItems.length && !fileItems.length) {
        toast.error("Add at least one link or file");
        return;
      }

      for (const item of linkItems) {
        const formData = new FormData();
        formData.append("course_id", values.course_id);
        formData.append("title", item.title);
        formData.append("type", "link");
        formData.append("url", item.url);
        formData.append("notes", item.notes);
        await api.post("/teacher/upload-resource", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      for (const item of fileItems) {
        const formData = new FormData();
        formData.append("course_id", values.course_id);
        formData.append("title", item.title);
        formData.append("type", "file");
        formData.append("file", item.file as Blob);
        formData.append("notes", item.notes);
        await api.post("/teacher/upload-resource", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      toast.success("Resources uploaded successfully");
      resourceForm.reset();
      setLinks([{ id: Date.now(), title: "", url: "", notes: "" }]);
      setFiles([{ id: Date.now() + 1, title: "", file: null, notes: "" }]);
      fetchCourses();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Resource upload failed");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Upload Resources</h2>

      <Card>
        <CardHeader>
          <CardTitle>Upload Links & Files</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={resourceForm.handleSubmit(submitResource)} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Course</label>
              <Select
                value={resourceForm.watch("course_id") || ""}
                onValueChange={(value) => resourceForm.setValue("course_id", value, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={String(course.id)}>
                      {course.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Links (YouTube links included)</p>
              {links.map((item, index) => (
                <div key={item.id} className="grid gap-2 md:grid-cols-4">
                  <Input
                    placeholder="Title"
                    value={item.title}
                    onChange={(e) => {
                      const next = [...links];
                      next[index] = { ...item, title: e.target.value };
                      setLinks(next);
                    }}
                  />
                  <Input
                    placeholder="https://..."
                    value={item.url}
                    onChange={(e) => {
                      const next = [...links];
                      next[index] = { ...item, url: e.target.value };
                      setLinks(next);
                    }}
                  />
                  <Input
                    placeholder="Optional note"
                    value={item.notes}
                    onChange={(e) => {
                      const next = [...links];
                      next[index] = { ...item, notes: e.target.value };
                      setLinks(next);
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
                      disabled={links.length === 1}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setLinks((prev) => [...prev, { id: Date.now(), title: "", url: "", notes: "" }])}
              >
                Add Link
              </Button>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Files</p>
              <p className="text-xs text-muted-foreground">
                Supported: PDF, Word, PPT, Excel, text, markdown, JSON/XML/YAML, logs, archives, images, and videos.
              </p>
              {files.map((item, index) => (
                <div key={item.id} className="grid gap-2 md:grid-cols-4">
                  <Input
                    placeholder="File title"
                    value={item.title}
                    onChange={(e) => {
                      const next = [...files];
                      next[index] = { ...item, title: e.target.value };
                      setFiles(next);
                    }}
                  />
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.pps,.ppsx,.xls,.xlsx,.csv,.txt,.rtf,.md,.json,.xml,.yaml,.yml,.log,.zip,.rar,.7z,.png,.jpg,.jpeg,.mp4,.webm,.mov,.m4v"
                    onChange={(e) => {
                      const next = [...files];
                      next[index] = { ...item, file: e.target.files?.[0] ?? null };
                      setFiles(next);
                    }}
                  />
                  <Input
                    placeholder="Optional note"
                    value={item.notes}
                    onChange={(e) => {
                      const next = [...files];
                      next[index] = { ...item, notes: e.target.value };
                      setFiles(next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    disabled={files.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setFiles((prev) => [...prev, { id: Date.now() + 1, title: "", file: null, notes: "" }])}
              >
                Add File
              </Button>
            </div>

            <Button type="submit" disabled={resourceForm.formState.isSubmitting}>
              {resourceForm.formState.isSubmitting ? "Uploading..." : "Upload All Resources"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
