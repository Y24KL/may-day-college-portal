import { requireUser } from "@/lib/auth/guards";
import { getSettings } from "@/lib/settings";
import { PageHeader, Card } from "@/components/ui";

export const metadata = { title: "Help & support" };

const FAQ: [string, string][] = [
  ["How do I register my subjects?", "Open Subject Registration while the window for your class is open. Compulsory subjects are included automatically; choose electives within the allowed limits, review and submit."],
  ["When will I see my results?", "Results appear only after the school has reviewed and officially published them. You will receive a notification when they are available."],
  ["How do I pay school fees?", "Transfer to the school account shown on the School Fees page, then submit the amount, date, bank reference and receipt. Your payment is confirmed only after the bursary verifies it in the school's bank account."],
  ["My details are wrong", "You can update permitted personal details in My Profile. Changes to your class, sector or student ID must be made by the school administration."],
  ["How can my parent see my records?", "After approval, an invitation was sent to the parent email you provided. Your parent must register with that email and accept the invitation."],
  ["I forgot my password", "Use “Forgot password” on the sign-in page. A reset link valid for one hour will be emailed to you."],
];

export default async function Help() {
  await requireUser();
  const s = await getSettings();
  return (
    <div className="space-y-5">
      <PageHeader title="Help & support" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Frequently asked questions" className="lg:col-span-2">
          <div className="space-y-2">{FAQ.map(([q, a]) => <details key={q} className="rounded-xl bg-white/60 p-4"><summary className="cursor-pointer font-semibold text-navy">{q}</summary><p className="mt-2 text-sm text-ink">{a}</p></details>)}</div>
        </Card>
        <Card title="Contact the school">
          <p className="text-sm">{s.schoolName}</p>
          <p className="text-sm text-muted">{s.address}</p>
          {s.phone && <p className="mt-2 text-sm">📞 {s.phone}</p>}
          {s.email && <p className="text-sm">✉️ <a className="text-royal" href={`mailto:${s.email}`}>{s.email}</a></p>}
        </Card>
      </div>
    </div>
  );
}
