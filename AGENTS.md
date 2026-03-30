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
