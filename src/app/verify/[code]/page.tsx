import { db } from "@/lib/db";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { Alert, DL } from "@/components/ui";
import { termLabel } from "@/lib/academic";
import { formatDate } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { clientInfo } from "@/lib/auth/session";
import { ShieldCheck, ShieldX } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Document verification", robots: { index: false } };

/** Public verification — confirms authenticity with minimal personal data. */
export default async function VerifyDocument({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { ip } = await clientInfo();
  if (!rateLimit(`verify-doc:${ip}`, 30, 10 * 60_000).ok) return <AuthFrame title="Too many requests"><Alert tone="amber">Please try again in a few minutes.</Alert></AuthFrame>;
  const v = await db.documentVerification.findUnique({ where: { code }, include: { reportCard: { include: { student: true, term: { include: { session: true } }, result: { include: { class: true } } } } } });
  if (v) await db.documentVerification.update({ where: { id: v.id }, data: { checks: { increment: 1 }, lastCheckedAt: new Date() } });
  const rc = v?.reportCard;
  if (!rc) {
    return (
      <AuthFrame title="Not verified">
        <div className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 text-rose-800"><ShieldX className="h-8 w-8" /><p className="text-sm">No document matches this verification code. The document may be forged or the code mistyped.</p></div>
      </AuthFrame>
    );
  }
  // Mask the name: first name + initial of surname.
  const parts = rc.student.fullName.split(" ").filter(Boolean);
  const masked = parts.length > 1 ? `${parts.slice(1).join(" ")} ${parts[0][0]}.` : parts[0];
  return (
    <AuthFrame title="Document verified">
      <div className={`mb-5 flex items-center gap-3 rounded-2xl p-4 ${rc.status === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
        <ShieldCheck className="h-8 w-8 shrink-0" />
        <p className="text-sm">{rc.status === "ACTIVE" ? "This is an authentic report card issued by the school." : "This report card was genuinely issued but has been SUPERSEDED by a newer version. Ask for the current version."}</p>
      </div>
      <DL items={[["Document", "Student report card"], ["Reference", rc.reference], ["Student", masked], ["Class", rc.result.class.name], ["Term", termLabel(rc.term)], ["Issued", formatDate(rc.generatedAt)], ["Version", String(rc.version)]]} />
    </AuthFrame>
  );
}
