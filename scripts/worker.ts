// عامل مهام مستقل: npm run worker (بديل instrumentation عند التشغيل خارج Next).
import { runJobs } from "../src/lib/core/jobs";

async function loop() {
  for (;;) {
    try {
      const r = await runJobs();
      if (!r.skipped && (r.dispatched || r.reminders?.length || r.expiredOffers || r.materialized)) console.log(new Date().toISOString(), r);
    } catch (e) {
      console.error("[worker]", (e as Error).message);
    }
    await new Promise((res) => setTimeout(res, 15_000));
  }
}
console.log("[وفدة] عامل المهام يعمل كل 15 ثانية");
loop();
