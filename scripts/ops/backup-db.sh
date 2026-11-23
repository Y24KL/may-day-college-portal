#!/usr/bin/env bash
# Encrypted PostgreSQL backup → Cloudflare R2.
# Required env: DIRECT_DATABASE_URL, BACKUP_ENCRYPTION_KEY, R2_ENDPOINT,
#               AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, BACKUP_BUCKET
set -euo pipefail
: "${DIRECT_DATABASE_URL:?}" "${BACKUP_ENCRYPTION_KEY:?}" "${R2_ENDPOINT:?}" "${BACKUP_BUCKET:?}"
export AWS_DEFAULT_REGION=auto
STAMP=$(date -u +%Y-%m-%dT%H%MZ)
DAY=$(date -u +%Y-%m-%d)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
OUT="$WORK/mdc-$STAMP.dump.gpg"

# Custom-format dump (compressed), streamed straight into encryption — the
# plaintext dump never touches disk.
pg_dump --format=custom --compress=9 --no-owner --no-privileges "$DIRECT_DATABASE_URL" \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-fd 3 -o "$OUT" 3<<<"$BACKUP_ENCRYPTION_KEY"

SIZE=$(stat -c %s "$OUT")
if [ "$SIZE" -lt 1024 ]; then echo "Backup suspiciously small ($SIZE bytes)"; exit 1; fi
SHA=$(sha256sum "$OUT" | cut -d' ' -f1)

aws s3 cp "$OUT" "s3://$BACKUP_BUCKET/database-backups/daily/$DAY.dump.gpg" --endpoint-url "$R2_ENDPOINT" --only-show-errors --metadata "sha256=$SHA"
if [ "$(date -u +%u)" = "7" ]; then
  aws s3 cp "$OUT" "s3://$BACKUP_BUCKET/database-backups/weekly/$DAY.dump.gpg" --endpoint-url "$R2_ENDPOINT" --only-show-errors --metadata "sha256=$SHA"
fi

# Verify the upload before ANY cleanup.
REMOTE=$(aws s3api head-object --bucket "$BACKUP_BUCKET" --key "database-backups/daily/$DAY.dump.gpg" --endpoint-url "$R2_ENDPOINT" --query ContentLength --output text)
if [ "$REMOTE" != "$SIZE" ]; then echo "Uploaded size mismatch ($REMOTE vs $SIZE)"; exit 1; fi
echo "Backup uploaded: $DAY ($SIZE bytes, sha256 $SHA)"

# Retention: keep ≥7 daily and ≥4 weekly. Only prune when enough recent backups exist.
prune() {
  local prefix=$1 keep=$2
  mapfile -t keys < <(aws s3 ls "s3://$BACKUP_BUCKET/database-backups/$prefix/" --endpoint-url "$R2_ENDPOINT" | awk '{print $4}' | grep '\.dump\.gpg$' | sort)
  local n=${#keys[@]}
  if [ "$n" -le "$keep" ]; then echo "$prefix: $n backups kept (≤ $keep)"; return; fi
  for k in "${keys[@]:0:$((n-keep))}"; do
    aws s3 rm "s3://$BACKUP_BUCKET/database-backups/$prefix/$k" --endpoint-url "$R2_ENDPOINT" --only-show-errors
    echo "pruned $prefix/$k"
  done
}
prune daily 7
prune weekly 4
