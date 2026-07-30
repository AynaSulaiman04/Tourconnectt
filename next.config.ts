import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["exceljs", "nodemailer", "openai", "pdf-lib"],
  experimental: {
    proxyClientMaxBodySize: "160mb",
    serverActions: {
      bodySizeLimit: "160mb",
    },
  },
  images: {
    deviceSizes: [640, 828, 1200, 1920],
    qualities: [75, 85],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      ...(supabaseUrl
        ? [
            new URL(`${supabaseUrl}/storage/v1/object/public/**`),
          ]
        : []),
    ],
  },
};

export default nextConfig;
