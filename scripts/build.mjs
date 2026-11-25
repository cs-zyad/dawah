// يُشغَّل قبل next build: يتأكد من ضبط Firebase برسالة عربية واضحة، ويعبّئ البيانات التجريبية مرة واحدة إن كان DEMO_MODE=true.
import { spawnSync } from "node:child_process";

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!emulator) {
  if (!raw) {
    fail(
      "لم يُضبط Firebase.\n  أضف المتغير FIREBASE_SERVICE_ACCOUNT في إعدادات Vercel (Settings → Environment Variables)\n  بمحتوى ملف حساب الخدمة JSON كاملًا (أو بترميز base64)، ثم أعد النشر.\n  للتطوير المحلي بلا حساب: npm run dev:local",
    );
  }
  try {
    const t = raw.trim().startsWith("{") ? raw.trim() : Buffer.from(raw.trim(), "base64").toString("utf8");
    const sa = JSON.parse(t);
    if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error("ناقص");
    console.log(`✓ Firebase مضبوط (المشروع: ${sa.project_id})`);
  } catch {
    fail("قيمة FIREBASE_SERVICE_ACCOUNT غير صالحة: يجب أن تكون محتوى ملف حساب الخدمة JSON كاملًا (فيه project_id وclient_email وprivate_key) أو base64 له.");
  }
}
if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true" && !process.env.PAYMENT_WEBHOOK_SECRET) {
  fail("PAYMENT_WEBHOOK_SECRET غير مضبوط. أضفه (16 حرفًا عشوائيًا على الأقل) قبل النشر بالوضع الفعلي.");
}
if (process.env.DEMO_MODE === "true") {
  console.log("… DEMO_MODE=true: تعبئة البيانات التجريبية (مرة واحدة فقط)");
  const r = spawnSync("node", ["scripts/seed.mjs"], { stdio: "inherit", env: process.env });
  if (r.status !== 0) fail("فشلت تعبئة البيانات التجريبية (راجع السجل أعلاه).");
}
