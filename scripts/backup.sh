#!/usr/bin/env bash
# Nightly encrypted database backup. Run from cron, e.g.:
#   30 1 * * *  cd /srv/mhf && ./scripts/backup.sh >> /var/log/mhf-backup.log 2>&1
# Needs: pg_dump, gpg, and the trust's backup public key imported (BACKUP_GPG_RECIPIENT).
# Object storage is protected separately by bucket versioning (see docs/RUNBOOK.md).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT is not set}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mhf}"
KEEP_DAYS="${KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
out="$BACKUP_DIR/mhf-$stamp.dump.gpg"

# Custom format (compressed, restorable table by table), encrypted before it touches disk.
pg_dump --format=custom --no-owner "$DATABASE_URL" \
  | gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$out"

# Refuse to record success for an empty or truncated file.
test "$(stat -c %s "$out")" -gt 1024

find "$BACKUP_DIR" -name 'mhf-*.dump.gpg' -mtime +"$KEEP_DAYS" -delete

# Shown on Settings → Backup and data.
psql "$DATABASE_URL" -q -c "INSERT INTO \"Setting\" (key, value, \"updatedAt\") VALUES ('backup.lastRunAt', to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, \"updatedAt\" = now();"

echo "$(date -Is) backup ok: $out"
