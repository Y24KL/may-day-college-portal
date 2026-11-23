import type { Announcement, AnnouncementAudience } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { saveAnnouncement } from "@/app/actions/admin/operations";
import { AudiencePicker } from "./AudiencePicker";

export const CATEGORIES = ["Academic Updates", "Examination Information", "School Events", "Holidays", "Resumption Information", "Parent-Teacher Meetings", "General Announcements", "Important Notices"];

import { toLagosInput as local } from "@/lib/utils";

export async function AnnouncementForm({ a }: { a?: Announcement & { audiences: AnnouncementAudience[] } }) {
  return (
    <ActionForm action={saveAnnouncement} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
      {a && <input type="hidden" name="announcementId" value={a.id} />}
      <div className="sm:col-span-2"><label className="label">Title</label><input name="title" className="input" defaultValue={a?.title} required /></div>
      <div className="sm:col-span-2"><label className="label">Description</label><textarea name="body" className="input min-h-[160px]" defaultValue={a?.body} required /></div>
      <div><label className="label">Category</label><select name="category" className="input" defaultValue={a?.category ?? "General Announcements"}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
      <div><label className="label">Priority</label><select name="priority" className="input" defaultValue={a?.priority ?? "NORMAL"}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High (also emailed)</option><option value="URGENT">Urgent (also emailed)</option></select></div>
      <div><label className="label">Publication date/time (Lagos)</label><input name="publishAt" type="datetime-local" className="input" defaultValue={local(a?.publishAt)} /><p className="help">Leave empty to publish now; a future time schedules it.</p></div>
      <div><label className="label">Expiry date/time</label><input name="expiresAt" type="datetime-local" className="input" defaultValue={local(a?.expiresAt)} /></div>
      <div><label className="label">Cover image</label><input name="cover" type="file" accept="image/jpeg,image/png" className="input" /></div>
      <div><label className="label">Attachments (PDF/images, up to 5)</label><input name="attachments" type="file" multiple accept="application/pdf,image/jpeg,image/png" className="input" /></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="isPinned" defaultChecked={a?.isPinned} className="h-4 w-4 accent-royal" /> Pin to the top of the notice board</label>
      <div className="sm:col-span-2"><AudiencePicker selected={a?.audiences.map((x) => (x.targetId && x.type !== "USER" ? `${x.type}:${x.targetId}` : x.type)) ?? []} /></div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <SubmitButton className="btn-secondary" name="mode" value="DRAFT">Save draft</SubmitButton>
        <SubmitButton name="mode" value="PUBLISH">Publish / schedule</SubmitButton>
      </div>
    </ActionForm>
  );
}
