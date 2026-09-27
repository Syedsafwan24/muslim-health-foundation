# Runbook — MHF Aid

For whoever keeps the system running. Commands assume the app is deployed in `/srv/mhf`.

## 1. Services

| Service | What | Where |
|---|---|---|
| App | Next.js (`pnpm build && pnpm start`, port 3100) | behind a reverse proxy with HTTPS |
| Database | PostgreSQL 16 | `DATABASE_URL` |
| Documents | S3-compatible bucket, **private**, versioning **on** | `S3_*` variables |

Environment variables are listed in `.env.example`. Two are secrets that must be backed up
**separately from the database backup**, somewhere the trustees control (sealed envelope or a
password manager):

- `ID_ENCRYPTION_KEY` — without it, stored government ID numbers cannot be decrypted. Ever.
- The **private** GPG key for `BACKUP_GPG_RECIPIENT` — without it, backups cannot be restored.

`AUTH_SECRET` can be regenerated at any time; everyone simply signs in again.

## 2. Nightly backup

`scripts/backup.sh` dumps the database (`pg_dump --format=custom`), encrypts it with GPG before
it touches disk, keeps 30 days, and records the time on **Settings → Backup and data**. The page
turns red if no backup has been recorded for 36 hours.

```bash
# one-time: import the trust's backup PUBLIC key on the server
gpg --import mhf-backup-public.asc

# cron (as the app user)
30 1 * * *  cd /srv/mhf && DATABASE_URL=... BACKUP_GPG_RECIPIENT=backup@mhf \
            ./scripts/backup.sh >> /var/log/mhf-backup.log 2>&1
```

Copy `/var/backups/mhf` off the server daily (rclone to a second provider, or a USB drive the
trustees rotate). A backup that lives only on the server is not a backup.

Documents: enable **object versioning** on the bucket (R2: bucket settings → Object versioning;
MinIO/RustFS: `mc version enable`). The app never deletes objects — removing a document is a
soft delete — so versioning protects against operator error at the storage layer.

## 3. Restore (test this before go-live, then every 6 months)

```bash
# on a machine that holds the backup PRIVATE key
gpg --decrypt mhf-20261012-013000.dump.gpg > mhf.dump

# into an EMPTY database
createdb mhf_restore
pg_restore --no-owner --dbname "postgresql://.../mhf_restore" mhf.dump

# point a copy of the app at it and check: sign in, open a case, open a document,
# compare the dashboard totals with the live system for the same fiscal year
```

Record the date and result of each restore test in the committee minutes.

## 4. Routine tasks

| Task | How |
|---|---|
| New staff member | Settings → Users and roles → Add user (super admin, needs your password) |
| Someone leaves | Edit the user → untick **Active**. Never delete — their audit history stays attached |
| Locked out (5 wrong passwords) | Wait 15 minutes, or the super admin resets the password |
| Committee meeting | Meetings → Schedule meeting → Add cases → **Present** on the projector |
| Visitor or auditor browsing | Settings → Privacy → *Accounts that always see hidden identities* |
| New fund (e.g. a non-Zakat admin fund) | Funds → Add fund. Once two funds are active, fund selectors appear everywhere |

## 5. Deploy an update

```bash
cd /srv/mhf
git pull
pnpm install --frozen-lockfile
pnpm db:deploy          # applies new migrations; never edit an applied migration
pnpm build
systemctl restart mhf   # or pm2 restart mhf
```

Run `./scripts/backup.sh` by hand before any deploy that includes a migration.

## 6. First production start

```bash
pnpm db:deploy
pnpm db:seed            # masters + one demo user per role — then change every password
```

After seeding production: sign in as each demo user and change the password, or deactivate the
demo accounts and create real ones; replace the demo area list (Settings → Masters); set the
organisation details and the 80G number if the trust has one (Settings → Organisation).

## 7. If something looks wrong

- **A page shows an error**: nothing was changed. The server log has the error class — never the
  data. Note the time and the case number.
- **Numbers look off on the dashboard**: balances are computed live from the ledger; compare
  with Reports → Fund statement for the same year. There is no stored total to drift.
- **A document will not open**: signed links last 5 minutes; reopen it from the case. If the
  storage service is down, cases still open, only document previews fail.
