import type { NextConfig } from "next";

/**
 * Security headers لكل الصفحات والـ API:
 * • frame-ancestors / X-Frame-Options → منع تضمين النظام في iframe (clickjacking على الكاشير)
 * • CSP بسيط ما بيقيدش السكربتات (عشان ما يكسرش Next.js) لكن بيمنع base/form/object injection
 * • nosniff + Referrer-Policy + Permissions-Policy (النظام مش بيستخدم كاميرا/مايك/موقع)
 * • HSTS: HTTPS إجباري (بيتطبق بس على اتصال HTTPS)
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // ردود الـ API فيها بيانات مستخدم → ممنوع تتخزن في أي كاش وسيط
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "vaoxybnbrrbedeujeupa.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "jallabiya.com",
      },
      {
        protocol: "https",
        hostname: "tse1.mm.bing.net",
      },
      {
        protocol: "https",
        hostname: "tse2.mm.bing.net",
      },
      {
        protocol: "https",
        hostname: "media.mapp.sa",
      },
    ],
  },
};

export default nextConfig;
