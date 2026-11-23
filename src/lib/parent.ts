import { db } from "@/lib/db";

/** Verified children of a parent; `selected` is guaranteed to be one of them. */
export async function parentChildren(parentId: string, childId?: string) {
  const rels = await db.parentStudentRelationship.findMany({
    where: { parentId, status: "VERIFIED" },
    include: { student: { include: { enrollments: { where: { session: { isCurrent: true } }, include: { class: { include: { sector: true } } } } } } },
    orderBy: { student: { fullName: "asc" } },
  });
  const children = rels.map((r) => ({ ...r.student, relationship: r.relationship, currentClass: r.student.enrollments[0]?.class }));
  const selected = children.find((c) => c.id === childId) ?? children[0] ?? null;
  return { children, selected };
}
