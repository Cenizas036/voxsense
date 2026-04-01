import type { NextConfig } from "next";

const nextConfig: any = {
  serverExternalPackages: ["jspdf"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;