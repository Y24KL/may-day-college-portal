import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { GraduationCap, Briefcase, Users, ArrowRight } from "lucide-react";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Create an account" };

export default async function RegisterChooser() {
  const s = await getSettings();
  const options = [
    { href: "/register/student", icon: GraduationCap, title: "I am a student", desc: "SSS1–SSS3. Your application is reviewed by the school.", open: s.studentRegistrationOpen },
    { href: "/register/teacher", icon: Briefcase, title: "I am a teacher", desc: "Apply for staff access. Requires administrator approval.", open: s.teacherRegistrationOpen },
    { href: "/register/parent", icon: Users, title: "I am a parent / guardian", desc: "Monitor your verified children's progress.", open: s.parentRegistrationOpen },
  ];
  return (
    <AuthFrame title="Create your account" subtitle="Choose the account that describes you." footer={<>Already registered? <Link className="font-semibold text-royal" href="/login">Sign in</Link></>}>
      <div className="space-y-3">
        {options.map((o) =>
          o.open ? (
            <Link key={o.href} href={o.href} className="group flex items-center gap-4 rounded-2xl border border-lavender bg-white/70 p-4 transition hover:-translate-y-0.5 hover:border-royal/40 hover:shadow-glass">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-royal/10 text-royal"><o.icon className="h-5 w-5" /></div>
              <div className="flex-1">
                <p className="font-semibold text-navy">{o.title}</p>
                <p className="text-xs text-muted">{o.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-1 group-hover:text-royal" />
            </Link>
          ) : (
            <div key={o.href} className="flex items-center gap-4 rounded-2xl border border-lavender bg-white/40 p-4 opacity-70">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-muted"><o.icon className="h-5 w-5" /></div>
              <div><p className="font-semibold text-navy">{o.title}</p><p className="text-xs text-muted">Registration is currently closed.</p></div>
            </div>
          ),
        )}
      </div>
    </AuthFrame>
  );
}
