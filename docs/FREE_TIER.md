# Free-tier limits, monitoring & upgrade policy

The initial deployment is an **introductory pilot** on free plans. It does **not** provide enterprise-grade availability or backup guarantees. Allowances below were the published figures in the project specification — confirm current values on each provider's pricing page before relying on them.

| Service | Free allowance (as specified) | How the app stays within it | Where to monitor |
| --- | --- | --- | --- |
| GitHub Free | private repos, 2,000 Actions min/month | CI cancels superseded runs; jobs 3×/day; daily backup ≈ 2 min | Settings → Billing → Actions |
| Render Free | 750 instance-hours/workspace/month; sleeps after 15 min idle; ~1 min cold start; ephemeral disk; no SLA | single service; no keep-alive pings; nothing stored on disk | Render dashboard → service metrics |
| Neon Free | ~0.5–1 GB storage, 100 CU-hours/project/month, 6-hour restore window | pooled connections (`connection_limit=5`); efficient queries; compute auto-suspends | Neon console → Usage |
| Cloudflare R2 | 10 GB-month storage, 1M Class A, 10M Class B ops/month, free egress | photos compressed/resized; de-duplicated uploads; size limits; storage warning in-app | Admin → System Settings (storage); Cloudflare → R2 → Metrics |
| Resend Free | 3,000 emails/month, 100/day | outbox with priorities; last 20% of the daily quota reserved for security and financial mail; deferred not dropped; admin warnings at 80% | Admin → Email Management |

## Upgrade triggers (recommend to the school, never automatic)

- Neon storage approaching 1 GB or compute hours exhausted → Neon Launch plan.
- R2 above 10 GB → pay-as-you-go (~US$0.015/GB-month); configure the in-app storage warning below the limit.
- Email usage regularly above 80/day or 2,400/month (e.g. term-start registration, result publication) → Resend Pro.
- Cold starts or sleeping instances affecting school operations, or need for always-on availability → Render Starter instance (also enables zero-downtime deploys and pre-deploy commands).
- Need for longer point-in-time recovery than 6 hours → paid Neon plan (7–30 day history).

No paid plan is introduced without the school's written authorisation. Upgrades need no code changes — only plan changes and, for Render, optionally moving migrations to a pre-deploy command.

## Risk notice for the school

Before real student, parent, academic and financial records are entered, the school should confirm in writing that it understands: the portal may be slow after idle periods; the free hosting has no uptime guarantee; database point-in-time recovery is limited to 6 hours (daily encrypted backups mitigate this); email sending is capped daily; and storage beyond the free allowance is billed to the school.
