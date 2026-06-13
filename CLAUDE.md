To familiarize yourself with the project, read the documentation in this order:

1. **`README.md`** — project overview, features, tech stack, local setup, and known divergences from the original spec. **Authoritative for current as-built behavior.**
2. **`docs/DEPLOYMENT.md`** — DigitalOcean provisioning, CI/CD, PM2, and the archival cron.
3. **`docs/GOOGLE_CLOUD_SETUP.md`** — Google OAuth and API configuration.
4. **`docs/spec-original.md`** — the original project brief, kept for historical context only (the shipped app diverges from it; see the README).
5. **`AGENTS.md`** — environment + deployment constraints you MUST follow when changing code.

When docs disagree, precedence is: running code → `README.md` → `AGENTS.md` → `docs/spec-original.md`.

