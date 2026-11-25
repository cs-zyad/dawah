import type { Metadata, Viewport } from "next";
import "@fontsource/noto-kufi-arabic/700.css";
import "@fontsource/noto-sans-arabic/400.css";
import "@fontsource/noto-sans-arabic/600.css";
import "@fontsource/noto-sans-arabic/700.css";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/600.css";
import "./globals.css";
import { brand } from "@/config/brand";

/** كل الصفحات تقرأ بيانات حية من Firestore، فلا نسمح بالعرض المسبق أو التخزين المؤقت. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: `${brand.fullName} — ${brand.tagline}`, template: `%s | ${brand.nameAr}` },
  description: "منصة تربط تجهيز الدعوة وإرسالها بتأكيد الحضور وإصدار تذكرة QR وتسجيل الدخول عند الاستقبال.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: brand.colors.plum,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
