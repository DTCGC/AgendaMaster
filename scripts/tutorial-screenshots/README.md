# Tutorial screenshots

Produces the screenshots used by the `/tutorial` page (`app/tutorial/page.tsx`), with red rings drawn
around the parts each one is about. Everything runs against a **throwaway demo database of made-up
members**: no real member ever appears in a screenshot, and neither `dev.db` nor production is touched.

Re-run it whenever a screen shown in the tutorial changes. It is also the starting point for the
planned slide deck: pass `--width 1920 --height 1080 --out <folder>` to capture at slide size.

This folder is not in the deploy artifact list (`.github/workflows/deploy.yml`), so none of it ships.
Its output — the demo database, the demo passwords and a Chrome profile — goes to `.out/`, which is
gitignored.

## Requirements

- Node 24 (see the PATH note in `AGENTS.md` on Windows) and Google Chrome. The capture script expects
  Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`; pass `--chrome <path>` otherwise.
- No extra packages: the scripts use the repo's own dependencies (`prisma`, `tsx`, `bcryptjs`, `sharp`).

## Steps

Run everything from the repo root.

1. **Build the demo database** (with the demo dev server stopped — Windows can't delete an open file):

   ```bash
   npx tsx scripts/tutorial-screenshots/demo-seed.ts
   ```

2. **Start a dev server on the demo database**, on port 3100. It must point `DATABASE_URL` at the demo
   file (the real `.env` still supplies everything else):

   ```powershell
   $env:DATABASE_URL = 'file:' + (Resolve-Path 'scripts/tutorial-screenshots/.out/demo.db').Path.Replace('\', '/'); npm run dev -- -p 3100
   ```

3. **Capture the "before the agenda is prepared" screens** (landing, login, sign-up, dashboard, wizard steps 1–4):

   ```bash
   node scripts/tutorial-screenshots/capture.mjs fresh
   ```

4. **Pretend the Toastmaster has sent the agenda**, render the example agenda, and capture the rest
   (member dashboard, Update Agenda, the example sheet). This edits the database in place, so the dev
   server can keep running:

   ```bash
   npx tsx scripts/tutorial-screenshots/demo-seed.ts --finalize
   npx tsx scripts/tutorial-screenshots/render-agenda-example.ts
   node scripts/tutorial-screenshots/capture.mjs finalized
   ```

5. Look over the PNGs in `app/tutorial/screenshots/` before committing.

`--only name1,name2` re-takes just some shots (the four wizard steps are one shot named `wizard`).

## What the scripts do

| File | Purpose |
|---|---|
| `demo-seed.ts` | Creates `.out/demo.db`: ~20 made-up members with some role history, next Friday's meeting with its major roles, and email/password logins for a Toastmaster, an ordinary member, a new (incomplete) account and a pending one. Passwords are random on every run and written only to `.out/demo-credentials.json`. `--finalize` fills in the minor roles, theme, question and a placeholder sheet link. |
| `render-agenda-example.ts` | Builds the demo meeting's agenda with the app's own sheet code (`buildSheetPayload` + `populateTemplate`) and writes it as a spreadsheet-looking page, `.out/agenda-example.html`. |
| `capture.mjs` | Drives headless Chrome over the DevTools protocol: signs in as each demo account, walks the screens, draws the red rings, and saves compressed PNGs. It never presses "Create Agenda & Send Email" or "Save & Close". |
