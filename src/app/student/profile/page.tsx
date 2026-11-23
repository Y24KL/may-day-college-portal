import { requireStudentPage } from "@/lib/auth/guards";
import { getStudentFull } from "@/lib/people";
import { PageHeader, Card, DL, StatusBadge, Alert } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { updateMyProfile } from "@/app/actions/student";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "My profile" };

export default async function StudentProfile() {
  const u = await requireStudentPage();
  const s = (await getStudentFull(u.studentId))!;
  const active = s.enrollments.find((e) => e.status === "ACTIVE");
  return (
    <div className="space-y-5">
      <PageHeader title="My profile" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="School record" className="lg:col-span-2">
          <div className="flex flex-col gap-5 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {s.photoFileId ? <img src={`/api/files/${s.photoFileId}`} alt="" className="h-36 w-28 rounded-xl object-cover shadow-glass" /> : <div className="grid h-36 w-28 place-items-center rounded-xl bg-lavender text-xs text-muted">No photo</div>}
            <DL items={[["Full name", s.fullName], ["Student ID", s.studentNumber], ["Class", active?.class.name], ["Academic sector", active?.class.sector.name], ["Session", active?.session.name], ["Date of birth", formatDate(s.dateOfBirth)], ["Gender", s.gender], ["Email", s.user.email], ["Parent/guardian", s.guardianName], ["Guardian email", s.guardianEmail]]} />
          </div>
          <p className="label mt-5">Linked parents</p>
          <ul className="flex flex-wrap gap-2 text-sm">{s.parents.map((p) => <li key={p.id} className="rounded-xl bg-white/60 px-3 py-1.5">{p.parent.fullName} <StatusBadge status={p.status} /></li>)}{!s.parents.length && <li className="text-muted">No parent has linked yet. An invitation was sent to {s.guardianEmail ?? "your parent's email"}.</li>}</ul>
        </Card>
        <Card title="Update my details">
          <Alert tone="blue">Changes to your name, class, sector or student ID must be requested from the school office.</Alert>
          <ActionForm action={updateMyProfile} className="mt-3 space-y-3" encType="multipart/form-data">
            <div><label className="label" htmlFor="phone">My phone</label><input id="phone" name="phone" className="input" defaultValue={s.phone ?? ""} /></div>
            <div><label className="label" htmlFor="address">Residential address</label><textarea id="address" name="address" className="input" defaultValue={s.address ?? ""} required /></div>
            <div><label className="label" htmlFor="guardianPhone">Parent/guardian phone</label><input id="guardianPhone" name="guardianPhone" className="input" defaultValue={s.guardianPhone ?? ""} /></div>
            <div><label className="label" htmlFor="photo">New passport photograph</label><input id="photo" name="photo" type="file" accept="image/jpeg,image/png" className="input" /></div>
            <SubmitButton>Save changes</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
