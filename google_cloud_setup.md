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
| `https://www.googleapis.com/auth/spreadsheets` | Create/edit spreadsheets |
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

Open `d:\John\my stuff\Code\DTCGC\AgendaMaster\.env` and replace the placeholder values:

```env
GOOGLE_CLIENT_ID="<paste your Client ID here>"
GOOGLE_CLIENT_SECRET="<paste your Client Secret here>"
```

---

## Step 6: Gmail App Password for Admin SMTP

> [!WARNING]
> Gmail **does not allow** third-party apps to use your regular password for SMTP. You need to generate a special "App Password." Your regular password `gcgm1450` will **not work** for SMTP.

### Generate an App Password:

1. Go to [myaccount.google.com](https://myaccount.google.com/) (signed in as `coquitlamgavel@gmail.com`)
2. Go to **Security**
3. Under **"How you sign in to Google"**, make sure **2-Step Verification** is **ON**
   - If it's off, click it and follow the steps to enable it (you'll need your phone)
4. After 2-Step Verification is enabled, go back to **Security**
5. Search for or navigate to **"App passwords"** (you can also go directly to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords))
6. Under "App name", type: `AgendaMaster`
7. Click **Create**
8. Google will show you a **16-character password** like: `abcd efgh ijkl mnop`
9. **Copy this password** (remove spaces)

### Add to `.env`:

```env
EMAIL_USER="coquitlamgavel@gmail.com"
EMAIL_PASS="<paste your 16-char App Password here>"
```

---

## Final `.env` Should Look Like:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="f2bdc851-4e4b-4ee9-b4f1-085e6ebd5192-dtcgg"
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-your-client-secret"
EMAIL_USER="coquitlamgavel@gmail.com"
EMAIL_PASS="your-16-char-app-password"
```

---

## Summary Checklist

- [ ] Created Google Cloud project
- [ ] Enabled Gmail API, Google Sheets API, Google Drive API
- [ ] Configured OAuth consent screen with correct scopes
- [ ] Added test users (your Gmail + any testers)
- [ ] Created OAuth client ID credentials
- [ ] Copied Client ID and Client Secret to `.env`
- [ ] Enabled 2-Step Verification on the Gmail account
- [ ] Generated a Gmail App Password
- [ ] Added `EMAIL_USER` and `EMAIL_PASS` to `.env`

Once you've completed these steps, come back and tell me. The app code is being set up in parallel so it will be ready to use immediately.
