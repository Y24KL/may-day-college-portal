import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, Alert, Progress, DL } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { saveSchoolInfo, savePolicies } from "@/app/actions/admin/system";
import { storageUsageBytes } from "@/lib/storage/files";
import { env } from "@/lib/env";

export const metadata = { title: "System settings" };

export default async function SettingsPage() {
  await requireAdminPage("settings.manage");
  const [s, used, byPurpose] = await Promise.all([db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } }), storageUsageBytes(), db.uploadedDocument.groupBy({ by: ["purpose"], where: { deletedAt: null }, _sum: { size: true }, _count: true })]);
  const gb = (b: number) => (b / 1024 ** 3).toFixed(2);
  const Num = ({ name, label, min, max, help }: { name: keyof typeof s; label: string; min?: number; max?: number; help?: string }) => (
    <div><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} type="number" min={min} max={max} className="input" defaultValue={String(s[name])} required />{help && <p className="help">{help}</p>}</div>
  );
  const Check = ({ name, label }: { name: keyof typeof s; label: string }) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={Boolean(s[name])} className="h-4 w-4 accent-royal" /> {label}</label>;
  return (
    <div className="space-y-5">
      <PageHeader title="System settings" description="School information, branding and every operational policy. No setting here requires a code change." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="School information & branding" className="lg:col-span-2">
          <ActionForm action={saveSchoolInfo} className="grid gap-3 sm:grid-cols-2" encType="multipart/form-data">
            <div><label className="label">School name</label><input name="schoolName" className="input" defaultValue={s.schoolName} required /></div>
            <div><label className="label">Motto</label><input name="motto" className="input" defaultValue={s.motto ?? ""} /></div>
            <div className="sm:col-span-2"><label className="label">Address</label><input name="address" className="input" defaultValue={s.address ?? ""} /></div>
            <div><label className="label">Phone</label><input name="phone" className="input" defaultValue={s.phone ?? ""} /></div>
            <div><label className="label">Email</label><input name="email" type="email" className="input" defaultValue={s.email ?? ""} /></div>
            <div><label className="label">Website</label><input name="website" className="input" defaultValue={s.website ?? ""} /></div>
            <div><label className="label">Principal&apos;s name</label><input name="principalName" className="input" defaultValue={s.principalName ?? ""} /></div>
            <div className="sm:col-span-2 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.logoFileId && <img src={`/api/files/${s.logoFileId}`} alt="School logo" className="h-16 w-16 rounded-xl bg-white object-contain p-1 shadow-glass" />}
              <div className="flex-1"><label className="label">Official logo (PNG/JPG, max 2 MB)</label><input name="logo" type="file" accept="image/png,image/jpeg" className="input" /></div>
            </div>
            <div><SubmitButton>Save</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card title="Infrastructure">
          <DL items={[["File storage", env.r2Configured ? "Cloudflare R2 (private)" : env.isProd ? "NOT CONFIGURED" : "Local dev folder"], ["Email", env.resendApiKey ? "Resend" : env.isProd ? "NOT CONFIGURED" : "Console (dev)"], ["App URL", env.appBaseUrl]]} />
          <div className="mt-4"><p className="label">Storage used</p><p className="font-display text-xl font-bold text-navy">{gb(used)} GB <span className="text-sm font-normal text-muted">/ 10 GB free tier</span></p><Progress value={(used / (10 * 1024 ** 3)) * 100} tone={used > Number(s.storageWarningBytes) ? "red" : "royal"} />
            <ul className="mt-2 space-y-0.5 text-xs text-muted">{byPurpose.map((p) => <li key={p.purpose}>{p.purpose.toLowerCase().replace(/_/g, " ")}: {p._count} · {((p._sum.size ?? 0) / 1024 ** 2).toFixed(1)} MB</li>)}</ul>
            {used > Number(s.storageWarningBytes) && <div className="mt-2"><Alert tone="red">Storage has passed the warning threshold. Beyond 10 GB-month, Cloudflare bills ~US$0.015/GB-month — obtain school authorisation before exceeding the free tier.</Alert></div>}
          </div>
        </Card>
      </div>
      <Card title="Policies">
        <ActionForm action={savePolicies} className="space-y-6">
          <section><h3 className="mb-3 text-sm font-semibold">Registration & identity</h3>
            <div className="mb-3 flex flex-wrap gap-4"><Check name="studentRegistrationOpen" label="Student self-registration open" /><Check name="teacherRegistrationOpen" label="Teacher self-registration open" /><Check name="parentRegistrationOpen" label="Parent registration open" /></div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div><label className="label">Student ID prefix</label><input name="studentIdPrefix" className="input" defaultValue={s.studentIdPrefix} /></div>
              <div><label className="label">Staff ID prefix</label><input name="staffIdPrefix" className="input" defaultValue={s.staffIdPrefix} /></div>
              <Num name="maxGuardiansPerStudent" label="Max guardians per student" min={1} max={4} />
            </div>
          </section>
          <section><h3 className="mb-3 text-sm font-semibold">Authentication</h3>
            <div className="grid gap-3 sm:grid-cols-4"><Num name="passwordMinLength" label="Min password length" min={8} max={64} /><Num name="sessionLifetimeHours" label="Session lifetime (hours)" min={1} /><Num name="maxFailedLogins" label="Failed sign-ins before lockout" min={3} max={20} /><Num name="lockoutMinutes" label="Lockout (minutes)" min={1} /></div>
          </section>
          <section><h3 className="mb-3 text-sm font-semibold">Attendance & alerts</h3>
            <div className="mb-3 flex flex-wrap gap-4"><Check name="enableDailyAttendance" label="Daily class attendance" /><Check name="enableLessonAttendance" label="Lesson attendance" /><Check name="allowExcusedAttendance" label="Allow 'Excused'" /></div>
            <div className="grid gap-3 sm:grid-cols-4"><Num name="attendanceEditWindowHours" label="Teacher edit window (hours)" min={0} /><Num name="attendanceWarningThreshold" label="Warning threshold (%)" min={0} max={100} /><Num name="consecutiveAbsenceAlert" label="Consecutive absences alert" min={0} help="0 disables" /><Num name="alertCooldownHours" label="Alert cooldown (hours)" min={1} /></div>
          </section>
          <section><h3 className="mb-3 text-sm font-semibold">Academics, fees & email</h3>
            <div className="mb-3"><Check name="showClassPosition" label="Show class position to students & parents" /></div>
            <div className="grid gap-3 sm:grid-cols-4"><Num name="academicDeclineThreshold" label="Academic decline alert (points)" min={1} /><Num name="feeReminderDaysBefore" label="Fee reminder (days before)" min={0} /><Num name="emailDailyLimit" label="Email daily limit" min={1} /><Num name="emailMonthlyLimit" label="Email monthly limit" min={1} /></div>
          </section>
          <section><h3 className="mb-3 text-sm font-semibold">Timetable, storage & maintenance</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <div><label className="label">School days</label><input name="schoolDays" className="input" defaultValue={s.schoolDays} /><p className="help">1 = Monday … 7 = Sunday</p></div>
              <div><label className="label">Storage warning (GB)</label><input name="storageWarningGb" type="number" step="0.1" className="input" defaultValue={(Number(s.storageWarningBytes) / 1024 ** 3).toFixed(1)} /></div>
              <div className="sm:col-span-2"><label className="label">Maintenance message</label><input name="maintenanceMessage" className="input" defaultValue={s.maintenanceMessage ?? ""} /></div>
            </div>
            <div className="mt-3"><Check name="maintenanceMode" label="Maintenance mode (only administrators can use the portal)" /></div>
          </section>
          <SubmitButton>Save policies</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
