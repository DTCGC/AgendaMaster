# Deployment Guide — AgendaMaster

AgendaMaster is deployed for high availability on a **DigitalOcean Droplet**, using **GitHub
Actions** for automated "push-to-deploy" updates.

> [!NOTE]
> The CI/CD pipeline contract (what gets built, what gets copied, how the database is synced)
> is owned by [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) and summarized
> for contributors in [`AGENTS.md`](../AGENTS.md). This guide covers one-time provisioning and
> operations; if the two ever disagree, the workflow file is the source of truth.

---

## 1. Initial Server Provisioning

Select a **Basic Droplet** with **Ubuntu 22.04 LTS** (1 GB RAM / 1 CPU).

### SSH access

Generate a dedicated deploy keypair on your own machine (do **not** commit private keys to the
repository):

```bash
ssh-keygen -t ed25519 -C "agendamaster-deploy" -f ./agendamaster_deploy
```

- Add the **public** key (`agendamaster_deploy.pub`) to the Droplet's `authorized_keys` during
  creation (or via `ssh-copy-id`).
- Keep the **private** key (`agendamaster_deploy`) off the repo; you'll paste its contents into
  the `SSH_PRIVATE_KEY` GitHub secret (see §3).

### Run these commands once on your Droplet

```bash
# 1. Update and install Node.js (via NVM)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 24

# 2. Install PM2 and Git
npm install -g pm2
sudo apt update && sudo apt install -y git nginx

# 3. Prepare Application Directories
sudo mkdir -p /var/www/agendamaster /var/www/data
sudo chown -R $USER:$USER /var/www/agendamaster /var/www/data

# 4. Clone and Setup Environment
cd /var/www/agendamaster
git clone https://github.com/DTCGC/AgendaMaster.git .
cp .env.example .env   # Then `nano .env` and set production values

# 5. Build Application
npm install
npx prisma generate
npm run build
```

---

## 2. Production Database Strategy

To prevent data loss during code updates, we use a persistent SQLite directory **outside** the
application folder:

- Set production `.env` to: `DATABASE_URL="file:/var/www/data/prod.db"`
- Because the database lives outside `/var/www/agendamaster`, it survives every deploy.
- The schema is synced with `prisma db push` (not migrations) — see §3. Keep schema changes
  **non-destructive**, or you risk wiping live club data.

---

## 3. CI/CD with GitHub Actions

Pushing to the `main` branch triggers
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). The pipeline builds on
GitHub's runner and rsyncs only the built artifacts (`​.next`, `public`, `node_modules`,
`package.json`, `ecosystem.config.js`, `prisma`) to the server, then runs `prisma db push` +
the seed script and reloads PM2.

### Required repository secrets

| Secret | Value |
|--------|-------|
| `DROPLET_IP` | Your Droplet's public IP address |
| `DROPLET_USER` | `root` (or your chosen username) |
| `SSH_PRIVATE_KEY` | Contents of the **private** deploy key you generated in §1 |

> [!IMPORTANT]
> **Environment variables:** if you add a new variable to `.env`, you MUST SSH into the Droplet
> and add it to `/var/www/agendamaster/.env` *before* pushing, or the production PM2 instance
> will crash on reload.

---

## 4. Process Management (PM2)

Production is managed by PM2 via [`ecosystem.config.js`](../ecosystem.config.js). To start it
for the first time:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

The ecosystem file pins `TZ=America/Vancouver`. Meeting dates are built in server-local time
(Fridays at 6:45 PM) and the crontab entries below are written in Pacific time, so the process
must run on Pacific time whatever the Droplet's own timezone is. The deploy reloads PM2 with
`--update-env` so changes to that `env` block take effect.

---

## 5. Nginx Reverse Proxy (optional, for IP-only access)

To serve the app on `http://<IP_ADDRESS>` directly:

```bash
sudo nano /etc/nginx/sites-available/default
```

Change the `location /` block:

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

Then run: `sudo systemctl restart nginx`

---

## 6. Automated Meeting Archival

Meetings are automatically moved from `SCHEDULED` to `ARCHIVED` status once their start time
(6:45 PM) has passed by 2 hours 15 minutes — i.e. at **9:00 PM Pacific Time** on meeting night.
This keeps the dashboard current.

To automate this on the Droplet, set up a system cron job:

