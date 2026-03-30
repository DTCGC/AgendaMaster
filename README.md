# AgendaMaster | DTCGC Portal

> **The ultimate command center for the Downtown Coquitlam Gavel Club.**

AgendaMaster is a comprehensive management platform designed to automate the operational overhead of the **Downtown Coquitlam Gavel Club (DTCGC)**. From heuristic-based role assignments to automated Google Sheets agenda generation, it is the club's definitive command center.

---

## 🚀 Core Features

### 📅 Agenda Wizard
- **Automated Generation**: One-click meeting agenda creation via Google Sheets integration.
- **Tiptap Editor**: A rich-text interface for fine-tuning meeting themes and details before generation.
- **Gmail Automation**: Automated meeting notifications and agenda delivery for Toastmasters and members.

### 👥 Member & Role Matrix
- **Heuristic Sequencing**: Intelligent role assignment based on historical participation and club-specific sequencing rules.
- **Guest Subscription**: Dedicated system for managing guest subscribers and converted members.
- **Admin Dashboard**: Centralized control for account approvals, role overrides, and meeting scheduling.

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
   EMAIL_USER="coquitlamgavel@gmail.com"
   EMAIL_PASS="your-gmail-app-password"
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

## 🚢 Modern Deployment (DigitalOcean Droplet)

This project is optimized for deployment on a **DigitalOcean Droplet** using a modern **GitHub Actions** CI/CD pipeline for effortless "Push to Deploy" updates.

### 1. Droplet Preparation
- Ensure **Node.js**, **NPM**, and **PM2** are installed on your droplet.
- Set up your application directory and `.env` file manually once.

### 2. GitHub Actions Setup
The following workflow can be added to `.github/workflows/deploy.yml` to automate deployments:

```yaml
name: Deploy to Droplet

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: SSH Deploy
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.DROPLET_IP }}
          username: ${{ secrets.DROPLET_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /path/to/your/app
            git pull origin main
            npm install
            npx prisma generate
            npm run build
            pm2 restart AgendaMaster
```

### 3. Required GitHub Secrets
Add these secrets in your GitHub Repository under **Settings → Secrets and variables → Actions**:
- `DROPLET_IP`: The public IP of your DigitalOcean Droplet.
- `DROPLET_USER`: Your SSH username (usually `root`).
- `SSH_PRIVATE_KEY`: Your private SSH key (corresponding to the public key in your Droplet's `authorized_keys`).

---

## 📖 Related Documentation
- [Google Cloud Configuration Guide](./google_cloud_setup.md) — Detailed steps for OAuth and API setup.
- [Database Schema (Prisma)](./prisma/schema.prisma) — Explore the data architecture.

---

*Downtown Coquitlam Gavel Club © 2023-2026*
