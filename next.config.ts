import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Short commit SHA shown in the footer (BUILD_ID is set by the deploy workflow).
  env: {
    APP_BUILD_ID: (process.env.BUILD_ID || 'dev').slice(0, 7),
  },
  // Stabilize Build ID across cluster workers
  generateBuildId: async () => {
    return process.env.BUILD_ID || 'agendamaster-stable';
  },
  // Enable version skew protection (forces hard refresh if visitor is on an old build)
  deploymentId: process.env.BUILD_ID || 'agendamaster-stable',
  experimental: {
    serverActions: {
      // Broadcast attachments (7 MB max, lib/email-limits.ts) plus the message
      // and multipart overhead. nginx's client_max_body_size on the Droplet
      // must be at least this, or it answers 413 first (docs/DEPLOYMENT.md).
      bodySizeLimit: '8mb',
    },
  },
};

export default nextConfig;
