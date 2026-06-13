# AgendaMaster | DTCGC Portal

> **The ultimate command center for the Downtown Coquitlam Gavel Club.**

AgendaMaster is a comprehensive management platform designed to automate the operational overhead of the **Downtown Coquitlam Gavel Club (DTCGC)**. From automated role assignments to Google Sheets agenda generation, it is the club's definitive **Agenda Engine**.

---

## 🚀 Core Features

### 📅 Agenda Engine Wizard
- **Automated Generation**: One-click meeting agenda creation via Google Sheets integration.
- **Tiptap Editor**: A rich-text interface for fine-tuning meeting themes and details before generation.
- **Agenda Delivery (Gmail API)**: The designated Toastmaster sends the agenda email — with the generated Sheet link — from their **own Gmail account** via the Gmail API, BCC'd to all members and subscribers.

### 👥 Member & Role Management
- **Identity Verification**: Members provide their own name during a Profile Completion step after first sign-in, ensuring accurate club records even when using a parent's or shared Google account.
- **Automated Sequencing**: Intelligent role assignment based on historical participation and club-specific sequencing rules.
- **Guest Subscription**: Dedicated system for managing guest subscribers and converted members.
- **Admin Dashboard**: Centralized control for account approvals, inline name editing, role overrides, and meeting scheduling.
- **Mass Communications (Resend API)**: Admin broadcasts and account-approval notifications are delivered via the Resend API (BCC) to bypass server SMTP blocks.

### ☁️ Google Cloud Integration
- Deep integration with **Google Sheets API**, **Gmail API**, and **Google Drive API** for seamless cloud-based operations.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Database**: [Prisma 7](https://www.prisma.io/) with SQLite via the `better-sqlite3` driver adapter (optimized for low-overhead archival)
- **Authentication**: [NextAuth.js (Auth.js v5)](https://authjs.dev/) — Google OAuth 2.0 for members, hashed credentials for admins
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with [shadcn/ui](https://ui.shadcn.com/) components built on [Base UI](https://base-ui.com/) primitives
- **Rich Text**: [Tiptap](https://tiptap.dev/)
- **Email**: [Gmail API](https://developers.google.com/gmail/api) (agenda delivery) & [Resend](https://resend.com/) (admin broadcasts)
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
   Copy the example file and fill in your values (see the [Google Cloud Setup Guide](./docs/GOOGLE_CLOUD_SETUP.md) for the OAuth credentials):
   ```bash
   cp .env.example .env
   ```
   ```env
   DATABASE_URL="file:./dev.db"
   AUTH_SECRET="your-auth-secret"
   GOOGLE_CLIENT_ID="your-client-id"
   GOOGLE_CLIENT_SECRET="your-client-secret"
   RESEND_API_KEY="re_your_api_key"          # optional in dev — omit to mock-log emails
   RESEND_FROM_EMAIL="AgendaMaster <info@coquitlamgavel.com>"
   SEED_ADMIN_PASSWORD="choose-a-dev-admin-password"
   ```

4. **Initialize the Database**:
   The project uses Prisma's `db push` (no migration history) plus a seed script. This mirrors
   production, where the same commands run on every deploy.
   ```bash
   npx prisma db push
   npx tsx prisma/seed.ts
   ```

5. **Run the Development Server**:
   ```bash
   npm run dev
   ```

---

## 🚢 Deployment

AgendaMaster deploys to a **DigitalOcean Droplet** via a **GitHub Actions** push-to-deploy
pipeline. Full provisioning and operations instructions live in the dedicated guide:

➡️ **[Deployment Guide](./docs/DEPLOYMENT.md)**

---

## 📋 Status vs. Original Spec

The [original specification](./docs/spec-original.md) is preserved as a historical brief. The
shipped application diverges from it in a few notable ways:

- **Agenda email** is sent via the **Gmail API** (as the Toastmaster), not Resend. Resend is
  used only for admin broadcasts and approval notifications.
- **Meeting status** uses `SCHEDULED → ARCHIVED` (not the spec's `CANCELLED`/`COMPLETED`).
- **User roles** are `INCOMPLETE → PENDING → MEMBER`/`ADMIN` (plus a transient `DELETED`),
  rather than the spec's three-value enum.
- The admin **Archive** browsing view from the spec is **not yet implemented** (archival logic
  runs, but there is no dedicated archive page).
- Only the **Regular** meeting template is seeded; an `Education` template is not yet provided.
- The post-development **Discord bot** guide remains a pending task.

---

## 📖 Related Documentation
- [Deployment Guide](./docs/DEPLOYMENT.md) — DigitalOcean provisioning, CI/CD, PM2, and archival cron.
- [Google Cloud Setup Guide](./docs/GOOGLE_CLOUD_SETUP.md) — OAuth and API configuration.
- [Original Specification](./docs/spec-original.md) — the historical project brief.
- [Database Schema (Prisma)](./prisma/schema.prisma) — the data architecture.

---

*Downtown Coquitlam Gavel Club © 2023-2026*
</content>
