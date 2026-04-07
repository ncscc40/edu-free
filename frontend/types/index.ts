export type Role = "admin" | "teacher" | "student";

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface User {
  id: number;
  name: string;
  uid?: string | null;
  email?: string | null;
  role: Role;
  department_id?: number | null;
}

export interface Department {
  id: number;
  name: string;
}

export interface Teacher {
  id: number;
  name: string;
  email?: string | null;
  departments: Department[];
}

export interface ResourceItem {
  id: number;
  type: "file" | "link";
  title: string;
  url_or_path: string;
  notes?: string | null;
  comments?: ResourceComment[];
}

export interface ResourceComment {
  id: number;
  resource_id: number;
  parent_id?: number | null;
  content: string;
  is_deleted?: boolean;
  created_at: string;
  user: {
    id: number;
    name: string;
    role: Role;
  };
  replies: ResourceComment[];
}

export interface Course {
  id: number;
  name: string;
  description?: string;
  department_id?: number;
  department?: {
    id: number;
    name: string;
  };
  teacher?: {
    id: number;
    name: string;
  };
  resources?: ResourceItem[];
  created_at?: string;
}

export interface AppNotification {
  id: number;
  type: "comment" | "reply" | "upload";
  message: string;
  link: string;
  course_id: number | null;
  resource_id: number | null;
  is_read: boolean;
  created_at: string;
}
