import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getSettings } from "@/lib/settings";
import { logout } from "@/app/actions/auth";
import { LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const s = await getSettings();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5">
        <Link href="/" className="font-display font-bold text-navy">{s.schoolName}</Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted sm:inline">{u.email}</span>
          <form action={logout}><button className="btn-secondary btn-sm"><LogOut className="h-3.5 w-3.5" /> Sign out</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-16">{children}</main>
    </div>
  );
}
