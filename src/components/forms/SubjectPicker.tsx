"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { submitSubjectRegistration } from "@/app/actions/student";
import { cn } from "@/lib/utils";
import { Check, Lock } from "lucide-react";

type O = { id: string; name: string; code: string; compulsory: boolean; teacher?: string };

export function SubjectPicker({ offerings, min, max }: { offerings: O[]; min: number; max: number }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [review, setReview] = useState(false);
  const compulsory = offerings.filter((o) => o.compulsory);
  const electives = offerings.filter((o) => !o.compulsory);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < max) n.add(id); return n; });
  const ok = sel.size >= min && sel.size <= max;
  return (
    <ActionForm action={submitSubjectRegistration} className="space-y-5">
      {compulsory.map((o) => <input key={o.id} type="hidden" name="offeringIds" value={o.id} />)}
      {[...sel].map((id) => <input key={id} type="hidden" name="offeringIds" value={id} />)}
      <div className="sticky top-20 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 backdrop-blur">
        <p className="text-sm"><b>{compulsory.length + sel.size}</b> subjects selected · <b>{sel.size}</b> elective(s) <span className="text-muted">(choose {min === max ? min : `${min}–${max}`})</span></p>
        {!review ? <button type="button" className="btn-primary btn-sm" disabled={!ok} onClick={() => setReview(true)}>Review registration</button> : <button type="button" className="btn-secondary btn-sm" onClick={() => setReview(false)}>Edit selection</button>}
      </div>
      {!review ? (
        <>
          <section><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Compulsory ({compulsory.length})</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{compulsory.map((o) => <div key={o.id} className="flex items-center gap-3 rounded-xl border border-navy/10 bg-navy/5 p-3"><Lock className="h-4 w-4 text-navy" /><div><p className="font-semibold text-navy">{o.name}</p><p className="text-xs text-muted">{o.code}{o.teacher && ` · ${o.teacher}`}</p></div></div>)}</div>
          </section>
          {electives.length > 0 && <section><h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Electives ({electives.length})</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{electives.map((o) => { const on = sel.has(o.id); const disabled = !on && sel.size >= max; return (
              <motion.button whileTap={{ scale: 0.98 }} type="button" key={o.id} onClick={() => toggle(o.id)} disabled={disabled} aria-pressed={on} className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition", on ? "border-royal bg-royal/10" : "border-lavender bg-white/70 hover:border-royal/40", disabled && "opacity-50")}>
                <span className={cn("grid h-5 w-5 place-items-center rounded-md border", on ? "border-royal bg-royal text-white" : "border-muted/40")}>{on && <Check className="h-3.5 w-3.5" />}</span>
                <span><span className="block font-semibold text-navy">{o.name}</span><span className="text-xs text-muted">{o.code}{o.teacher && ` · ${o.teacher}`}</span></span>
              </motion.button>
            ); })}</div>
          </section>}
        </>
      ) : (
        <section className="space-y-3">
          <ul className="grid gap-2 sm:grid-cols-2">{[...compulsory, ...electives.filter((e) => sel.has(e.id))].map((o) => <li key={o.id} className="flex justify-between rounded-xl bg-white/70 p-3 text-sm"><span className="font-medium text-navy">{o.name}</span><span className="text-xs text-muted">{o.compulsory ? "Compulsory" : "Elective"}</span></li>)}</ul>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" required className="mt-0.5 h-4 w-4 accent-royal" /> I confirm my subject selection. I understand changes after submission require the school&apos;s approval.</label>
          <SubmitButton pendingText="Submitting…">Submit registration</SubmitButton>
        </section>
      )}
    </ActionForm>
  );
}
