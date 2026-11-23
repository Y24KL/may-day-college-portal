import { requireStudentPage } from "@/lib/auth/guards";
import { RoleShell } from "@/components/shell/RoleShell";

export const dynamic = "force-dynamic";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const u = await requireStudentPage();
  return <RoleShell u={u} kind="student">{children}</RoleShell>;
}
