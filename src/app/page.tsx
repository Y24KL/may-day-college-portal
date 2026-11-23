import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { getCurrentUser, homeFor } from "@/lib/auth/current-user";
import { FadeIn } from "@/components/ui/client";
import { GraduationCap, Briefcase, Users, ShieldCheck, BarChart3, FileText, Wallet, CalendarDays, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const [s, u] = await Promise.all([getSettings(), getCurrentUser()]);
  const features = [
    [BarChart3, "Academic insights", "Term-by-term trends computed from published results."],
    [FileText, "Verified report cards", "QR-verifiable PDF report cards for every term."],
    [Wallet, "Transparent fees", "Bank-transfer submissions verified by the bursary."],
    [CalendarDays, "Live timetables", "Conflict-checked schedules for every class."],
    [Users, "Parent monitoring", "Results, attendance and fees for verified guardians."],
    [ShieldCheck, "Approved access only", "Every student and teacher is reviewed by the school."],
  ] as const;
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          {s.logoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${s.logoFileId}`} alt="" className="h-11 w-11 rounded-2xl bg-white object-contain p-1 shadow-glass" />
          ) : (
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-navy font-display text-xl font-bold text-gold shadow-glass">M</div>
          )}
          <div>
            <p className="font-display font-bold text-navy">{s.schoolName}</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted">{s.address}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {u ? (
            <Link href={homeFor(u)} className="btn-primary">Go to my portal</Link>
          ) : (
            <>
              <Link href="/login" className="btn-secondary">Sign in</Link>
              <Link href="/register" className="btn-primary hidden sm:inline-flex">Register</Link>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-8">
        <FadeIn>
          <section className="relative mt-6 overflow-hidden rounded-3xl bg-navy px-6 py-14 text-white shadow-glass-lg sm:px-12 sm:py-20">
            <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-royal/60 blur-3xl" />
            <div className="absolute -bottom-24 right-0 h-96 w-96 rounded-full bg-gold/25 blur-3xl" />
            <div className="relative max-w-3xl">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold backdrop-blur">
                {s.motto || "Student & School Management Portal"}
              </p>
              <h1 className="font-display text-4xl font-extrabold leading-[1.1] text-white sm:text-6xl">
                Everything about school life, <span className="bg-gradient-to-r from-sky to-gold bg-clip-text text-transparent">in one place.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base text-white/75 sm:text-lg">Results, attendance, timetables, fees and announcements for students, teachers, parents and administrators of {s.schoolName}.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="btn-gold">Create an account <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/login" className="btn border border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20">Sign in</Link>
              </div>
            </div>
          </section>
        </FadeIn>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            ["/register/student", GraduationCap, "Students", "Register, choose subjects and follow your progress."],
            ["/register/teacher", Briefcase, "Teachers", "Manage attendance, scores and your timetable."],
            ["/register/parent", Users, "Parents & Guardians", "Stay informed about your children."],
          ].map(([href, Icon, title, desc], i) => {
            const I = Icon as typeof Users;
            return (
              <FadeIn key={i} delay={0.1 + i * 0.06}>
                <Link href={href as string} className="glass group block h-full p-6 transition hover:-translate-y-1 hover:shadow-glass-lg">
                  <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-royal/10 text-royal"><I className="h-6 w-6" /></div>
                  <h2 className="text-lg font-bold">{title as string}</h2>
                  <p className="mt-1 text-sm text-muted">{desc as string}</p>
                  <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-royal">Get started <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></p>
                </Link>
              </FadeIn>
            );
          })}
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-bold">Built for how the school works</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(([Icon, title, desc]) => (
              <div key={title} className="glass flex gap-4 p-5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/20 text-amber-800"><Icon className="h-5 w-5" /></div>
                <div><p className="font-semibold text-navy">{title}</p><p className="mt-0.5 text-sm text-muted">{desc}</p></div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-white/60 py-6 text-center text-xs text-muted">© {new Date().getFullYear()} {s.schoolName}. {s.phone ? `· ${s.phone}` : ""} {s.email ? `· ${s.email}` : ""}</footer>
    </div>
  );
}
