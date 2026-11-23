"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { submitStudentApplication } from "@/app/actions/application";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };
type Defaults = Partial<Record<"fullName" | "dateOfBirth" | "gender" | "address" | "guardianName" | "guardianEmail" | "guardianPhone" | "classId" | "sessionId", string>>;

const STEPS = ["Personal", "Contact", "Academic", "Review"];

export function StudentApplicationForm({ email, classes, sessions, defaults, hasPhoto }: { email: string; classes: Opt[]; sessions: Opt[]; defaults: Defaults; hasPhoto: boolean }) {
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const go = (n: number, form?: HTMLFormElement | null) => {
    if (n > step && form) {
      const section = form.querySelector(`[data-step="${step}"]`);
      const invalid = section?.querySelector<HTMLInputElement>(":invalid");
      if (invalid) {
        invalid.reportValidity();
        return;
      }
    }
    setStep(n);
  };
  return (
    <ActionForm action={submitStudentApplication} className="space-y-6" encType="multipart/form-data">
      <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s}>
            <div className={cn("h-1.5 rounded-full transition-colors", i <= step ? "bg-royal" : "bg-lavender")} />
            <p className={cn("mt-1.5 text-xs font-semibold", i === step ? "text-royal" : "text-muted")}>{i + 1}. {s}</p>
          </li>
        ))}
      </ol>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} />
      </AnimatePresence>

      <section data-step="0" className={cn("grid gap-4 sm:grid-cols-2", step !== 0 && "hidden")}>
        <div className="sm:col-span-2"><label className="label" htmlFor="fullName">Full name (surname first)</label><input id="fullName" name="fullName" className="input" required defaultValue={defaults.fullName} /></div>
        <div><label className="label" htmlFor="dateOfBirth">Date of birth</label><input id="dateOfBirth" name="dateOfBirth" type="date" className="input" required defaultValue={defaults.dateOfBirth} /></div>
        <div>
          <label className="label" htmlFor="gender">Gender</label>
          <select id="gender" name="gender" className="input" required defaultValue={defaults.gender ?? ""}>
            <option value="" disabled>Select…</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
          </select>
        </div>
        <div className="sm:col-span-2"><label className="label" htmlFor="address">Residential address</label><textarea id="address" name="address" className="input min-h-[80px]" required defaultValue={defaults.address} /></div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="photo">Passport photograph (JPG or PNG, max 4 MB)</label>
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview && <img src={preview} alt="Preview" className="h-20 w-16 rounded-lg object-cover" />}
            <input id="photo" name="photo" type="file" accept="image/jpeg,image/png" className="input" required={!hasPhoto} onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }} />
          </div>
          {hasPhoto && <p className="help">A photograph is already on file. Choose a new file only to replace it.</p>}
        </div>
      </section>

      <section data-step="1" className={cn("grid gap-4 sm:grid-cols-2", step !== 1 && "hidden")}>
        <div className="sm:col-span-2"><label className="label">Student email</label><input className="input" value={email} readOnly disabled /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="guardianName">Parent / guardian full name</label><input id="guardianName" name="guardianName" className="input" required defaultValue={defaults.guardianName} /></div>
        <div><label className="label" htmlFor="guardianEmail">Parent / guardian email</label><input id="guardianEmail" name="guardianEmail" type="email" className="input" required defaultValue={defaults.guardianEmail} /></div>
        <div><label className="label" htmlFor="guardianPhone">Parent / guardian phone</label><input id="guardianPhone" name="guardianPhone" type="tel" className="input" required defaultValue={defaults.guardianPhone} /></div>
      </section>

      <section data-step="2" className={cn("grid gap-4 sm:grid-cols-2", step !== 2 && "hidden")}>
        <div>
          <label className="label" htmlFor="classId">Class & academic sector</label>
          <select id="classId" name="classId" className="input" required defaultValue={defaults.classId ?? ""}>
            <option value="" disabled>Select…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="help">Your class and sector are confirmed by the school on approval.</p>
        </div>
        <div>
          <label className="label" htmlFor="sessionId">Academic session</label>
          <select id="sessionId" name="sessionId" className="input" required defaultValue={defaults.sessionId ?? ""}>
            <option value="" disabled>Select…</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </section>

      <section data-step="3" className={cn("space-y-3", step !== 3 && "hidden")}>
        <p className="text-sm text-ink">Please review your information. After submission your application is sent to the school for approval and cannot be edited unless the school requests corrections.</p>
        <label className="flex items-start gap-3 rounded-xl bg-white/60 p-3 text-sm">
          <input type="checkbox" required className="mt-0.5 h-4 w-4 accent-royal" />
          <span>I confirm that the information provided is accurate and that my parent/guardian is aware of this registration.</span>
        </label>
      </section>

      <div className="flex justify-between gap-2">
        <button type="button" className="btn-secondary" disabled={step === 0} onClick={() => go(step - 1)}>Back</button>
        {step < 3 ? (
          <button type="button" className="btn-primary" onClick={(e) => go(step + 1, e.currentTarget.form)}>Continue</button>
        ) : (
          <SubmitButton pendingText="Submitting…">Submit application</SubmitButton>
        )}
      </div>
    </ActionForm>
  );
}
