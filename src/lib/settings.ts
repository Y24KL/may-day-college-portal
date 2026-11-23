import { cache } from "react";
import { db } from "@/lib/db";

export const getSettings = cache(async () => {
  return db.schoolSettings.upsert({ where: { id: "school" }, create: { id: "school" }, update: {} });
});

export async function getSettingsFresh() {
  return db.schoolSettings.upsert({ where: { id: "school" }, create: { id: "school" }, update: {} });
}
