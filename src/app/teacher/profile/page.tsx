import { requireTeacherPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, DL, Alert } from "@/components/ui";

export const metadata = { title: "My profile" };

export default async function TeacherProfile() {
  const u = await requireTeacherPage();
  const t = await db.teacher.findUniqueOrThrow({ where: { id: u.teacherId }, include: { user: true } });
  return (
    <div className="space-y-5">
      <PageHeader title="My profile" />
      <Card>
        <div className="flex flex-col gap-5 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {t.photoFileId ? <img src={`/api/files/${t.photoFileId}`} alt="" className="h-36 w-28 rounded-xl object-cover shadow-glass" /> : <div className="grid h-36 w-28 place-items-center rounded-xl bg-lavender text-xs text-muted">No photo</div>}
          <DL items={[["Full name", t.fullName], ["Staff number", t.staffNumber], ["Email", t.user.email], ["Phone", t.phone], ["Specialisation", t.specialization], ["Qualifications", t.qualifications], ["Experience", `${t.yearsExperience ?? 0} years`]]} />
        </div>
        <div className="mt-4"><Alert tone="blue">To update your professional record, contact the school administration.</Alert></div>
      </Card>
    </div>
  );
}
