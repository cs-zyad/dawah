/**
 * عامل المهام داخل خادم Next (كل 15 ثانية): التذكيرات المجدولة، إعادة المحاولة، فرص الانتظار المنتهية، الدفعات المعلّقة.
 * لا يعمل على Vercel (الدوال بلا خادم دائم) — هناك يُستخدم /api/cron.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL || process.env.DISABLE_INPROCESS_WORKER === "true") return;
  const { firebaseConfigStatus } = await import("./lib/db");
  if (!firebaseConfigStatus().ok) return;
  const { runJobs } = await import("./lib/core/jobs");
  const g = globalThis as typeof globalThis & { __wafdaWorker?: NodeJS.Timeout };
  if (g.__wafdaWorker) return;
  g.__wafdaWorker = setInterval(() => {
    runJobs().catch((e) => console.error("[worker]", e?.message || e));
  }, 15_000);
  console.log("[وفدة] عامل المهام يعمل كل 15 ثانية");
}
