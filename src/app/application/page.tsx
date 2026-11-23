import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { homeFor } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { Card, StatusBadge, Alert, DL } from "@/components/ui";
import { FadeIn } from "@/components/ui/client";
import { formatDateTime } from "@/lib/utils";
import { CheckCircle2, Circle, Clock } from "lucide-react";

export const metadata = { title: "Registration status" };

export default async function ApplicationStatus() {
  const u = await requireUser();
  if (!u.emailVerified) redirect("/verify-email");
  if (u.studentId || u.teacherId || u.isAdmin || u.accountType === "PARENT") redirect(homeFor(u));
  const app =
    u.accountType === "STUDENT"
      ? await db.studentApplication.findUnique({ where: { userId: u.id }, include: { requestedClass: true, session: true } })
      : await db.teacherApplication.findUnique({ where: { userId: u.id } });
  if (!app) redirect("/");
  const formHref = u.accountType === "STUDENT" ? "/application/student" : "/application/teacher";
  const steps = [
    { label: "Account created", done: true },
    { label: "Email verified", done: true },
    { label: u.accountType === "STUDENT" ? "Student information submitted" : "Professional information submitted", done: app.status !== "DRAFT" },
    { label: "Administrator review", done: app.status === "APPROVED" || app.status === "REJECTED", current: app.status === "PENDING_APPROVAL" },
  ];
  return (
    <FadeIn className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-royal">{u.accountType === "STUDENT" ? "Student" : "Teacher"} registration</p>
        <h1 className="mt-1 text-3xl font-bold">Registration status</h1>
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Application reference</p>
            <p className="font-display text-2xl font-bold text-navy">{app.reference}</p>
          </div>
          <StatusBadge status={app.status === "DRAFT" ? "INFORMATION_REQUIRED" : app.status} />
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-4">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-2 rounded-xl bg-white/60 p-3 text-sm">
              {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : s.current ? <Clock className="h-5 w-5 shrink-0 text-amber-600" /> : <Circle className="h-5 w-5 shrink-0 text-muted" />}
              <span className={s.done ? "text-navy" : "text-muted"}>{s.label}</span>
            </li>
          ))}
        </ol>
      </Card>

      {app.status === "DRAFT" && (
        <Alert tone="blue" title="Complete your application">
          Your account is ready. Complete the information form so the school can review your registration.
          <div className="mt-3"><Link className="btn-primary" href={formHref}>Continue registration</Link></div>
        </Alert>
      )}
      {app.status === "INFORMATION_REQUIRED" && (
        <Alert tone="amber" title="The school has requested corrections">
          <p className="whitespace-pre-line">{app.correctionRequest}</p>
          <div className="mt-3"><Link className="btn-primary" href={formHref}>Update my application</Link></div>
        </Alert>
      )}
      {app.status === "PENDING_APPROVAL" && (
        <Alert tone="amber" title="Pending approval">Your application was submitted {formatDateTime(app.submittedAt)}. You will receive an email once it has been reviewed. Protected portal features stay locked until approval.</Alert>
      )}
      {app.status === "REJECTED" && <Alert tone="red" title="Application not approved">{app.decisionReason || "Please contact the school administration for more information."}</Alert>}
      {app.status === "APPROVED" && <Alert tone="green" title="Approved">Your account has been approved. <Link className="font-semibold underline" href="/home">Open your portal</Link>.</Alert>}

      {"requestedClass" in app && app.status !== "DRAFT" && (
        <Card title="Submitted information">
          <DL items={[["Full name", app.fullName], ["Class requested", app.requestedClass?.name], ["Academic session", app.session?.name], ["Parent/guardian", app.guardianName], ["Parent/guardian email", app.guardianEmail]]} />
        </Card>
      )}
    </FadeIn>
  );
}
