import { requireTeacherPage } from "@/lib/auth/guards";
import { RoleShell } from "@/components/shell/RoleShell";

export const dynamic = "force-dynamic";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const u = await requireTeacherPage();
  return <RoleShell u={u} kind="teacher">{children}</RoleShell>;
}
