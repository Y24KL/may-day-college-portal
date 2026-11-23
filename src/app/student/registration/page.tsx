import Link from "next/link";
import { requireStudentPage } from "@/lib/auth/guards";
import { registrationContext } from "@/lib/registration";
import { PageHeader, Card, Alert, StatusBadge } from "@/components/ui";
import { SubjectPicker } from "@/components/forms/SubjectPicker";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Subject registration" };

export default async function Registration() {
  const u = await requireStudentPage();
  const ctx = await registrationContext(u.studentId);
  if (!ctx) return <><PageHeader title="Subject registration" /><Alert tone="amber">No academic session is currently active.</Alert></>;
  if (!ctx.enrollment) return <><PageHeader title="Subject registration" /><Alert tone="amber">You are not enrolled in {ctx.session.name}. Please contact the school office.</Alert></>;
  const existing = ctx.enrollment.subjectRegistration;
  return (
    <div className="space-y-5">
      <PageHeader title="Subject registration" description={`${ctx.session.name} · ${ctx.enrollment.class.name}`} />
      {existing ? (
        <Alert tone="green" title={`Registration ${existing.reference}`}>
          <span className="flex items-center gap-2">Submitted {formatDateTime(existing.submittedAt)} <StatusBadge status={existing.status} /></span>
          <div className="mt-2 flex gap-2"><Link className="btn-primary btn-sm" href="/student/subjects">View my subjects</Link><a className="btn-secondary btn-sm" href="/api/me/subjects" target="_blank">Download list</a></div>
        </Alert>
      ) : !ctx.window.open ? (
        <Alert tone="amber" title="Registration unavailable">{ctx.window.reason}</Alert>
      ) : !ctx.offerings.length ? (
        <Alert tone="amber">No subjects have been offered to your class yet.</Alert>
      ) : (
        <Card description={ctx.cfg?.closesAt ? `Closes ${formatDateTime(ctx.cfg.closesAt)}` : undefined}>
          <SubjectPicker offerings={ctx.offerings.map((o) => ({ id: o.id, name: o.subject.name, code: o.subject.code, compulsory: o.isCompulsory, teacher: o.teacherAssignments[0]?.teacher.fullName }))} min={ctx.cfg?.minElectives ?? 0} max={ctx.cfg?.maxElectives ?? 0} />
        </Card>
      )}
    </div>
  );
}
