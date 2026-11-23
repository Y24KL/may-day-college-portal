# May Day College — Student & School Management Portal

A full-stack school management platform for **May Day College, Lagos** (SSS1–SSS3) with four connected portals — **Student**, **Subject Teacher**, **Parent/Guardian** and **Administrator** — sharing one PostgreSQL database, one authentication system and one glassmorphism design system.

The administrator portal is the foundation: sessions, terms, classes, sectors, subjects, grading, fees, bank details, timetables and policies are all configured there. **Nothing school-specific is hard-coded.**

> **Status:** application code, tests, CI/CD workflows and deployment configuration are complete in this repository. Production accounts (Render, Neon, Cloudflare R2, Resend, domain DNS) still have to be created and connected — see [Deployment](docs/DEPLOYMENT.md) and the [go-live checklist](docs/DEPLOYMENT.md#go-live-checklist). Nothing has been deployed yet.

## Features

| Area | Highlights |
| --- | --- |
| Accounts | Email + password, 6-digit email OTP, password reset, lockout, session revocation, rate limiting |
| Approval-first registration | Students and teachers self-register; **nothing protected unlocks until an administrator approves**. Choosing a role grants nothing |
| Parents | Independent accounts; children linked only via an emailed invitation to the guardian address **and** a matching verified email, or administrator verification |
| Administration | Granular roles (Super Admin, School Admin, Academic, Finance, Results officers + custom), every sensitive action audited |
| Academics | Sessions/terms (one current, DB-enforced), classes × sectors, subjects, compulsory/elective offerings, registration windows & elective limits |
| Results | Teacher entry (single + bulk paste) → submit → review/return → approve → publish → locked; audited amendments; positions; insights |
| Report cards | Server-generated PDFs from **published** results only, versioned, unique reference + QR verification page |
| Attendance | Daily registers (class teacher) and lesson attendance kept separately, edit window, correction requests, alerts |
| Fees | Fee structures per class/term/category, bank-transfer submissions with receipts, **verification against the bank statement**, serializable transactional approval, allocation, ledger, partial/over-payments, waivers/refunds |
| Timetables | Bell schedule, per-class timetables, teacher/class/room conflict detection that blocks publication, PDFs |
| Communication | Targeted announcements (scheduling, pinning, expiry, attachments, read tracking), in-app notification centre, branded email outbox with priorities, retries and quota protection |
| Reports | Live CSV / Excel / PDF exports for enrollment, assignments, registrations, performance, attendance, fees, collections |

## Tech stack

Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS · Framer Motion · Recharts · Lucide · PostgreSQL · Prisma 6 · pdf-lib · Resend (HTTPS API) · Cloudflare R2 (S3 API) · Vitest · Playwright · GitHub Actions · Render.

## Quick start (local development)

Requirements: Node 22, PostgreSQL 16+.

```bash
cp .env.example .env              # then edit DATABASE_URL / DIRECT_DATABASE_URL
npm install
npx prisma migrate dev            # create the schema
npm run db:bootstrap              # roles, permissions, settings (no school data)
npm run dev
```

Create the first Super Administrator either at `http://localhost:3000/setup` (requires `SETUP_TOKEN` in `.env`) or from the shell:

```bash
SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_NAME="Your Name" SUPER_ADMIN_PASSWORD='a-strong-password' npm run setup:admin
```

Optional **demo data** for a local/disposable database only (refuses to run against non-local databases):

```bash
npm run db:seed:demo   # all demo accounts use the password DemoPass2026!
```

Without R2/Resend credentials in development, files go to a private local `.storage/` folder and emails are printed to the server console.

## Testing

```bash
npm run lint && npm run typecheck
npm run test:unit
TEST_DATABASE_URL=postgresql://…/mdc_test npm run test:integration   # disposable DB — it is truncated
E2E_BASE_URL=http://localhost:3000 npx playwright test --trace off    # against a demo-seeded server
```

See [docs/TESTING.md](docs/TESTING.md) for what each suite covers (approval gating, role escalation, parent isolation, file privacy, concurrent payment approval, result locking, DB constraints, responsive layout).

## Documentation

- [Architecture & data model](docs/ARCHITECTURE.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Deployment (GitHub → Render, Neon, R2, Resend, domain)](docs/DEPLOYMENT.md)
- [Backups & disaster recovery](docs/BACKUP_AND_RECOVERY.md)
- [Administrator operating guide](docs/ADMIN_GUIDE.md)
- [Security](docs/SECURITY.md)
- [Free-tier limits, monitoring & upgrade policy](docs/FREE_TIER.md)
- [Testing](docs/TESTING.md)

## Repository rules

- **Never commit** `.env` files, credentials, student/parent data, receipts, database dumps or backups. `.gitignore` blocks the common cases; GitHub holds source code only.
- Work on `development` (or feature branches); `main` is production. Render deploys only after CI passes on `main`.
