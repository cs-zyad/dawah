import type { NextConfig } from "next";

/** المصادر المسموح لها باستدعاء Server Actions خلف وسيط (مثل GitHub Codespaces) — من APP_URL. */
function hostsFromEnv(): string[] {
  const out: string[] = [];
  for (const v of [process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]) {
    if (!v) continue;
    try {
      out.push(new URL(v).host);
    } catch {}
  }
  return out;
}

const nextConfig: NextConfig = {
  // يسمح باختبار المتصفح على بناء منفصل دون التعارض مع خادم التطوير
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  serverExternalPackages: ["firebase-admin", "exceljs"],
  allowedDevOrigins: ["*.app.github.dev", "127.0.0.1", ...hostsFromEnv().map((h) => h.split(":")[0])],
  experimental: {
    serverActions: {
      allowedOrigins: hostsFromEnv(),
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
