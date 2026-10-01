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
};

export default nextConfig;
