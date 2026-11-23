import Link from "next/link";
import type { ReactNode } from "react";
import { getSettings } from "@/lib/settings";
import { FadeIn } from "@/components/ui/client";
import { ShieldCheck, GraduationCap, Users, LineChart } from "lucide-react";

export async function AuthFrame({ title, subtitle, children, footer, wide }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const s = await getSettings();
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-royal/50 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-gold/25 blur-3xl" />
        <div className="absolute left-1/3 top-1/2 h-72 w-72 rounded-full bg-sky/20 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-3">
          {s.logoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${s.logoFileId}`} alt="" className="h-12 w-12 rounded-2xl bg-white object-contain p-1" />
          ) : (
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-gold to-amber-500 font-display text-xl font-bold text-navy">M</div>
          )}
          <div>
            <p className="font-display text-lg font-bold">{s.schoolName}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-gold">{s.address ?? "Lagos, Nigeria"}</p>
          </div>
        </Link>
        <div className="relative mt-auto max-w-lg">
          <h2 className="font-display text-4xl font-bold leading-tight text-white">One connected home for learning, progress and school life.</h2>
          <p className="mt-4 text-white/70">Students, teachers, parents and administrators — working from the same trusted records.</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              [GraduationCap, "Results & report cards"],
              [LineChart, "Performance insights"],
              [Users, "Parent monitoring"],
              [ShieldCheck, "Verified, secure access"],
            ].map(([Icon, label], i) => {
              const I = Icon as typeof ShieldCheck;
              return (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
                  <I className="h-5 w-5 text-gold" /> <span className="text-sm">{label as string}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <FadeIn className={wide ? "w-full max-w-2xl" : "w-full max-w-md"}>
          <div className="mb-6 lg:hidden">
            <Link href="/" className="font-display text-lg font-bold text-navy">{s.schoolName}</Link>
          </div>
          <div className="glass-strong p-6 sm:p-8">
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
        </FadeIn>
      </div>
    </div>
  );
}
