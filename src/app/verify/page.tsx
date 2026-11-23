import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/AuthFrame";

export const metadata = { title: "Verify a document" };

async function go(fd: FormData) {
  "use server";
  const code = String(fd.get("code") ?? "").trim().replace(/[^\w-]/g, "");
  if (code) redirect(`/verify/${code}`);
}

export default function VerifyIndex() {
  return (
    <AuthFrame title="Verify a document" subtitle="Scan the QR code on a report card, or enter its verification code.">
      <form action={go} className="space-y-3">
        <input name="code" className="input" placeholder="Verification code" required />
        <button className="btn-primary w-full">Verify</button>
      </form>
    </AuthFrame>
  );
}
