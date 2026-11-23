import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { homeFor } from "@/lib/auth/current-user";
import { RoleShell, primaryPortal } from "@/components/shell/RoleShell";

export const dynamic = "force-dynamic";

export default async function SharedLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const kind = primaryPortal(u);
  if (!kind) redirect(homeFor(u));
  return <RoleShell u={u} kind={kind}>{children}</RoleShell>;
}
