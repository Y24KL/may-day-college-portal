import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export async function shellData(userId: string) {
  const [settings, unread] = await Promise.all([getSettings(), db.notification.count({ where: { userId, readAt: null } })]);
  return { settings, unread, logoUrl: settings.logoFileId ? `/api/files/${settings.logoFileId}` : null };
}
