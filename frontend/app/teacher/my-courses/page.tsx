"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, PlusCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentSection } from "@/components/comments/comment-section";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { ApiResponse, Course, Department, ResourceComment, ResourceItem } from "@/types";

interface EditableCourse {
  id: number;
  name: string;
  description: string;
  department_id: number;
}

interface EditableResource {
  id: number;
  title: string;
  url_or_path: string;
  type: "file" | "link";
  notes?: string | null;
}

function TeacherMyCoursesContent() {
  const searchParams = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [newCourseDepartmentId, setNewCourseDepartmentId] = useState("");
  const [editing, setEditing] = useState<EditableCourse | null>(null);
  const [expandedCourseId, setExpandedCourseId] = useState<number | null>(null);
  const [editingResource, setEditingResource] = useState<EditableResource | null>(null);
  const [commentsResource, setCommentsResource] = useState<ResourceItem | null>(null);
  const [comments, setComments] = useState<ResourceComment[]>([]);
  const user = useAuthStore((s) => s.user);
  const highlightHandled = useRef(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [coursesRes, departmentsRes] = await Promise.all([
        api.get<ApiResponse<{ courses: Course[] }>>("/teacher/my-courses"),
        api.get<ApiResponse<{ departments: Department[] }>>("/teacher/my-departments"),
      ]);
      setCourses(coursesRes.data.data.courses ?? []);
      setDepartments(departmentsRes.data.data.departments ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to load courses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onDelete = async (courseId: number) => {
    try {
      await api.delete(`/teacher/course/${courseId}`);
      toast.success("Course deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to delete course");
    }
  };

  const onCreateCourse = async () => {
    if (!newCourseName.trim() || !newCourseDepartmentId) {
      toast.error("Course name and department are required");
      return;
    }

    try {
      await api.post("/teacher/create-course", {
        name: newCourseName,
        description: newCourseDescription,
        department_id: Number(newCourseDepartmentId),
      });
      toast.success("Course created successfully");
      setShowCreateDialog(false);
      setNewCourseName("");
      setNewCourseDescription("");
      setNewCourseDepartmentId("");
      loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to create course");
    }
  };

  const onEdit = (course: Course) => {
    setEditing({
      id: course.id,
      name: course.name,
      description: course.description ?? "",
      department_id: course.department?.id ?? course.department_id ?? 0,
    });
  };

  const onUpdate = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.department_id) {
      toast.error("Name and department are required");
      return;
    }

    try {
      await api.put(`/teacher/course/${editing.id}`, {
        name: editing.name,
        description: editing.description,
        department_id: editing.department_id,
      });
      toast.success("Course updated successfully");
      setEditing(null);
      loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to update course");
    }
  };

  const onResourceEdit = (resource: ResourceItem) => {
    setEditingResource({
      id: resource.id,
      title: resource.title,
      url_or_path: resource.url_or_path,
      type: resource.type,
      notes: resource.notes,
    });
  };

  const onResourceUpdate = async () => {
    if (!editingResource) return;

    if (!editingResource.title.trim()) {
      toast.error("Resource title is required");
      return;
    }

    try {
      await api.put(`/teacher/resource/${editingResource.id}`, {
        title: editingResource.title,
        ...(editingResource.type === "link" ? { url_or_path: editingResource.url_or_path } : {}),
        notes: editingResource.notes ?? "",
      });
      toast.success("Resource updated successfully");
      setEditingResource(null);
      loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to update resource");
    }
  };

  const onResourceDelete = async (resourceId: number) => {
    try {
      await api.delete(`/teacher/resource/${resourceId}`);
      toast.success("Resource deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to delete resource");
    }
  };

  const loadComments = useCallback(async (resource: ResourceItem) => {
    try {
      setCommentsResource(resource);
      const response = await api.get<ApiResponse<{ comments: ResourceComment[] }>>(`/teacher/resource/${resource.id}/comments`);
      setComments(response.data.data.comments ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to load comments");
    }
  }, []);

  const postComment = async (resourceId: number, content: string, parentId?: number) => {
    const clean = content.trim();
    if (!clean) {
      toast.error("Comment cannot be empty");
      return;
    }

    try {
      await api.post(`/teacher/resource/${resourceId}/comments`, {
        content: clean,
        ...(parentId ? { parent_id: parentId } : {}),
      });
      const response = await api.get<ApiResponse<{ comments: ResourceComment[] }>>(`/teacher/resource/${resourceId}/comments`);
      setComments(response.data.data.comments ?? []);
      toast.success(parentId ? "Reply added" : "Comment added");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to post comment");
    }
  };

  const deleteComment = async (resourceId: number, commentId: number) => {
    try {
      await api.delete(`/teacher/resource/${resourceId}/comments/${commentId}`);
      const response = await api.get<ApiResponse<{ comments: ResourceComment[] }>>(`/teacher/resource/${resourceId}/comments`);
      setComments(response.data.data.comments ?? []);
      toast.success("Comment deleted");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Failed to delete comment");
    }
  };

  /* Auto-open comments when navigating from a notification */
  useEffect(() => {
    if (!courses.length || highlightHandled.current) return;
    const highlight = searchParams.get("highlight");
    if (!highlight) return;
    const match = highlight.match(/^resource-(\d+)$/);
    if (!match) return;
    const resourceId = Number(match[1]);
    for (const course of courses) {
      const resource = (course.resources ?? []).find((r) => r.id === resourceId);
      if (resource) {
        highlightHandled.current = true;
        setExpandedCourseId(course.id);
        loadComments(resource);
        break;
      }
    }
  }, [courses, searchParams, loadComments]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">My Courses</h2>
        <Button onClick={() => setShowCreateDialog(true)}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Course
        </Button>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Course</DialogTitle>
            <DialogDescription>Create a new course from this page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Course Name</label>
              <Input value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} placeholder="Course Name" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Department</label>
              <Select value={newCourseDepartmentId} onValueChange={setNewCourseDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={String(department.id)}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={newCourseDescription}
                onChange={(e) => setNewCourseDescription(e.target.value)}
                placeholder="Description"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button onClick={onCreateCourse}>Create Course</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Course</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Course Name"
            />
            <Input
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Description"
            />
            <Select
              value={String(editing.department_id)}
              onValueChange={(value) => setEditing({ ...editing, department_id: Number(value) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={String(department.id)}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button onClick={onUpdate}>Save</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editingResource && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Resource</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input
              value={editingResource.title}
              onChange={(e) => setEditingResource({ ...editingResource, title: e.target.value })}
              placeholder="Resource Title"
            />
            {editingResource.type === "link" ? (
              <Input
                value={editingResource.url_or_path}
                onChange={(e) => setEditingResource({ ...editingResource, url_or_path: e.target.value })}
                placeholder="https://..."
              />
            ) : (
              <p className="text-xs text-muted-foreground">File URL/path editing is disabled for security.</p>
            )}
            <Input
              value={editingResource.notes ?? ""}
              onChange={(e) => setEditingResource({ ...editingResource, notes: e.target.value })}
              placeholder="Optional note"
            />
            <div className="flex gap-2">
              <Button onClick={onResourceUpdate}>Save Resource</Button>
              <Button variant="outline" onClick={() => setEditingResource(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {courses.length ? (
          courses.map((course) => (
            <Card key={course.id}>
              <CardHeader>
                <CardTitle>{course.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{course.description || "No description"}</p>
                <p className="text-xs text-muted-foreground">
                  Department: {course.department?.name ?? "N/A"} • Resources: {course.resources?.length ?? 0}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setExpandedCourseId((prev) => (prev === course.id ? null : course.id))
                    }
                  >
                    {expandedCourseId === course.id ? (
                      <>
                        Hide Resources <ChevronUp className="ml-1 h-4 w-4" />
                      </>
                    ) : (
                      <>
                        View Resources <ChevronDown className="ml-1 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={() => onEdit(course)}>
                    Edit
                  </Button>
                  <Button onClick={() => onDelete(course.id)}>Delete</Button>
                </div>

                {expandedCourseId === course.id && (
                  <div className="mt-2 space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">Resources</p>
                    {course.resources?.length ? (
                      course.resources.map((resource) => (
                        <div key={resource.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                          <div>
                            <p className="text-sm font-medium">{resource.title}</p>
                            <p className="text-xs text-muted-foreground">{resource.type} • {resource.url_or_path}</p>
                            {resource.notes ? <p className="mt-1 text-xs text-muted-foreground">Note: {resource.notes}</p> : null}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => loadComments(resource)}>
                              Comments
                            </Button>
                            <Button variant="outline" onClick={() => onResourceEdit(resource)}>
                              Edit Resource
                            </Button>
                            <Button onClick={() => onResourceDelete(resource.id)}>Delete Resource</Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No resources available.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">No courses found. Use Add Course to create your first course.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={Boolean(commentsResource)} onOpenChange={(open) => !open && setCommentsResource(null)}>
        <DialogContent className="flex h-[90vh] max-w-2xl flex-col" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Comments &bull; {commentsResource?.title}</DialogTitle>
          </DialogHeader>

          <CommentSection
            comments={comments}
            currentUserId={user?.id ?? null}
            canDeleteAny
            onPost={(content) => commentsResource && postComment(commentsResource.id, content)}
            onReply={(parentId, content) => commentsResource && postComment(commentsResource.id, content, parentId)}
            onDelete={(commentId) => commentsResource && deleteComment(commentsResource.id, commentId)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TeacherMyCoursesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      }
    >
      <TeacherMyCoursesContent />
    </Suspense>
  );
}
