import { db } from "@/lib/db";

export const classOptions = (activeOnly = true) =>
  db.class.findMany({ where: activeOnly ? { isActive: true } : {}, orderBy: [{ level: { order: "asc" } }, { name: "asc" }], include: { level: true, sector: true } });
export const sessionOptions = () => db.academicSession.findMany({ orderBy: { startDate: "desc" } });
export const termOptions = () => db.term.findMany({ include: { session: true }, orderBy: [{ session: { startDate: "desc" } }, { order: "asc" }] });
