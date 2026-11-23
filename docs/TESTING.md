# Testing

| Suite | Command | Needs |
| --- | --- | --- |
| Lint + types | `npm run lint && npm run typecheck` | — |
| Unit (33 tests) | `npm run test:unit` | — |
| Integration (18 tests) | `TEST_DATABASE_URL=postgresql://…/mdc_test npm run test:integration` | disposable Postgres DB (it is **truncated**) |
| End-to-end (13 tests) | `E2E_BASE_URL=http://localhost:3000 npx playwright test --trace off` | a running build against a demo-seeded DB |

CI (`.github/workflows/ci.yml`) runs all of them on every push/PR with Postgres service containers, plus a migration check (`migrate deploy` on an empty DB and `migrate diff --exit-code` against the schema) and `npm audit`.

## Coverage of the acceptance criteria

**Unit** — grading boundaries & decimals, score-limit validation, competition ranking, analytics insights (percentage *points* vs percent change, no fabricated trends, three-term improvement), timetable conflict detection (teacher/room/class, back-to-back allowed), bell-schedule validation, subject-selection rules (compulsory, elective limits, unavailable, duplicates, windows), payment allocation (oldest-due first, partial, overpayment credit, exact decimals), obligation status, password policy, magic-byte file sniffing, CSV formula injection, token hashing, rate limiting, email escaping, Lagos-time parsing.

**Integration** (real server actions with real authorisation against Postgres):
- Student registers → OTP verify (wrong code rejected; duplicate email rejected) → onboarding with photo → `PENDING_APPROVAL`; cannot register subjects or submit payments; finance officer cannot approve; admin approves once (second approval rejected); student ID format, enrollment, parent invitation and approval email created; student gains access.
- Subject registration: compulsory enforced, limits enforced, cannot register twice.
- Teacher self-registration grants nothing; approved-but-unassigned teacher sees zero students and cannot save scores.
- Students, teachers and parents cannot approve payments, publish results or suspend users.
- Suspension signs the user out and blocks login; repeated failures lock the account.
- Parent invitation only works for the invited verified email, is single-use; unlinked parent cannot select another child.
- Unpublished scores invisible to students; teachers cannot publish; published sheets locked; admin approval + publication makes results and a report card appear.
- Amendments: denied to finance officer, require a reason, are audited and version the report card.
- Payments: receipt changes no balances; approval requires confirmation; **three concurrent approvals → exactly one payment and one ledger entry**; allocation correct; confirmation email queued; rejection allows resubmission; duplicate bank reference, future dates and fake (non-PDF) receipts rejected.
- Attendance: only the class teacher takes the daily register; re-submission updates rather than duplicates; non-school days and future dates rejected.
- Files: report card accessible to the student, linked parent and results admin; denied to another student, unlinked parent, unassigned teacher, finance officer and anonymous users.
- Database constraints: single current term, non-negative scores, positive payments, unique enrollment per session.

**End-to-end (browser)** — full UI flow: register → verify → multi-step onboarding with photo → locked portal → admin approves in the UI → student registers subjects; student submits receipt → bursar cannot approve without ticking confirmation → approves → confirmation PDF downloads; student blocked from admin pages and exports (403); parent URL tampering; unassigned teacher 404 on a student profile; private file URLs 404 for anonymous/other users; QR verification (masked name, forged code rejected); health endpoint has no secrets; student/parent/admin dashboards on a phone viewport with no horizontal scroll and a working menu.

Additionally, during development every navigation page and one level of detail pages was crawled as each role (admin, finance officer, student, teacher, unassigned teacher, parent, unlinked parent, applicant — 115+ pages) with no server errors or client errors.

## Not covered automatically (manual before go-live)

Real email delivery through Resend (needs the verified domain), real R2 uploads/signed URLs (needs credentials), the backup workflow against real Neon/R2, the Render deploy hook, DNS/HTTPS, and visual review of PDFs on paper.
