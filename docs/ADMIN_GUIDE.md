# Administrator operating guide

The administrator portal controls everything the other portals show. Menu items appear only if your role has the permission; the server enforces the same rules.

## 1. Setting up a new school year

1. **Academic Sessions** → *New session* (e.g. `2026/2027`, dates). Tick "create three terms", then edit each term's dates, exam period, result publication date and next-term resumption date.
2. Click **Set current** on the term in progress. Only one term/session can be current; every portal follows it.
3. **Class Management** → confirm levels (SSS1–3), sectors (Science/Commercial/Arts) and class groups. Deactivate unused classes; add arms (A/B) if needed. Assign **class teachers** per class.
4. **Subject Management** → create subjects, then *Offer subject to classes* (compulsory or elective) for the session. *Copy from session* reuses last year's curriculum.
5. **Grading** → create or load the A1–F9 starter and adjust boundaries; set **score allocation** (CA + Exam = 100) for the session. Teachers cannot enter scores until this is set. Once scores exist, the allocation for that session is locked.
6. **Fees & Bank Details** → bank account and payment-reference instructions; fee categories; *Add fee* per term and class with a deadline. Bills are generated for enrolled students automatically (and for students approved later). Editing an amount re-prices unpaid bills and is ledgered.
7. **Subject Registration** → configure each class's window (open/close times, min/max electives, approval required?).
8. **Timetable Management** → bell schedule, then build and publish each class timetable (conflicts block publishing).
9. **Promotion** (Student Management → Promotion) at year end: promote, repeat or graduate. A new enrollment is created; all history is kept.

## 2. Registrations

- **Students**: Student Management → *Registrations*. Open an application, check the photo and details, confirm/adjust class and session and **Approve** (issues the student ID, enrolls, bills fees, invites the parent email). Or **Request corrections** / **Reject** with a message the applicant sees. Internal notes are admin-only. Possible duplicates are flagged.
- **Teachers**: Teacher Management → *Applications* → review qualifications and documents → Approve / Request info / Reject. Then open the teacher and **assign subject offerings** and (optionally) class-teacher duties. Teachers see students only through these assignments.
- **Manual registration**: Student Management → *Register student* (for office enrolments).

## 3. Parents

Parents link through the invitation emailed to the guardian address given by the student; they must sign in with that same email. If that is not possible, the parent submits a *link request*: verify identity offline (e.g. ID at the school office) before approving it in Parent Management. Revoke access immediately if a relationship is disputed. The number of guardians per student is a setting.

## 4. Results

1. Teachers enter and submit score sheets.
2. **Results Management** lists every sheet per term. Open a submitted sheet → **Approve** or **Return for correction** with a reason.
3. **Publish by class** (results officer): type `PUBLISH` to confirm. Approved sheets are locked, averages and positions calculated, report cards generated, students and verified parents notified. Unapproved subjects are excluded and can be published later (report cards are regenerated).
4. **Report Card Management**: template (principal's name, signature labels, stock remarks, what to show), class teacher / principal remarks (bulk by average range), regenerate. Each card has a unique reference and QR code; `/verify` confirms authenticity publicly.
5. **Amendments** (needs `results.amend`): open the published sheet → *Amend* → new scores + reason (≥10 characters). Old and new values, your name and the reason are recorded; the class is recalculated and a new report-card version issued.

## 5. Payments — the golden rule

**A receipt upload is not proof of payment.** Before approving:

1. Open the submission in **Payment Verification**.
2. Find the credit in the school's bank statement / internet banking with the same amount and reference.
3. Watch for the red *duplicate bank reference* warning.
4. Tick *I have confirmed these funds have been received* → **Approve**. The payment is allocated (submitted term first, then oldest balances), the ledger updated, and a confirmation emailed to the student and verified parents.
5. If not found: **Reject** with a clear reason; the student can resubmit.

Waivers, discounts, surcharges and refunds (from credit balances) are recorded on the student page by users with `finance.adjust`. Financial Reports and Reports & Exports give collections, outstanding balances and per-class summaries (CSV/Excel/PDF).

## 6. Communication

- **Announcements**: title, description, category, priority (High/Urgent are also emailed), cover image, attachments, publish time (future = scheduled), expiry, pin, audiences (everyone, all students, levels, sectors, classes, teachers, parents, specific emails). Read counts show engagement.
- **Notification Management**: targeted in-app messages (optionally emailed).
- **Email Management**: daily/monthly usage against the Resend allowance, pending/failed deliveries, retry. Near the limit, only security and financial/approval emails are sent; others wait until the next day.

## 7. Attendance

Class teachers take the daily register; subject teachers take lesson attendance. Teachers can edit for the configured window, then must request corrections, which appear in **Attendance Management**. Alerts to parents (consecutive absences, attendance below threshold) are configured in System Settings and rate-limited by a cooldown.

## 8. Users, roles and audit

- **User Permissions**: create administrators (temporary password shared securely), assign roles, create custom roles with any combination of permissions. At least one active Super Administrator must remain; only a Super Administrator can grant that role. Suspending an account signs it out everywhere.
- **Audit Logs**: filter by action, entity, actor, date, sensitive-only. Sign-ins, approvals, payments, result changes, permission changes, exports are all recorded.

## 9. System settings

School name, motto, address, contacts, principal, **logo**; registration open/closed; ID prefixes; password, session and lockout policy; attendance and alert thresholds; class position visibility; fee reminder lead time; email quotas; school days; storage warning threshold; **maintenance mode** (non-admins see a maintenance page).

## 10. Routine checks

| When | Check |
| --- | --- |
| Daily | Pending registrations and payment verifications (overview cards) |
| Weekly | Email Management failures; GitHub Actions backup runs are green |
| Monthly | Restore-test workflow green; storage and Neon usage ([FREE_TIER.md](FREE_TIER.md)); review administrator list |
| Each term | Set current term; fees; registration windows; timetables; publish results |
