#!/usr/bin/env bash
# Nightly encrypted database backup. Run from cron, e.g.:
#   30 1 * * *  cd /srv/mhf && ./scripts/backup.sh >> /var/log/mhf-backup.log 2>&1
# Needs: pg_dump, gpg, and the trust's backup public key imported (BACKUP_GPG_RECIPIENT).
# Object storage is protected separately by bucket versioning (see docs/RUNBOOK.md).
set -euo pipefail
umask 077 # backups and anything else written here are owner-only

: "${DATABASE_URL:?DATABASE_URL is not set}"

# Keep the password off the command line (visible to every user via `ps`): strip it from the
# URL and hand it to libpq through PGPASSWORD, which only this process and its children see.
rest="${DATABASE_URL#*://}"
creds="${rest%@*}"
if [[ "$rest" == *@* && "$creds" == *:* ]]; then
  pw="${creds#*:}"
  PGPASSWORD="$(printf '%b' "${pw//%/\\x}")" # percent-decode
  export PGPASSWORD
  DB_URL="${DATABASE_URL%%://*}://${creds%%:*}@${rest##*@}"
else
  DB_URL="$DATABASE_URL"
fi
: "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT is not set}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mhf}"
KEEP_DAYS="${KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
out="$BACKUP_DIR/mhf-$stamp.dump.gpg"

# Custom format (compressed, restorable table by table), encrypted before it touches disk.
pg_dump --format=custom --no-owner "$DB_URL" \
  | gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$out"

# Refuse to record success for an empty or truncated file.
test "$(stat -c %s "$out")" -gt 1024

find "$BACKUP_DIR" -name 'mhf-*.dump.gpg' -mtime +"$KEEP_DAYS" -delete

# Shown on Settings → Backup and data.
psql "$DB_URL" -q -c "INSERT INTO \"Setting\" (key, value, \"updatedAt\") VALUES ('backup.lastRunAt', to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, \"updatedAt\" = now();"

echo "$(date -Is) backup ok: $out"
