# Runbook — MHF Aid

For whoever keeps the system running. Commands assume the app is deployed in `/srv/mhf`.

## 1. Services

| Service | What | Where |
|---|---|---|
| App | Next.js (`pnpm build && pnpm start`, port 3100) | behind a reverse proxy with HTTPS |
| Database | PostgreSQL 16 | `DATABASE_URL` |
| Documents | S3-compatible bucket, **private**, versioning **on** | `S3_*` variables |

The proxy must pass the client address in `X-Real-IP`, overwriting whatever the client sent. The
audit log and the per-IP sign-in limit read it (failing that, the right-most `X-Forwarded-For`
entry). nginx:

```nginx
proxy_set_header X-Real-IP       $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

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
| Locked out (5 wrong passwords, at sign-in or when re-entering a password) | Wait 15 minutes, or the super admin resets the password |
| Password reset by the admin | The owner must choose a new one at next sign-in (sidebar → Change password any time). A reset or deactivation signs that account out everywhere |
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
SEED_ADMIN_PASSWORD='<at least 10 chars, not the README one>' pnpm db:seed
```

With `NODE_ENV=production` the seed refuses to create users without `SEED_ADMIN_PASSWORD`; the public demo
password `Mhf@2026!` is for local development only. Every seeded account starts with
`SEED_ADMIN_PASSWORD` and is sent to **Change password** at first sign-in.

After seeding production: sign in as the admin and set a personal password, then deactivate the
demo accounts you do not need and create real ones; replace the demo area list (Settings → Masters); set the
organisation details and the 80G number if the trust has one (Settings → Organisation).

## 7. If something looks wrong

- **A page shows an error**: nothing was changed. The server log has the error class — never the
  data. Note the time and the case number.
- **Numbers look off on the dashboard**: balances are computed live from the ledger; compare
  with Reports → Fund statement for the same year. There is no stored total to drift.
- **A document will not open**: signed links last 5 minutes; reopen it from the case. If the
  storage service is down, cases still open, only document previews fail.

## 8. Security notes

- **Uploaded PDFs are stored exactly as received** (images are re-encoded, PDFs are not). Open
  them in the browser preview or download them; do not open them in Adobe Reader, which runs
  embedded scripts.
- **Object storage gets its own hostname** (e.g. `files.example.org`), never a path on the app's
  origin. A file served from the app's origin could run script as the app. `S3_ENDPOINT` must be
  that hostname as the browser reaches it (signed links are built on it); the app's
  Content-Security-Policy allows previews only from it.
- **HSTS**: the app sends `Strict-Transport-Security`; set the same header at the reverse proxy
  too, so redirects and error pages the proxy serves itself carry it.
- **Rate limits**: add a per-IP limit at the proxy for `/login` (sign-in attempts) and
  `/api/export` (heavy reports), e.g. nginx `limit_req` at ~10 requests/minute per IP.
