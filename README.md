# AgendaMaster | DTCGC Portal

> **The ultimate command center for the Downtown Coquitlam Gavel Club.**

AgendaMaster is a comprehensive management platform designed to automate the operational overhead of the **Downtown Coquitlam Gavel Club (DTCGC)**. From automated role assignments to Google Sheets agenda generation, it is the club's definitive **Agenda Engine**.

---

## 🚀 Core Features

### 📅 Agenda Engine Wizard
- **Automated Generation**: One-click meeting agenda creation via Google Sheets integration.
- **Tiptap Editor**: A rich-text interface for fine-tuning meeting themes and details before generation.
- **Email Automation**: Automated meeting notifications and agenda delivery for Toastmasters and members via the Resend API.

### 👥 Member & Role Management
- **Identity Verification**: Members provide their own name during a Profile Completion step after first sign-in, ensuring accurate club records even when using a parent's or shared Google account.
- **Automated Sequencing**: Intelligent role assignment based on historical participation and club-specific sequencing rules.
- **Guest Subscription**: Dedicated system for managing guest subscribers and converted members.
- **Admin Dashboard**: Centralized control for account approvals, inline name editing, role overrides, and meeting scheduling.

### ☁️ Google Cloud Integration
- Deep integration with **Google Sheets API**, **Gmail API**, and **Google Drive API** for seamless cloud-based operations.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router)
- **Database**: [Prisma](https://www.prisma.io/) with SQLite (Optimized for low-overhead archival)
- **Authentication**: [NextAuth.js](https://next-auth.js.org/) (Google OAuth 2.0)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [Shadcn/UI](https://ui.shadcn.com/)
- **Rich Text**: [Tiptap](https://tiptap.dev/)
- **Fonts**: [Montserrat](https://fonts.google.com/specimen/Montserrat)

---

## ⚙️ Local Setup

1. **Clone the Repo**:
   ```bash
   git clone https://github.com/DTCGC/AgendaMaster.git
   cd AgendaMaster
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Environment Variables**:
   Create a `.env` file based on the [Google Cloud Setup Guide](./google_cloud_setup.md):
   ```env
   DATABASE_URL="file:./dev.db"
   AUTH_SECRET="your-auth-secret"
   GOOGLE_CLIENT_ID="your-client-id"
   GOOGLE_CLIENT_SECRET="your-client-secret"
   RESEND_API_KEY="re_your_api_key"
   RESEND_FROM_EMAIL="AgendaMaster <info@coquitlamgavel.com>"
   ```

4. **Initialize Database**:
   ```bash
   npx prisma migrate dev
   ```

5. **Run Development Server**:
   ```bash
   npm run dev
   ```

---

## 🚢 Modern Deployment (DigitalOcean Droplet via GitHub Actions)

AgendaMaster is designed for high-availability deployment on a **DigitalOcean Droplet** using **GitHub Actions** for automated "Push to Deploy" updates.

### 1. Initial Server Provisioning
Select a **Basic Droplet** with **Ubuntu 22.04 LTS** (1GB RAM / 1 CPU). 

> [!IMPORTANT]
> **SSH Access**: Use the provided `AgendaMaster` private key (found in the repository root) to access your Droplet. Add the contents of `AgendaMaster.pub` to the Droplet's `authorized_keys` during creation.

#### Run these commands once on your Droplet:
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
cp .env.example .env # Then nano .env and set production values

# 5. Build Application
npm install
npx prisma generate
npm run build
```

### 2. Production Database Strategy
To prevent data loss during code updates, we use a persistent SQLite directory:
- Update your production `.env` to: `DATABASE_URL="file:/var/www/data/prod.db"`
- Prisma will automatically manage this file outside of the app folder.

### 3. CI/CD with GitHub Actions
Pushing to the `main` branch will trigger `.github/workflows/deploy.yml`. 

#### Define these Repository Secrets in GitHub:
- `DROPLET_IP`: Your Droplet's public IP address.
- `DROPLET_USER`: `root` (or your chosen username).
- `SSH_PRIVATE_KEY`: The contents of the `AgendaMaster` file in the root.

### 4. Process Management (PM2)
The app is managed by `ecosystem.config.js`. To start it for the first time:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5. Nginx Reverse Proxy (Optional for IP-only)
To access the app via `http://<IP_ADDRESS>` directly:
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

### 6. Automated Meeting Archival
Meetings are automatically moved from "Scheduled" to "Archived" status 2 hours and 15 minutes after their start time (at 9:00 PM Pacific Time). This ensures the dashboard remains current.

To automate this on your Droplet, set up a system cron job:
1. Generate a secure secret and add it to your `.env` as `CRON_SECRET`.
2. Run `crontab -e`.
3. Add the following entry (runs at 9:00 PM every Friday):
   `0 21 * * 5 curl -X POST http://localhost:3000/api/cron/archive -H "Authorization: Bearer YOUR_SECRET"`

---

## 📖 Related Documentation
- [Google Cloud Configuration Guide](./google_cloud_setup.md) — Detailed steps for OAuth and API setup.
- [Database Schema (Prisma)](./prisma/schema.prisma) — Explore the data architecture.

---

*Downtown Coquitlam Gavel Club © 2023-2026*
