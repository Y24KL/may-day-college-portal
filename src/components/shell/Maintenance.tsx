import { logout } from "@/app/actions/auth";

export function Maintenance({ message, schoolName }: { message?: string | null; schoolName: string }) {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="glass-strong max-w-md p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-royal">{schoolName}</p>
        <h1 className="mt-2 text-2xl font-bold">Scheduled maintenance</h1>
        <p className="mt-2 text-sm text-muted">{message || "The portal is temporarily unavailable while we carry out maintenance. Please check back shortly."}</p>
        <form action={logout} className="mt-6"><button className="btn-secondary">Sign out</button></form>
      </div>
    </div>
  );
}
