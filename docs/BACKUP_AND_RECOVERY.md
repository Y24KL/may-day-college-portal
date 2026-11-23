# Backups & disaster recovery

## What is backed up

| Data | Mechanism | Frequency | Retention |
| --- | --- | --- | --- |
| PostgreSQL (all records) | `.github/workflows/database-backup.yml` → `scripts/ops/backup-db.sh`: `pg_dump` (custom format, compressed) streamed into **GPG AES-256** encryption, uploaded to R2 `database-backups/daily/` (+ `weekly/` on Sundays) | daily 02:30 Lagos + on demand | 7 daily, 4 weekly (pruned **only after** the new upload is verified by size) |
| PostgreSQL point-in-time | Neon instant restore | continuous | 6 hours on the Free plan |
| Uploaded files (R2) | `.github/workflows/files-backup.yml`: `aws s3 sync` to a separate bucket (deletions are not propagated) | weekly | until manually pruned |
| Source code | GitHub | every push | — |

Backups are **never** committed to GitHub or stored as Actions artifacts. The plaintext dump never touches disk. A failed backup fails the workflow (GitHub notifies repository admins) and emails `ADMIN_ALERT_EMAIL` via Resend.

The application never hard-deletes school files (`UploadedDocument.deletedAt` soft delete) and keeps superseded report cards, so most "lost file" cases are recoverable without a backup.

**Keep `BACKUP_ENCRYPTION_KEY` offline** (school safe / password manager, two custodians). Without it no backup can be restored.

## Restore testing

- `.github/workflows/restore-test.yml` runs on the 1st of every month (and on demand): downloads the latest daily backup, decrypts it, restores into a throwaway Postgres 17 container and prints row counts for key tables. A failure means backups are not trustworthy — investigate immediately.
- Also restore manually: at initial deployment, after every major migration, and at least monthly into a Neon branch, then sign in against it (see below).
- Locally verified during development: dump → encrypt → decrypt → `pg_restore` round trip restores all tables and row counts; a wrong passphrase is rejected.

## Restoring the database

### A. Recent mistake (within 6 hours) — Neon instant restore

Neon console → project → **Restore** → choose a timestamp before the incident → restore to a **new branch** first, inspect it, then promote/reset `main` from that branch. Update nothing in Render if the endpoint is unchanged.

### B. From an encrypted backup

Requires: PostgreSQL 17 client tools, `gpg`, AWS CLI, the backup R2 token and the encryption key.

```bash
export BACKUP_ENCRYPTION_KEY='…' R2_ENDPOINT='https://<acct>.r2.cloudflarestorage.com' BACKUP_BUCKET=maydaycollege-backups
export AWS_ACCESS_KEY_ID='…' AWS_SECRET_ACCESS_KEY='…'
# 1. Create an empty Neon branch/database to restore into (never restore over production first)
export TARGET_DATABASE_URL='postgresql://…/restore_check?sslmode=require'
# 2. Restore the latest daily backup (or set KEY=database-backups/weekly/2026-11-22.dump.gpg)
./scripts/ops/restore-db.sh
```

3. Point a temporary Render preview (or local `npm run start`) at `TARGET_DATABASE_URL`, sign in and spot-check students, results, payments.
4. Disaster recovery: put the portal in **maintenance mode** (Admin → System Settings) if it is reachable, restore into the production database (or promote the restored branch and update `DATABASE_URL`/`DIRECT_DATABASE_URL` on Render), redeploy, verify, then turn maintenance mode off.
5. Record the incident (what was lost between the backup time and the incident; re-enter payments from bank statements if needed).

## Recovering files

- **A single file deleted in the app:** it is soft-deleted; an administrator with database access can clear `deletedAt` on the `UploadedDocument` row.
- **Objects deleted from the bucket:** copy them back from the backup bucket:
  ```bash
  aws s3 sync s3://maydaycollege-files-backup/snapshot s3://maydaycollege-files --endpoint-url "$R2_ENDPOINT"
  ```
  (add `--exclude`/`--include` to restore specific prefixes, e.g. `--exclude "*" --include "report-cards/*"`).
- **Report cards:** can always be regenerated from published results (Admin → Report Cards → Regenerate); a new version is created and the verification code changes.

## Monitoring

- GitHub → Actions: Database backup (daily), Backup restore test (monthly), File storage backup (weekly) must be green.
- Admin → System Settings shows storage usage; Admin → Email Management shows email quota and failures.
- Neon console: storage (Free ≈ 0.5–1 GB, check current allowance) and compute hours.
