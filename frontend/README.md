# College Frontend (Next.js 14)

Production-grade App Router frontend for the Flask REST backend.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Zustand + Axios + JWT flow
- React Hook Form + Zod
- Recharts + Sonner + Lucide icons
- Role-protected routes using middleware

## Structure

```text
frontend/
├── app/
│   ├── (auth)/login
│   ├── (auth)/register
│   ├── admin/
│   ├── teacher/
│   ├── student/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/
│   └── dashboard/
├── lib/
├── store/
├── hooks/
├── types/
├── middleware.ts
└── .env.example
```

## Setup

```bash
npm install
copy .env.example .env.local
npm run dev
```

## Env

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api
```

## Auth Flow

- Login calls `/auth/login`
- Access + refresh token stored in cookies
- Axios auto-attaches access token
- On `401`, interceptor calls `/auth/refresh`
- Middleware protects `/admin`, `/teacher`, `/student`

## Role Dashboards

- Admin: teachers, departments, assign departments
- Teacher: departments, create course, upload resources, stats + chart
- Student: register/login, courses, course details/resources
