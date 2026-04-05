import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stabilize Build ID across cluster workers
  generateBuildId: async () => {
    return process.env.BUILD_ID || 'agendamaster-stable';
  },
  // Enable version skew protection (forces hard refresh if visitor is on an old build)
  deploymentId: process.env.BUILD_ID || 'agendamaster-stable',
};

export default nextConfig;
