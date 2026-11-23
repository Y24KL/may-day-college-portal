"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { authorizeSignedIn } from "@/lib/auth/guards";
import { visibleAnnouncementsWhere } from "@/lib/announcements";

export async function markNotificationsRead(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await authorizeSignedIn();
    const id = fd.get("id");
    if (typeof id === "string" && id) await db.notification.updateMany({ where: { id, userId: u.id, readAt: null }, data: { readAt: new Date() } });
    else await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  });
}

export async function markAnnouncementRead(announcementId: string) {
  const u = await authorizeSignedIn();
  const id = z.string().min(1).parse(announcementId);
  const visible = await db.announcement.findFirst({ where: { id, ...(await visibleAnnouncementsWhere(u)) }, select: { id: true } });
  if (!visible) return;
  await db.announcementRead.upsert({ where: { announcementId_userId: { announcementId: id, userId: u.id } }, create: { announcementId: id, userId: u.id }, update: {} });
}
