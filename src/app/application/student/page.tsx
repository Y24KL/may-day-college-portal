import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { Card, Alert } from "@/components/ui";
import { StudentApplicationForm } from "@/components/forms/StudentApplicationForm";
import { toDateInput } from "@/lib/utils";

export const metadata = { title: "Student information" };

export default async function StudentApplicationPage() {
  const u = await requireUser();
  if (u.accountType !== "STUDENT") redirect("/application");
  if (!u.emailVerified) redirect("/verify-email");
  const app = await db.studentApplication.findUnique({ where: { userId: u.id } });
  if (!app || !["DRAFT", "INFORMATION_REQUIRED"].includes(app.status)) redirect("/application");
  const [classes, sessions] = await Promise.all([
    db.class.findMany({ where: { isActive: true }, orderBy: [{ level: { order: "asc" } }, { name: "asc" }], select: { id: true, name: true } }),
    db.academicSession.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-royal">Step 3 of 4</p>
        <h1 className="mt-1 text-3xl font-bold">Student information</h1>
      </div>
      {app.status === "INFORMATION_REQUIRED" && <Alert tone="amber" title="Corrections requested">{app.correctionRequest}</Alert>}
      {!classes.length || !sessions.length ? (
        <Alert tone="amber" title="Registration is being prepared">The school has not yet configured classes and academic sessions for registration. Please check back soon — your account is saved.</Alert>
      ) : (
        <Card>
          <StudentApplicationForm
            email={u.email}
            classes={classes}
            sessions={sessions}
            hasPhoto={Boolean(app.photoFileId)}
            defaults={{
              fullName: app.fullName ?? undefined, dateOfBirth: toDateInput(app.dateOfBirth), gender: app.gender ?? undefined, address: app.address ?? undefined,
              guardianName: app.guardianName ?? undefined, guardianEmail: app.guardianEmail, guardianPhone: app.guardianPhone ?? undefined,
              classId: app.requestedClassId ?? undefined, sessionId: app.sessionId ?? undefined,
            }}
          />
        </Card>
      )}
    </div>
  );
}
