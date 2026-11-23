import { requireParentPage } from "@/lib/auth/guards";
import { RoleShell } from "@/components/shell/RoleShell";

export const dynamic = "force-dynamic";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const u = await requireParentPage();
  return <RoleShell u={u} kind="parent">{children}</RoleShell>;
}
