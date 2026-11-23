# Environment variables

Set these in the **Render dashboard** (service → Environment) for production, and in `.env` locally (copy `.env.example`). Never commit real values.

## Application (Render web service)

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` on Render (set by `render.yaml`) |
| `DATABASE_URL` | yes | Neon **pooled** connection string, e.g. `postgresql://USER:PASS@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=5` |
| `DIRECT_DATABASE_URL` | yes | Neon **direct** (non-pooler) connection string — used by `prisma migrate deploy` |
| `AUTH_SECRET` | yes | ≥32 random characters (`openssl rand -base64 48`). Keys token/OTP hashing. Rotating it invalidates all sessions and outstanding reset/verification links |
| `APP_BASE_URL` | yes | Public URL, e.g. `https://portal.maydaycollege.com.ng` (emails, QR codes) |
| `SETUP_TOKEN` | first deploy only | ≥16 chars; enables `/setup` to create the first Super Administrator. **Delete it afterwards** (setup is also disabled once a Super Admin exists) |
| `CRON_SECRET` | yes | Random string; must equal the GitHub `CRON_SECRET` secret |
| `RESEND_API_KEY` | yes | Resend API key (Sending access, restricted to the school domain) |
| `EMAIL_FROM` | yes | e.g. `May Day College <no-reply@maydaycollege.com.ng>` (domain must be verified in Resend) |
| `ADMIN_ALERT_EMAIL` | recommended | Receives operational alerts (quota warnings) |
| `R2_ACCOUNT_ID` | yes | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | yes | R2 API token with **Object Read & Write** on the files bucket only |
| `R2_BUCKET_NAME` | yes | `maydaycollege-files` |
| `R2_ENDPOINT` | yes | `https://<account_id>.r2.cloudflarestorage.com` |
| `PORT` | auto | Provided by Render; `npm start` listens on it |

Development-only: `LOCAL_STORAGE_DIR` (private folder used when R2 is not configured), `ALLOW_LOCAL_STORAGE=true` (forces local storage in a production build — for CI only; never on Render, whose disk is ephemeral).

If `RESEND_API_KEY` is missing in production, emails stay queued (visible in **Admin → Email Management**) and are not reported as sent. If R2 is missing in production, uploads are refused with a clear message.

## GitHub Actions

Repository → Settings → **Environments → `production`** (restrict to the `main` branch):

| Name | Type | Used by |
| --- | --- | --- |
| `RENDER_DEPLOY_HOOK_URL` | secret | deploy.yml (Render → Settings → Deploy Hook) |
| `CRON_SECRET` | secret | scheduled-jobs.yml |
| `DIRECT_DATABASE_URL` | secret | database-backup.yml (use a **read-only** Neon role if possible) |
| `BACKUP_ENCRYPTION_KEY` | secret | backup + restore test. Long random passphrase. **Store a copy offline** (school safe/password manager) — backups cannot be decrypted without it |
| `R2_ENDPOINT` | secret | backups |
| `BACKUP_R2_ACCESS_KEY_ID` / `BACKUP_R2_SECRET_ACCESS_KEY` | secret | a **separate** R2 token scoped to the backup bucket(s) |
| `RESEND_API_KEY` | secret | backup failure alert email |
| `APP_BASE_URL` | variable | deploy health check, scheduled jobs |
| `ADMIN_ALERT_EMAIL`, `EMAIL_FROM` | variable | backup failure alert |
| `BACKUP_BUCKET` | variable | defaults to `maydaycollege-files` (prefix `database-backups/`); a separate bucket is recommended |
| `R2_BUCKET_NAME`, `FILES_BACKUP_BUCKET` | variable | weekly file-storage backup |

CI itself needs no secrets — it uses throwaway Postgres containers and demo data.
