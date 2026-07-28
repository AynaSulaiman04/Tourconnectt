import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["exceljs", "nodemailer", "openai", "pdf-lib"],
  experimental: {
    proxyClientMaxBodySize: "30mb",
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  images: {
    qualities: [75, 85, 92],
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
