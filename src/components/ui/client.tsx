"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, X, Copy, Check } from "lucide-react";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function SubmitButton({ children, className, pendingText, disabled, name, value }: { children: ReactNode; className?: string; pendingText?: string; disabled?: boolean; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} className={className ?? "btn-primary"} disabled={pending || disabled} aria-busy={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/**
 * Progressive-enhancement form bound to a server action. Shows inline errors,
 * success toasts and follows redirects returned by the action.
 */
export function ActionForm({ action, children, className, resetOnSuccess, onSuccess, successToast = true, encType }: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; onSuccess?: () => void; successToast?: boolean; encType?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  // Side effects run inside the action (not in an effect) so they still happen
  // when the form unmounts because the refreshed page no longer renders it.
  const wrapped = async (prev: ActionState, fd: FormData): Promise<ActionState> => {
    let state: ActionState;
    try {
      state = await action(prev, fd);
    } catch {
      state = { ok: false, error: "The server could not be reached. If the portal was idle it may be waking up — please try again in a moment." };
    }
    if (state?.ok) {
      if (successToast && state.message) toast.success(state.message);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
      if (state.redirect) router.push(state.redirect);
      else router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
    return state;
  };
  const [state, formAction] = useActionState(wrapped, null);
  return (
    <form ref={ref} action={formAction} className={className} encType={encType}>
      {state && !state.ok && state.error && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-sm text-rose-800">{state.error}</div>
      )}
      {children}
    </form>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn("glass-strong relative max-h-[90vh] w-full overflow-y-auto p-6", wide ? "max-w-3xl" : "max-w-lg")}
            initial={{ y: 30, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button className="btn-ghost btn-sm -mr-2 -mt-1" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Button that opens a modal containing a server-action form. */
export function ModalForm({ trigger, triggerClassName, title, action, children, submitLabel = "Save", wide, submitClassName, encType }: { trigger: ReactNode; triggerClassName?: string; title: string; action: Action; children: ReactNode; submitLabel?: string; wide?: boolean; submitClassName?: string; encType?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={triggerClassName ?? "btn-primary"} onClick={() => setOpen(true)}>{trigger}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide={wide}>
        <ActionForm action={action} onSuccess={() => setOpen(false)} className="space-y-4" encType={encType}>
          {children}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <SubmitButton className={submitClassName}>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

/** One-click action with a confirmation dialog (for high-impact operations). */
export function ConfirmAction({ action, fields, label, title, message, confirmLabel = "Confirm", className, danger, requireText, children }: { action: Action; fields: Record<string, string>; label: ReactNode; title: string; message: ReactNode; confirmLabel?: string; className?: string; danger?: boolean; requireText?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <>
      <button type="button" className={className ?? (danger ? "btn-danger btn-sm" : "btn-secondary btn-sm")} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <ActionForm action={action} onSuccess={() => setOpen(false)} className="space-y-4">
          {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <div className="text-sm text-ink">{message}</div>
          {children}
          {requireText && (
            <div>
              <label className="label" htmlFor="confirm-text">Type <b>{requireText}</b> to confirm</label>
              <input id="confirm-text" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <SubmitButton className={danger ? "btn-danger" : "btn-primary"} disabled={!!requireText && typed !== requireText}>{confirmLabel}</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast.success("Copied to clipboard");
          setTimeout(() => setDone(false), 1800);
        } catch {
          toast.error("Could not copy — please copy manually.");
        }
      }}
      aria-label={`${label}: ${value}`}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {label}
    </button>
  );
}

export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}>
      {children}
    </motion.div>
  );
}
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } }}>
      {children}
    </motion.div>
  );
}

/** Password input with show/hide and live strength hints. */
export function PasswordInput({ name, id, autoComplete = "new-password", showStrength, minLength = 10 }: { name: string; id: string; autoComplete?: string; showStrength?: boolean; minLength?: number }) {
  const [v, setV] = useState("");
  const [show, setShow] = useState(false);
  const checks = [
    [v.length >= minLength, `${minLength}+ characters`],
    [/[a-z]/.test(v) && /[A-Z]/.test(v), "Upper & lower case"],
    [/\d/.test(v), "A number"],
  ] as const;
  const score = checks.filter((c) => c[0]).length;
  return (
    <div>
      <div className="relative">
        <input id={id} name={name} type={show ? "text" : "password"} className="input pr-16" autoComplete={autoComplete} required value={v} onChange={(e) => setV(e.target.value)} />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-royal hover:bg-lavender">
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {showStrength && (
        <div className="mt-2">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn("h-1.5 flex-1 rounded-full transition", i < score ? (score === 3 ? "bg-emerald-500" : "bg-gold") : "bg-lavender")} />
            ))}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {checks.map(([ok, label]) => (
              <li key={label} className={ok ? "text-emerald-700" : "text-muted"}>{ok ? "✓" : "•"} {label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Auto-submitting select (for GET filter forms). */
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("input", props.className)} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
