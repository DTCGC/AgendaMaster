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
nvm install 20

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

## Related Documentation

- [README](../README.md) — project overview, features, and local setup.
- [Google Cloud Setup Guide](./GOOGLE_CLOUD_SETUP.md) — OAuth and API configuration.
- [Original Specification](./spec-original.md) — historical project brief.
</content>
</invoke>
