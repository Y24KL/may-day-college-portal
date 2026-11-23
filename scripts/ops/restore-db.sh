#!/usr/bin/env bash
# Restore an encrypted backup from R2 into TARGET_DATABASE_URL.
#   KEY=database-backups/daily/2026-11-23.dump.gpg TARGET_DATABASE_URL=... ./scripts/ops/restore-db.sh
# Never point TARGET_DATABASE_URL at production unless performing a planned
# disaster recovery (see docs/BACKUP_AND_RECOVERY.md).
set -euo pipefail
: "${TARGET_DATABASE_URL:?}" "${BACKUP_ENCRYPTION_KEY:?}" "${R2_ENDPOINT:?}" "${BACKUP_BUCKET:?}"
export AWS_DEFAULT_REGION=auto
KEY=${KEY:-$(aws s3 ls "s3://$BACKUP_BUCKET/database-backups/daily/" --endpoint-url "$R2_ENDPOINT" | awk '{print $4}' | sort | tail -1 | sed 's|^|database-backups/daily/|')}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
echo "Restoring $KEY"
aws s3 cp "s3://$BACKUP_BUCKET/$KEY" "$WORK/b.gpg" --endpoint-url "$R2_ENDPOINT" --only-show-errors
gpg --batch --yes --decrypt --passphrase-fd 3 -o "$WORK/b.dump" "$WORK/b.gpg" 3<<<"$BACKUP_ENCRYPTION_KEY"
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error -d "$TARGET_DATABASE_URL" "$WORK/b.dump"
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT
  (SELECT count(*) FROM "User") AS users,
  (SELECT count(*) FROM "Student") AS students,
  (SELECT count(*) FROM "Payment") AS payments,
  (SELECT count(*) FROM "ResultDetail") AS results,
  (SELECT count(*) FROM "_prisma_migrations") AS migrations;'
echo "Restore complete."
