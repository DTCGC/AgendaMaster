<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:node-agent-rules -->
# Windows Environment Setup

If you need to run `npm`, `npx` or `node` terminal commands in this environment, their directories are not automatically configured in the shell `$PATH`. 

To prevent "Command Not Found" errors, you MUST prepend your commands with the updated path environment variable.

Example:
`$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run dev`
`$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx prisma db push`
<!-- END:node-agent-rules -->

<!-- BEGIN:deployment-agent-rules -->
# Production Deployment Architecture

This application is officially deployed to production on a DigitalOcean Droplet with a custom domain and SSL. It uses a **GitHub Actions CI/CD pipeline** (`.github/workflows/deploy.yml`). 

When implementing new features, bug fixes, or database updates, YOU MUST adhere to the following constraints to prevent breaking production:

1. **The Cloud-Build Pipeline**: Pushing to the `main` branch automatically triggers deployment. The project uses a Cloud-Build strategy: `npm run build` happens on GitHub's Runner, and ONLY the built artifacts (`.next/`, `public/`, `node_modules/`, `prisma/`, `package.json`, `ecosystem.config.js`) are Rsynced to the server. Do NOT introduce build steps or dependencies that rely on the local Droplet environment. This list is mirrored in `.github/workflows/deploy.yml`, which is the source of truth — keep them in sync.
2. **Environment Variables**: If you add new environment variables or tokens to `.env`, YOU MUST forcefully alert the user to SSH into the Droplet and add them to `/var/www/agendamaster/.env` *before* they push the code, otherwise the production PM2 instance will crash.
3. **Database Persistence (SQLite)**: The production database is deliberately stored *outside* the application folder at `/var/www/data/prod.db` to survive deployments. NEVER hardcode database paths; strictly rely on the `DATABASE_URL` environment variable. 
4. **Database Migrations (`db push`)**: The deployment script runs `npx prisma db push` forcefully on every update to sync the schema. If you modify `prisma/schema.prisma`, ensure your schema changes are non-destructive, or you will wipe live club data.
5. **Process Management**: Production is managed by PM2 using `ecosystem.config.js`. Do not change Next.js startup commands without explicitly updating the PM2 ecosystem configuration.
6. **Node Version Parity (Runner ↔ Droplet)**: `better-sqlite3` is a native module compiled during `npm install` **on the GitHub runner**, then rsynced inside `node_modules/`. Its ABI (`NODE_MODULE_VERSION`) must therefore match the Node running under PM2 on the Droplet. Both are currently **Node 20**, declared in `engines` in `package.json` and in `node-version` in the workflow. NEVER bump one without the other: raising the runner alone ships a binary the Droplet cannot load and PM2 will crash on boot. A Node upgrade requires a maintenance window — upgrade the Droplet's nvm default first, then push the matching workflow change immediately. Keep `@types/node` on the same major as the runtime.
7. **No Test Tooling in Production**: Tests live in `tests/` and run via `npm test` (Node's built-in `node:test`, executed through the existing `tsx` dependency). `tests/` is absent from the artifact list above, so it never reaches the Droplet. Note that the pipeline runs a plain `npm install` and then rsyncs `node_modules` **wholesale** — so adding any test framework (Vitest, Jest, etc.) as a devDependency WOULD ship it to production. If you ever add one, you MUST prune it before the copy step, and be aware that a blanket `npm prune --production` breaks deployment, because the PM2 script relies on the devDependencies `prisma` and `tsx` being present on the server.
<!-- END:deployment-agent-rules -->
