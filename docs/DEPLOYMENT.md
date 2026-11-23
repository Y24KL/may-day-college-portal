# Deployment

Target architecture (all free tiers initially): **GitHub** (private repo, CI/CD, scheduled jobs, backups) → **Render** (one Node web service) → **Neon** (PostgreSQL) + **Cloudflare R2** (private files & encrypted backups) + **Resend** (email) + the school's own domain.

Account creation and DNS changes require the school's authorisation and logins; they are listed step by step below. Nothing in this document has been done automatically.

## 1. GitHub

1. Repository: `may-day-college-portal`, **private**, ideally owned by a May Day College organization (transfer it there if it currently lives under an individual account: Settings → Danger zone → Transfer). The developer is added as a collaborator.
2. Branches: `main` = production, `development` = integration branch. Create `development` from `main`.
3. Branch protection (Settings → Branches → Add rule for `main`): require a pull request, require status checks **Lint, types & unit tests**, **Integration tests & migration validation**, **Production build & end-to-end tests**, **Dependency security**; block force pushes. A similar rule (checks only) is recommended for `development`.
4. Settings → Environments → create **production**, restrict deployments to `main`, add the secrets/variables in [ENVIRONMENT.md](ENVIRONMENT.md#github-actions).
5. Dependabot is configured in `.github/dependabot.yml` (targets `development`; major upgrades are handled manually). Enable Dependabot alerts and secret scanning under Settings → Code security.
6. GitHub Free includes 2,000 Actions minutes/month for private repos. Expected use: CI ≈ 10–14 min per push, backups ≈ 2 min/day, jobs ≈ 1 min/day, restore test ≈ 3 min/month. Monitor Settings → Billing.

## 2. Neon (PostgreSQL)

1. Create project **may-day-college-production**, region **AWS eu-central-1 (Frankfurt)** (closest to Render Frankfurt), Postgres 17.
2. Copy two connection strings: the **pooled** one (host contains `-pooler`) → `DATABASE_URL` (append `&pgbouncer=true&connection_limit=5`), and the **direct** one → `DIRECT_DATABASE_URL`. Both use `sslmode=require`.
3. Optional but recommended: a separate read-only role for backups (`GRANT pg_read_all_data`), used as the GitHub `DIRECT_DATABASE_URL` secret.
4. Do **not** use Render's free PostgreSQL for school data — it expires after 30 days and has no backups.

Migrations: `render.yaml` runs `npx prisma migrate deploy` during each build. Migrations are version-controlled in `prisma/migrations`; CI verifies they apply to an empty database and match `schema.prisma`. Never run `prisma db push` or `migrate reset` against production. Test each new migration against a Neon **branch** (Neon → Branches → create from main) before merging.

## 3. Cloudflare R2

1. R2 → Create bucket **maydaycollege-files** (location hint: Western Europe). Keep **public access disabled** (no r2.dev URL, no custom domain).
2. Create a bucket for backups, e.g. **maydaycollege-backups** (recommended), and optionally **maydaycollege-files-backup** for the weekly file copy.
3. R2 → Manage API tokens:
   - app token: *Object Read & Write*, scoped to `maydaycollege-files` → `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` on Render;
   - backup token: *Object Read & Write*, scoped to the backup bucket(s) (+ read on files bucket for the file sync) → GitHub `BACKUP_R2_*` secrets.
4. `R2_ENDPOINT` = `https://<account_id>.r2.cloudflarestorage.com`.
5. No CORS configuration is needed: uploads go through the server; downloads are 5-minute signed URLs.

## 4. Resend (email)

1. Add the domain `maydaycollege.com.ng` (or a subdomain such as `mail.maydaycollege.com.ng`).
2. Add the DNS records Resend shows (SPF `TXT`, DKIM `TXT`/`CNAME`, and the bounce `MX`) at the school's DNS provider, then **Verify**.
3. Add DMARC: `TXT _dmarc.maydaycollege.com.ng  "v=DMARC1; p=none; rua=mailto:dmarc@maydaycollege.com.ng"` — move to `p=quarantine` after a few weeks of clean reports.
4. Create an API key with *Sending access* for that domain → `RESEND_API_KEY`. Set `EMAIL_FROM`.
5. The app uses the HTTPS API (Render free services block outbound SMTP).

## 5. Render

1. Render → New → **Blueprint** → connect the GitHub repository; Render reads `render.yaml` (service `may-day-college-portal`, Node, Free plan, Frankfurt, health check `/api/health`, `autoDeploy: false`).
2. Fill every `sync: false` variable (see [ENVIRONMENT.md](ENVIRONMENT.md)). `AUTH_SECRET` and `CRON_SECRET` are generated — copy `CRON_SECRET` into GitHub's `CRON_SECRET` secret.
3. Settings → **Deploy Hook** → copy URL into GitHub secret `RENDER_DEPLOY_HOOK_URL`.
4. First deploy: trigger manually from Render (or merge to `main`). The build installs, generates Prisma client, applies migrations, bootstraps roles/permissions and builds.
5. Visit `https://<service>.onrender.com/api/health` → `{"status":"ok","database":"up","storage":"r2","email":"resend"}`.

### Deploy flow

push to `development` → CI → pull request to `main` → review → merge → `deploy.yml` re-runs CI, calls the deploy hook, waits for `/api/health`. If unhealthy: Render → Deploys → previous successful deploy → **Rollback**. Because migrations are additive, a rollback of code does not require a database rollback; destructive schema changes must be split into expand/contract releases.

### Free-tier behaviour

Free instances sleep after 15 minutes without traffic and take up to ~1 minute to wake; the first request after idle is slow (the sign-in page says so, and forms show a friendly retry message if the server is unreachable). The filesystem is ephemeral — the app stores nothing on it. No keep-alive pings are used; the only scheduled traffic is real background work 3×/day.

## 6. Domain & HTTPS

1. The school registers `maydaycollege.com.ng` (paid by the school; renew annually).
2. Render → Settings → Custom Domains → add `portal.maydaycollege.com.ng`.
3. At the DNS provider: `CNAME portal → <service>.onrender.com` (Render shows the exact target). Remove conflicting `AAAA` records.
4. Render issues the TLS certificate automatically; confirm it shows **Verified/Issued**, then set `APP_BASE_URL=https://portal.maydaycollege.com.ng` and redeploy.
5. HSTS and other security headers are sent by the app (`next.config.ts`).

## 7. First-run setup

1. Set `SETUP_TOKEN`, open `/setup`, create the Super Administrator (or run `npm run setup:admin` from Render Shell). Remove `SETUP_TOKEN`.
2. Follow the checklist on the admin overview: classes & sectors → session & terms (set current) → subjects & offerings → grading & score allocation → fees & bank details → registration windows → bell schedule & timetables → school information & logo.
3. Create other administrators with appropriate roles (Admin → User Permissions).

## Go-live checklist

Before entering **real** student, parent, academic or financial data:

- [ ] All CI checks green on `main`; security tests reviewed ([TESTING.md](TESTING.md))
- [ ] Access restrictions verified on production with test accounts (then delete them)
- [ ] Encrypted backup workflow run manually and succeeded (object visible in R2)
- [ ] **Restore test** workflow succeeded (and one manual restore into a Neon branch)
- [ ] File recovery tested (download an object from the files backup bucket)
- [ ] Verification, password-reset and payment emails received at real inboxes; SPF/DKIM pass
- [ ] Custom domain on HTTPS; `APP_BASE_URL` updated
- [ ] `SETUP_TOKEN` removed; `BACKUP_ENCRYPTION_KEY` stored offline by the school
- [ ] The school has acknowledged the free-tier limitations in [FREE_TIER.md](FREE_TIER.md) in writing
- [ ] No demo data in production (`npm run db:seed:demo` refuses non-local databases)

## Handover items

| Item | Where |
| --- | --- |
| GitHub repository URL | the repository page (must be private) |
| Render application URL | Render service page; `https://portal.maydaycollege.com.ng` after DNS |
| Domain/DNS instructions | §6 above |
| Neon / R2 / Resend setup | §2–4 |
| Environment checklist | [ENVIRONMENT.md](ENVIRONMENT.md) |
| Backup & recovery | [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) |
| Deployment & updates | this document |
| Administrator guide | [ADMIN_GUIDE.md](ADMIN_GUIDE.md) |