1. Generate a secure secret and add it to `.env` as `CRON_SECRET`.
2. Run `crontab -e`.
3. Add the following entry (runs at 9:00 PM every Friday):
   ```
   0 21 * * 5 curl -X POST http://localhost:3000/api/cron/archive -H "Authorization: Bearer YOUR_SECRET"
   ```

---

## 7. Pre-Meeting Agenda Refresh

The database is the source of truth for the agenda, but the Toastmaster owns their Google Sheet
and could bump a cell by accident. To guarantee members see the right agenda, a cron job rewrites
today's sheet from the database at **6:30 PM Pacific** — 15 minutes before the 6:45 PM start.

- It only touches meetings **today** that **already have a sheet**. It never creates a sheet or
  sends an email.
- It authenticates as the service account (`GOOGLE_SERVICE_ACCOUNT_KEY` must be set).
- Any manual edit made directly on the sheet before 6:30 PM is reverted. Make changes in the app.

Add a second crontab entry (same `CRON_SECRET` as archival):

```
30 18 * * 5 curl -sS --fail -X POST http://localhost:3000/api/cron/refresh-agenda -H "Authorization: Bearer YOUR_SECRET" >> /var/log/agendamaster-refresh.log 2>&1
```

Check it with `curl -X POST http://localhost:3000/api/cron/refresh-agenda -H "Authorization: Bearer YOUR_SECRET"`.
The response lists each meeting's result; a `500` means at least one sheet failed.

---

## 8. Inbound Email Webhook

Mail sent to `info@coquitlamgavel.com` arrives through a Resend inbound webhook
(`POST /api/webhooks/email`) and is forwarded to the club's Gmail. Every delivery must carry a
valid Svix signature, made with the endpoint's signing secret:

1. In the Resend dashboard open **Webhooks**, select the endpoint, and copy its **Signing secret**
   (it starts with `whsec_`).
2. Add it to `/var/www/agendamaster/.env` on the Droplet as `RESEND_WEBHOOK_SECRET`, then
   `pm2 reload ecosystem.config.js --update-env`.

While the variable is missing the endpoint answers `503` and forwards nothing (Resend retries
failed deliveries for a while, so mail sent in the gap is not lost immediately).

The forward arrives in the club's Gmail as the original message: the sender's name, their subject
and their body, with Reply-To set to them. It is sent *from* `RESEND_FROM_EMAIL`'s address, because
Resend only sends from the verified domain.

---

## 9. Upload Size (Broadcast Attachments)

The Mass Broadcast page uploads attachments (up to 7 MB in total, `lib/email-limits.ts`) through a
server action. nginx refuses any request body over **1 MB** by default, answering `413` before the
app sees it, so the limit has to be raised once on the Droplet:

```bash
echo 'client_max_body_size 10m;' | sudo tee /etc/nginx/conf.d/upload-size.conf
sudo nginx -t && sudo systemctl reload nginx
```

`conf.d/` is included in nginx's `http` block on Ubuntu, so this applies to every site without
touching the Certbot-managed server block. Keep it at or above `serverActions.bodySizeLimit` in
`next.config.ts` (8 MB). Without it, broadcasts still work but any upload over 1 MB fails, and the
page says the upload was refused.

---

## 10. Resend Limits

`lib/email.ts` keeps every send inside Resend's limits; nothing needs configuring, but these
explain what the broadcast page reports:

- **Rate limit**: 10 requests/second per team. Requests are spaced 250 ms apart per PM2 worker,
  and a `429` is retried after the `retry-after` Resend names. Every request carries an
  idempotency key, so a retry never delivers twice.
- **Daily quota (free plan)**: 100 emails a day, reset at midnight UTC (5 PM Pacific in summer, 4 PM
  in winter). **Every recipient counts**, and so does every email received at `info@`. The page shows
  what a broadcast will use and refuses one that doesn't fit, rather than reaching half the club.
  Usage comes from Resend's `x-resend-daily-quota` response header, stored in the `Settings` table.
  On a paid plan (no daily quota), set `RESEND_DAILY_LIMIT=0` in `.env`; any other number
  overrides the 100.
- **Bounces**: Resend pauses accounts whose bounce rate passes 4%, so broadcasts drop malformed
  addresses and send each address once, compared case-insensitively.

---

## Related Documentation

- [README](../README.md) — project overview, features, and local setup.
- [Google Cloud Setup Guide](./GOOGLE_CLOUD_SETUP.md) — OAuth and API configuration.
- [Original Specification](./spec-original.md) — historical project brief.
</content>
</invoke>
