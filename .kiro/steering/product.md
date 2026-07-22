# Product: Teacher Academic MIS

A web-based Management Information System for teachers at educational institutions.

## Core capabilities

- **Attendance** — mark, track, and report per-period attendance (present / absent / leave / N-A)
- **Timetable & Schedule** — view and manage weekly timetable, personal schedule
- **Roster** — student lists per section, bulk import
- **Marks & Analytics** — marks calculator, leaderboard, heatmaps, analytics dashboards
- **Syllabus tracking** — syllabus progress per section/subject
- **Quizzes** — create quizzes, share via token-based student access, optional AI generation
- **Assignments & Materials** — assignment creation, sharing, and material upload
- **Reports** — attendance reports, teaching history
- **Admin Console** — teacher approval, session creation, roster import, manage admins
- **Onboarding** — step-by-step onboarding wizard for new teachers

## Roles

| Role | Access |
|------|--------|
| Teacher | Full app (post-onboarding) |
| Admin | Admin Console (teacher approval, sessions, roster, admins) |
| Student | Public quiz access via token only |

## Deployment

Hosted on **Cloudflare Pages** with **Supabase** as the backend (Postgres database, Auth, RLS).
