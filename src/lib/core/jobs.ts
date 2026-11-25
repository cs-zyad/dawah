import { dispatchDue } from "./messages";
import { materializePendingBatches, runDueReminders } from "./sending";
import { expireOffers } from "./rsvp";

let running = false;

/**
 * العامل الدوري: يكمل الدفعات المعلّقة، وينفّذ التذكيرات المجدولة، ويعيد فرص الانتظار المنتهية،
 * ويعيد محاولة الرسائل المستحقة. يعمل عبر instrumentation (محليًا) أو npm run worker أو /api/cron.
 */
export async function runJobs() {
  if (running) return { skipped: true };
  running = true;
  try {
    const materialized = await materializePendingBatches();
    const reminders = await runDueReminders();
    const expiredOffers = await expireOffers();
    const dispatched = await dispatchDue();
    return { skipped: false, materialized: materialized.length, reminders, expiredOffers, dispatched: Object.keys(dispatched).length };
  } finally {
    running = false;
  }
}
