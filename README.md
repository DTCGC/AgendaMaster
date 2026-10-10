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
- **Members Without Google**: The rare member who cannot use any Google account can register with an email and password at `/signup` (linked quietly from the login page next to a link to Google's own “create a Google account” help page, behind a notice that steers them back to Google). They sign in through the same **Email & Password** form the admin uses, then go through the same name entry and admin approval. When such a member is Toastmaster, their agenda sheet is created in — and the agenda email sent from — the club's Google account (`coquitlamgavel@gmail.com`, with Reply-To set to the member); later updates go through the service account. An admin connects the club account once from **Member Management** (see the [Google Cloud Setup Guide](./docs/GOOGLE_CLOUD_SETUP.md#step-7-connect-the-club-google-account-members-without-google)). There is no password reset: an admin removes the account and the member registers again.
- **Automated Sequencing**: Intelligent role assignment based on historical participation and club-specific sequencing rules.
- **Major Role Assignment**: The admin Role Management dropdowns list members by the date of their last *major* role (oldest first, never-had first); minor roles and standby duty don't count. A meeting's **Backup Speaker** is automatically given a random open Speaker 1–3 slot at the next scheduled meeting.
- **Agenda Changelog**: Every update to an agenda sheet appends one timestamped line per changed role (`[Oct 9, 6:44 PM] Grammarian: Franklin ---> Evangeline`) under the sheet's CHANGELOG header. The log is cumulative: nothing already there is removed.
- **Guest Subscription**: Dedicated system for managing guest subscribers and converted members.
- **Admin Dashboard**: Centralized control for account approvals, inline name editing, role overrides, and meeting scheduling.
- **Admin Agenda Editing**: Admins can open any upcoming meeting's roster in the wizard's update mode and push changes to the existing agenda sheet. Since the admin login has no Google identity, those sheet updates authenticate as a **Google service account** (`GOOGLE_SERVICE_ACCOUNT_KEY`), which the app automatically grants Editor access on every newly created sheet. Sheets created before this feature must be shared with the service account manually once.
- **Mass Communications (Gmail API)**: Admin broadcasts and account-approval notifications are sent from the club's Gmail (`coquitlamgavel@gmail.com`) through the Gmail API, as the club Google account connected on Member Management. Broadcasts go out as one email with every recipient in BCC. Broadcasts can carry **attachments** (photos, PDFs, documents; 7 MB in total so no inbox bounces them), **links**, and **link preview cards**, the email-safe form of an embed: the page's picture, title and summary, fetched server-side behind an SSRF guard. See [Email](./docs/DEPLOYMENT.md#8-email) for Gmail's limits. Uploads over 1 MB need nginx's body limit raised once ([Upload Size](./docs/DEPLOYMENT.md#9-upload-size-broadcast-attachments)).

### 📖 Tutorial
- **In-app Tutorial (`/tutorial`)**: A plain-language, illustrated guide linked from the top navigation, the landing page, the login page, the Toastmaster's dashboard card and the wizard's "How do I write the email?" link. The **Getting Started** part (what the app is, creating an account, the parents' guest mailing list) is public, so people can read it before they have an account. The **Toastmaster** and **Meeting Day** parts are rendered only for approved members (MEMBER/ADMIN), so they are never sent to anyone else.
- **Screenshots** live in `app/tutorial/screenshots/` and show only made-up demo members. They are produced by [`scripts/tutorial-screenshots`](./scripts/tutorial-screenshots/README.md) against a throwaway demo database. Re-run it when a screen the tutorial shows changes.

### ☁️ Google Cloud Integration
- Deep integration with **Google Sheets API**, **Gmail API**, and **Google Drive API** for seamless cloud-based operations.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Database**: [Prisma 7](https://www.prisma.io/) with SQLite via the `better-sqlite3` driver adapter (optimized for low-overhead archival)
- **Authentication**: [NextAuth.js (Auth.js v5)](https://authjs.dev/) — Google OAuth 2.0 for members, hashed email/password credentials for admins and the few members without Google
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with [shadcn/ui](https://ui.shadcn.com/) components built on [Base UI](https://base-ui.com/) primitives
- **Rich Text**: [Tiptap](https://tiptap.dev/)
- **Email**: [Gmail API](https://developers.google.com/gmail/api) (agendas, broadcasts and account notifications)
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
   GOOGLE_SERVICE_ACCOUNT_KEY=""             # optional — service-account JSON (or base64), enables admin sheet edits
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

## 🧪 Tests

```bash
npm test
```

Tests use **Node's built-in test runner** (`node:test`) executed through `tsx`. This is a
deliberate choice over Vitest or Jest: the deploy pipeline rsyncs `node_modules` wholesale to
the Droplet after `npm ci`, so any test framework added as a dependency would ship
to production. `tsx` is already a dependency and already runs there for the seed script, so this
setup adds **no new packages and no production surface**.

Each test file gets its own throwaway SQLite database in the OS temp directory, created by
`tests/helpers/env.ts` and torn down on exit — `dev.db` is never touched. Node runs each test
file in a separate process, so the databases cannot collide.

`npm test` goes through `scripts/run-tests.mjs`, which enumerates the test files and passes
them to `tsx` explicitly. That indirection is deliberate: `cmd.exe` expands no globs, so an
unquoted pattern fails on Windows, while a quoted one depends on the runner's Node being new
enough to expand it itself (glob support landed in Node 22). Passing explicit paths works
everywhere and keeps the test command independent of the pinned Node version.

What is covered (all of it invisible-when-broken behaviour, which is why it is pinned):

| File | Guards |
|---|---|
| `tests/roles-recency.test.ts` | The admin panel and the agenda wizard only write roles they own, never accept non-members, and preserve `assignedAt` for unchanged holders — each silently corrupts the fairness rotation when broken. |
| `tests/backup-speaker.test.ts` | The Backup Speaker stays roleless: still eligible for a minor role, still on the attendance list, never counted as recent participation. |
| `tests/backup-carry.test.ts` | A meeting's Backup Speaker gets a random open Speaker 1–3 slot at the next scheduled meeting (skipping cancelled ones, never double-booking, keeping Speaker 3 free for a guest); changing or clearing the standby takes the automatic slot back, but never one an admin gave by hand. |
| `tests/changelog.test.ts` | The agenda sheet's CHANGELOG only grows: one `[time] Role: old ---> new` line per changed role, earlier entries (and hand-typed lines) kept through later saves and the pre-meeting refresh, and the "No Roles" grid never misread as roles. |
| `tests/archival.test.ts` | A cancelled meeting keeps its roles but is never archived as a meeting that took place. |
| `tests/roster-regeneration.test.ts` | A normal load preserves the saved roster; `ignoreSavedMinorRoles` reshuffles without persisting or disturbing other roles. |
| `tests/guest-education.test.ts` | The Guest Education override relabels only the `Speaker 3` row (to `Guest Speaker`) and stays byte-identical to Regular output everywhere else — and is fully inert when inactive. |
| `tests/password-accounts.test.ts` | Email/password accounts: a Google-only account can never be signed into with a password, emails can't be duplicated by capitalization, and each caller's agenda runs under the right Google credential (admins always the service account; members without Google create through the club account). |
| `tests/service-account.test.ts` | `GOOGLE_SERVICE_ACCOUNT_KEY` parses as raw or base64 JSON, and anything broken degrades to `null` instead of throwing — a bad env var must never break the Toastmaster's sheet creation. |
| `tests/meeting-access.test.ts` | Only the meeting's own Toastmaster (or an admin) may save its roster or run its agenda pipeline, and only while the meeting is scheduled and still editable. Server actions are public endpoints, so this is the real security boundary. |
| `tests/request-auth.test.ts` | The cron endpoints accept only the exact `CRON_SECRET`. |
| `tests/email-delivery.test.ts` | No member's address appears in an email's visible `To:` header, no header can be injected through a name, address or filename, and attachments survive the MIME encoding byte for byte. |
| `tests/email-limits.test.ts` | Attachment types Gmail refuses are stopped before sending, the total size stays under what every inbox accepts, and filenames lose path parts and header-breaking characters. |
| `tests/link-preview.test.ts` | Link preview cards read Open Graph tags (even ~720 KB into a page), and the preview fetch never reaches loopback, private or cloud-metadata addresses, whether by IP or by hostname. |
| `tests/meeting-schedule.test.ts` | The calendar offers only Fridays at 6:45 PM outside July and August, never in the past. |

**Do not deploy test files.** The artifact list in `.github/workflows/deploy.yml` copies only
`.next`, `public`, `node_modules`, `package.json`, `ecosystem.config.js` and `prisma`, so
`tests/` is excluded by omission. Keep it that way — and if you ever add a test framework as a
devDependency, prune it before the rsync step.

---

## 🎨 UI Conventions

The `/tutorial` page set the visual standard; every page now follows it. Before writing new class
strings, reach for the shared pieces:

- **`components/ui/`** — `Button` (and `buttonVariants` in `button-variants.ts` for links styled as
  buttons, usable from server components), `Input` / `NativeSelect`, `Label` / `FieldHint`, `Dialog`.
- **`components/common/`** — `PageShell` + `PageHeader` + `SectionLabel` for page structure;
  `Card`, `Notice`, `Badge` / `StatusPill`, `EmptyState`, `IconDisc`, `FormError`, `Spinner`;
  `AuthCard` for the sign-in flow; `ConfirmDialog` for anything irreversible; `MeetingSelector`,
  `StatusPage`, `LegalPage`.

The colour, text-shade, label and shape rules are written out at the top of `app/globals.css`.
In short: one grey per text role (`gray-800` values, `700` body, `600` lead, `500` captions,
`400` meta), nothing smaller than `text-xs`, no opacity on text, brand colours via the
`brand-*` tokens (never hex), and raw red/amber/green only for danger/warning/success.

Elements the tutorial screenshots point at carry `data-shot="…"` attributes, which
`scripts/tutorial-screenshots/capture.mjs` targets — keep them when restyling.

---

## 🚢 Deployment

AgendaMaster deploys to a **DigitalOcean Droplet** via a **GitHub Actions** push-to-deploy
pipeline. Full provisioning and operations instructions live in the dedicated guide:

➡️ **[Deployment Guide](./docs/DEPLOYMENT.md)**

---

## 📋 Status vs. Original Spec

The [original specification](./docs/spec-original.md) is preserved as a historical brief. The
shipped application diverges from it in a few notable ways:

- **All email** is sent via the **Gmail API**, not Resend: agenda emails as the Toastmaster (or, for a member without Google, as the club's connected Google account), and admin broadcasts and approval notifications as the club's account. The app receives no email; the club reads `coquitlamgavel@gmail.com` directly.
- **Meeting status** uses `SCHEDULED → ARCHIVED` (not the spec's `CANCELLED`/`COMPLETED`).
- **User roles** are `INCOMPLETE → PENDING → MEMBER`/`ADMIN` (plus a transient `DELETED`),
  rather than the spec's three-value enum.
- The admin **Archive** browsing view from the spec is **not yet implemented** (archival logic
  runs, but there is no dedicated archive page).
- Only the **Regular** meeting template is seeded; a separate `Education` template is not
  provided. Instead, a **Guest Education Session** works by overriding one row of the Regular
  template: the admin enters a free-text guest speaker name on the Roles panel, and if (and
  only if) the Toastmaster also selects "Guest Education Session" in the wizard's Step 2, the
  sheet's `Speaker 3` row is relabeled `Guest Speaker` and carries the guest's name. With
  either half missing, the value sits inert and the meeting renders as Regular.
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
