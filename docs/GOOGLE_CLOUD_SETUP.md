# Google Cloud Console Setup Guide — AgendaMaster

This guide walks you through creating a Google Cloud project, enabling the required APIs, and generating OAuth credentials for your AgendaMaster application.

---

## Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Sign in with your `coquitlamgavel@gmail.com` Google account
3. In the top-left, click the **project dropdown** (next to "Google Cloud")
4. Click **"New Project"**
5. Name it: `AgendaMaster-DTCGC`
6. Click **Create**
7. Make sure the new project is selected in the top dropdown

---

## Step 2: Enable Required APIs

You need three APIs enabled. Do this for each:

1. In the left sidebar, go to **APIs & Services → Library**
2. Search for and enable each of these (click each one → click **"Enable"**):

| API Name | What it does |
|----------|-------------|
| **Gmail API** | Lets the Toastmaster send emails from their own Gmail |
| **Google Sheets API** | Lets the app create and populate agenda spreadsheets |
| **Google Drive API** | Lets the app save sheets to the user's Google Drive |

---

## Step 3: Configure the OAuth Consent Screen

Before creating credentials, Google requires you to set up a consent screen (what users see when logging in).

1. Go to **APIs & Services → OAuth consent screen**
2. Click **"Get Started"** or **"Configure Consent Screen"**
3. Fill in:
   - **App name**: `AgendaMaster`
   - **User support email**: `coquitlamgavel@gmail.com`
   - **App logo**: Optional (you can upload the Gavel Club logo later)
4. Click **Next**
5. Under **Audience**, select **External** (this lets any Google account sign in)
6. Click **Next**
7. Under **Contact Information**, enter: `coquitlamgavel@gmail.com`
8. Click **Next**, then agree to terms and click **Create**

### Add Scopes

1. Go to **APIs & Services → OAuth consent screen → Data Access** (or **Scopes** tab)
2. Click **"Add or Remove Scopes"**
3. Search for and add these scopes:

| Scope | Description |
|-------|-------------|
| `openid` | Basic identity |
| `email` | User's email address |
| `profile` | User's name and photo |
| `https://www.googleapis.com/auth/gmail.send` | Send emails |
| `https://www.googleapis.com/auth/drive.file` | Manage files created by this app |

4. Click **Update** → **Save and Continue**

### Add Test Users (While in Testing Mode)

> [!IMPORTANT]
> While your app is in "Testing" publishing status, **only test users you explicitly add can log in**. You need to add every club member's Gmail here, or publish the app.

1. Go to **OAuth consent screen → Audience**
2. Under **Test Users**, click **"Add Users"**
3. Add `coquitlamgavel@gmail.com` and any other Gmail addresses you want to test with
4. Click **Save**

> [!TIP]
> Later, when you're ready to let all members sign in, you can click **"Publish App"** on the consent screen to move from Testing → Production. Google may review it (takes a few days for sensitive scopes like Gmail).

---

## Step 4: Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **"+ Create Credentials"** → **"OAuth client ID"**
3. Application type: **Web application**
4. Name: `AgendaMaster Web Client`
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (for local development)
   - Your production domain when ready (e.g., `https://yourdomain.com`)
6. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/callback/google`
   - Your production equivalent when ready (e.g., `https://yourdomain.com/api/auth/callback/google`)
7. Click **Create**

### Copy Your Credentials

You'll see a popup with:
- **Client ID** — looks like: `123456789-abcdefg.apps.googleusercontent.com`
- **Client Secret** — looks like: `GOCSPX-xxxxxxxxxxxxxx`

**Copy both of these.** You'll paste them into your `.env` file.

---

## Step 5: Update Your `.env` File

Open the `.env` file in the project root (copy it from [`.env.example`](../.env.example) if you haven't yet) and replace the placeholder values:

```env
GOOGLE_CLIENT_ID="<paste your Client ID here>"
GOOGLE_CLIENT_SECRET="<paste your Client Secret here>"
```

---

## Step 6: Service Account (Admin Sheet Editing)

The ADMIN account signs in with email + password, never Google OAuth, so it has no
Google identity of its own. To let admins update existing agenda sheets, the app
authenticates as a **service account** — a robot Google identity belonging to the
project. The app automatically shares every newly created agenda sheet with it as
an Editor; no manual sharing is needed for new sheets.

1. In the same `AgendaMaster-DTCGC` project, go to **IAM & Admin → Service Accounts**
2. Click **"+ Create Service Account"**
3. Name it `agendamaster-sheet-editor`, then click **Create and Continue**
4. **Skip the project-role step entirely** — no project-level IAM role is needed.
   Sheets/Drive access is granted per-file via normal sheet sharing (which the app
   does programmatically), not via IAM roles.
5. Click **Done**, then open the new service account
6. Go to the **Keys** tab → **Add Key → Create new key → JSON** → **Create**, and
   download the key file
7. Put the key file's contents into `GOOGLE_SERVICE_ACCOUNT_KEY` in `.env` —
   base64-encoding it first is recommended (see [`.env.example`](../.env.example))

> [!IMPORTANT]
> For production, the variable must also be added to `/var/www/agendamaster/.env`
> on the Droplet **by hand, before deploying** — new env vars never reach
> production automatically (see the [Deployment Guide](./DEPLOYMENT.md)).

> [!WARNING]
> Do **not** set up domain-wide delegation. The service account only ever needs
> direct per-file Editor access via normal sheet sharing — never impersonation.

Notes:

- The Sheets and Drive APIs enabled in Step 2 cover the service account too —
  nothing new to enable.
- The service account's email looks like
  `agendamaster-sheet-editor@agendamaster-dtcgc.iam.gserviceaccount.com`. You don't
  need to add it anywhere manually for **new** sheets — but sheets created
  **before** this feature shipped were never shared with it. Editing those as
  admin fails with a clear error until someone opens that sheet → **Share** → adds
  the service-account email as **Editor**.

---

## Summary Checklist

- [ ] Created Google Cloud project
- [ ] Enabled Gmail API, Google Sheets API, Google Drive API
- [ ] Configured OAuth consent screen with correct scopes
- [ ] Added test users (your Gmail + any testers)
- [ ] Created OAuth client ID credentials
- [ ] Copied Client ID and Client Secret to `.env`
- [ ] Enabled 2-Step Verification on the Gmail account
- [ ] Created the `agendamaster-sheet-editor` service account + JSON key, and put it in `GOOGLE_SERVICE_ACCOUNT_KEY` (local **and** Droplet `.env`)
