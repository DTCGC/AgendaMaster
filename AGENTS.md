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

1. **The Cloud-Build Pipeline**: Pushing to the `main` branch automatically triggers deployment. The project uses a Cloud-Build strategy: `npm run build` happens on GitHub's Runner, and ONLY the built artifacts (`.next/`, `node_modules/`, `prisma/`, `package.json`, `ecosystem.config.js`) are Rsynced to the server. Do NOT introduce build steps or dependencies that rely on the local Droplet environment.
2. **Environment Variables**: If you add new environment variables or tokens to `.env`, YOU MUST forcefully alert the user to SSH into the Droplet and add them to `/var/www/agendamaster/.env` *before* they push the code, otherwise the production PM2 instance will crash.
3. **Database Persistence (SQLite)**: The production database is deliberately stored *outside* the application folder at `/var/www/data/prod.db` to survive deployments. NEVER hardcode database paths; strictly rely on the `DATABASE_URL` environment variable. 
4. **Database Migrations (`db push`)**: The deployment script runs `npx prisma db push` forcefully on every update to sync the schema. If you modify `prisma/schema.prisma`, ensure your schema changes are non-destructive, or you will wipe live club data.
5. **Process Management**: Production is managed by PM2 using `ecosystem.config.js`. Do not change Next.js startup commands without explicitly updating the PM2 ecosystem configuration.
<!-- END:deployment-agent-rules -->
