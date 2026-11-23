# Architecture

## Overview

One full-stack **Next.js 15** application (App Router) deployed as a single Render web service. It contains all four portals, server actions (the mutation API), route handlers (files, PDFs, exports, health, cron) and the background-job endpoint. The code is modular so pieces can be split out later.

```
Browser ──HTTPS──► Render web service (Next.js)
                     ├─ app/(portals)        server-rendered pages, per-role guards
                     ├─ app/actions/*        server actions (all mutations, zod-validated, authorised)
                     ├─ app/api/*            files, PDFs, exports, health, cron
                     └─ src/lib/*            domain services (finance, results, access, jobs …)
                           │            │                 │
                       Neon Postgres  Cloudflare R2     Resend (HTTPS)
                       (Prisma)       (private bucket)  (email outbox worker)
GitHub Actions ── CI · deploy hook · scheduled jobs (POST /api/cron/jobs) · encrypted backups → R2
```

## Directory layout

| Path | Purpose |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/` | Database schema and versioned migrations (with extra SQL constraints) |
| `prisma/seed-demo.ts` | Demo data for development/tests only (guarded) |
| `scripts/` | `bootstrap.ts` (roles/permissions), `create-super-admin.ts`, `ops/` backup & restore |
| `src/app/admin`, `student`, `teacher`, `parent` | Portal pages; each `layout.tsx` enforces the role server-side |
| `src/app/(shared)` | Notifications, notice board, settings, help (role-aware shell) |
| `src/app/actions` | Server actions grouped by domain (`auth`, `application`, `student`, `teacher`, `parent`, `admin/*`) |
| `src/app/api` | Route handlers: `health`, `files/[id]`, `reports/[kind]`, PDFs, `cron/jobs` |
| `src/lib` | Domain logic: `auth/*`, `permissions`, `access`, `finance`, `results`, `grading`, `analytics`, `timetable`, `announcements`, `jobs`, `email/*`, `storage/*`, `pdf/*` |
| `src/components` | Design system (`ui/`), charts, portal shell, forms, shared views |
| `tests/` | `unit/`, `integration/` (server actions against a real DB), `e2e/` (Playwright) |

## Request flow and authorisation

1. `src/middleware.ts` only checks that a session cookie exists for portal routes (cheap redirect to `/login`).
2. Every page calls a guard (`requireAdminPage(permission)`, `requireStudentPage()` …) and every server action calls `authorizeAdmin(permission)` / `authorizeStudent()` …; route handlers call `getCurrentUser()` and check explicitly.
3. `getCurrentUser()` resolves the opaque session token (stored hashed) to the user, **their roles and permissions from the database**, and their approved profile. Nothing role-related is read from the client.
4. Data access is additionally scoped: teachers via `teacherCanAccessStudent` / `teacherOwnsOffering`, parents via `parentChildren` (verified relationships only), files via `canAccessFile`.

Server actions get Next.js's built-in CSRF protection (POST-only, Origin checked). Forms are progressively enhanced (`ActionForm`) and errors are converted to safe user-facing messages by `run()`.

## Administrator-first configuration

All of these live in the database and are edited in the admin portal: academic sessions & terms (current term is a DB-enforced singleton), class levels, sectors, class groups, classrooms, subjects, subject offerings (class × session, compulsory/elective), registration windows & elective limits, grading systems & boundaries, score allocation per session, fee categories & structures, bank details, bell schedule & school days, report-card template, announcement categories/audiences, role permissions, and every policy in **System Settings** (registration open/closed, ID prefixes, password & lockout policy, attendance thresholds, alert cooldowns, email quotas, storage warning, maintenance mode). Every portal reads these at request time.

The only things defined in code are *capabilities*: the permission catalogue (`src/lib/permissions.ts`), email layouts and the starter templates an admin can choose to load.

## Data model (entity mapping)

| Spec entity | Model(s) |
| --- | --- |
| Users, Roles, Permissions, UserRoles, Sessions | `User`, `Role` (+`RolePermission`), `Permission`, `UserRole`, `Session` |
| EmailVerifications, PasswordResets | `EmailVerification` (hashed OTP), `PasswordReset` (hashed token) |
| Students, Teachers, Parents | `Student`, `Teacher`, `Parent`, `AdminProfile` |
| StudentApplications, TeacherApplications | `StudentApplication`, `TeacherApplication`, `AdminNote` |
| ParentStudentRelationships | `ParentStudentRelationship` (status + method), `ParentInvitation`, `ParentLinkRequest` |
| AcademicSessions, Terms, Classes, AcademicSectors | `AcademicSession`, `Term`, `ClassLevel`, `AcademicSector`, `Class` |
| StudentEnrollments | `StudentEnrollment` — one per student per session; promotion adds rows, never overwrites |
| Subjects, SubjectOfferings, SubjectRegistrations | `Subject`, `SubjectOffering`, `SubjectRegistrationConfig`, `SubjectRegistration`, `SubjectRegistrationItem` |
| TeacherAssignments, ClassTeacherAssignments | `TeacherAssignment`, `ClassTeacherAssignment` |
| GradingSystems, GradeBoundaries, ScoreConfigurations | `GradingSystem`, `GradeBoundary`, `ScoreConfiguration` |
| Results, ResultDetails, ResultApprovals, ResultAmendments | `Result` (per student-term summary), `ScoreSubmission` (sheet), `ResultDetail`, `ResultApproval` (workflow log), `ResultAmendment` |
| AttendanceSessions, AttendanceRecords, AttendanceCorrections | same names; `AttendanceSession.key` prevents duplicate registers |
| FeeStructures, FeeCategories, StudentFeeObligations | same names |
| PaymentSubmissions, PaymentReceipts, Payments, PaymentAllocations | same names (`PaymentReceipt` = uploaded evidence; `Payment` = verified money only) |
| FinancialLedger, PaymentAdjustments | `FinancialLedger` (append-only debit/credit), `PaymentAdjustment` |
| Timetables, TimetablePeriods, Classrooms | `Timetable`, `TimetablePeriod`, `PeriodDefinition` (bell schedule), `Classroom` |
| Announcements, AnnouncementAudiences | `Announcement`, `AnnouncementAudience`, `AnnouncementRead` |
| Notifications, NotificationDeliveries | `Notification` (in-app), `NotificationDelivery` (email outbox) |
| ReportCards, ReportCardTemplates, DocumentVerifications | same names (report cards are versioned) |
| UploadedDocuments | `UploadedDocument` (metadata for every private R2 object) |
| AuditLogs, PermissionPolicies, AdministrativeActions | `AuditLog` (with `sensitive` flag); role/permission tables + `SchoolSettings` policies cover policy storage; high-privilege actions are audit entries with confirmation dialogs in the UI |
| — | `SchoolSettings` (singleton), `Counter` (atomic sequences), `AlertState` (alert cooldowns) |

### Integrity rules

Foreign keys everywhere; `onDelete: Restrict` on academic/financial history. Unique constraints prevent duplicates (enrollment per session, registration per enrollment, score row per sheet/student, attendance per register/student, payment transaction reference, fee structure per term/class/category …). Extra SQL in the initial migration:

- partial unique indexes: one current `AcademicSession`, one current `Term`;
- a bank reference can back at most one **approved** submission (case-insensitive);
- CHECK constraints: non-negative scores, positive payments/allocations, non-negative ledger amounts and fees.

Money uses `Decimal(14,2)`; scores `Decimal(5,2)`.

## Key workflows

- **Registration:** account → OTP verification → onboarding form (status `PENDING_APPROVAL`) → admin approves in one transaction (student number via atomic counter, enrollment, fee bills, `student` role, parent invitation, emails).
- **Results:** `ScoreSubmission` per offering × term snapshots CA/exam maximums. DRAFT/RETURNED are editable; SUBMITTED/APPROVED/PUBLISHED are locked. Publication recomputes `Result` summaries (average, competition-ranked position) from published details only, then generates report cards. Amendments go through `results.amend`, record old/new values and reason, recompute, and create a new report-card version.
- **Payments:** a submission is evidence only. Approval runs in a **serializable** transaction that first flips `PENDING → APPROVED` with a conditional update (so concurrent approvals cannot double-post), creates the `Payment`, ledger credit and allocations (submitted term first, then oldest due), and queues notifications in the same transaction. Overpayment remains as credit. `Payment.method`/`gatewayProvider` exist so a Paystack/Flutterwave webhook can create verified payments through the same allocation code later.
- **Email:** writes go to the `NotificationDelivery` outbox inside the business transaction; a worker sends via Resend after the response (`after()`), and the scheduled job retries with exponential backoff. The last 20% of the daily quota is reserved for CRITICAL (security) and HIGH (financial/approval) mail; the rest is deferred, never dropped.
- **Background jobs:** `POST /api/cron/jobs` (Bearer `CRON_SECRET`) publishes scheduled announcements, archives expired ones, runs attendance alerts and fee reminders (with `AlertState` cooldowns), checks storage usage and drains the email outbox. GitHub Actions calls it three times a day.

## Mutation API (server actions)

| Module | Actions |
| --- | --- |
| `actions/auth.ts` | register (student/teacher/parent), verifyEmail, resendVerification, login, logout, requestPasswordReset, resetPassword, changePassword, signOutOtherSessions |
| `actions/application.ts` | submitStudentApplication, submitTeacherApplication |
| `actions/student.ts` | updateMyProfile, submitSubjectRegistration, submitPayment |
| `actions/teacher.ts` | saveAttendance, requestAttendanceCorrection, saveScoreSheet (save/submit, bulk), saveClassTeacherRemark |
| `actions/parent.ts` | acceptInvitation, requestChildLink |
| `actions/user.ts` | markNotificationsRead, markAnnouncementRead |
| `actions/admin/people.ts` | approve/decide student & teacher applications, notes, manual student registration, update record, change class, suspend/activate, invitations, promotion, subject/class-teacher assignment, link requests, verify/revoke relationships |
| `actions/admin/academics.ts` | sessions, terms, current term, archive, levels, sectors, classes, classrooms, subjects, offerings, copy offerings, registration windows, registration review, grading systems, score allocation, bell schedule |
| `actions/admin/results.ts` | review (approve/return), publish, amend, remarks, bulk remarks, regenerate report cards, template |
| `actions/admin/finance.ts` | fee categories/structures, re-price, sync bills, bank details, approve/reject payments, adjustments |
| `actions/admin/operations.ts` | timetables (create, slots, publish, archive), announcements, targeted messages, attendance corrections |
| `actions/admin/system.ts` | school info/logo, policies, roles, administrators, admin roles, email retry/outbox |

## Route handlers

| Route | Purpose | Access |
| --- | --- | --- |
| `GET /api/health` | readiness (DB ping, which integrations are configured — no secrets) | public |
| `GET /api/files/:id` | the only file download path; re-authorises then 302 to a 5-minute signed R2 URL | per-file rules |
| `GET /api/reports/:kind?format=csv\|xlsx\|pdf` | administrative exports (formula-injection safe) | admin + report permission |
| `GET /api/timetables/:id/pdf` | timetable PDF | admin, class members, verified parents, teachers on it |
| `GET /api/payments/:id/confirmation` | official confirmation PDF (verified payments only) | owner, verified parent, finance |
| `GET /api/me/subjects`, `GET /api/me/teacher-timetable` | personal PDFs | signed-in student / teacher |
| `POST /api/cron/jobs` | background jobs | `Authorization: Bearer CRON_SECRET` |
| `/verify/:code` (page) | public report-card verification, masked name, rate limited | public |

## File storage

Private R2 bucket, object prefixes `students/ teachers/ payments/ results/ report-cards/ announcements/ school-documents/ database-backups/`. Uploads are received by the server (max 2–10 MB by purpose), type-checked by **magic bytes** (never the browser MIME), photos re-encoded with sharp (EXIF/GPS stripped, resized), de-duplicated by SHA-256, and recorded in `UploadedDocument`. Downloads always pass `canAccessFile`. School files are soft-deleted only. Server-side upload (rather than browser-direct presigned PUT) is deliberate: it lets the server validate content before anything is stored; presigned URLs are used for downloads.
