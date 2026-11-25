"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { act, isDemo, currentUser, type ActionResult } from "@/lib/session";
import { db, C } from "@/lib/db";
import { getPayment } from "@/lib/core/payments";
import { signPayload, SIGNATURE_HEADER } from "@/lib/providers/payments";
import { AppError, randomToken } from "@/lib/util";

/**
 * صفحة الدفع التجريبية: ترسل إشعارًا موقّعًا إلى نفس مسار المعالجة الفعلي (/api/payments/webhook) عبر HTTP.
 */
export async function mockPayAction(paymentId: string, op: "succeed" | "fail" | "resend", _: ActionResult | null): Promise<ActionResult> {
  return act(async () => {
    if (!isDemo()) throw new AppError("disabled", "الوضع التجريبي معطّل");
    const u = await currentUser();
    const p = await getPayment(paymentId);
    if (!p || !u || (p.ownerId !== u.id && u.role !== "admin")) throw new AppError("not_found", "عملية الدفع غير موجودة", 404);
    let body: string;
    if (op === "resend") {
      if (!p.lastWebhook) throw new AppError("none", "لم يُرسل إشعار بعد");
      body = p.lastWebhook;
    } else {
      body = JSON.stringify({ id: `evt_${randomToken(12)}`, type: op === "succeed" ? "payment.succeeded" : "payment.failed", paymentId: p.id, amount: p.amount, currency: p.currency, providerRef: `mock_${randomToken(6)}` });
      await db().collection(C.payments).doc(p.id).update({ lastWebhook: body });
    }
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    const proto = h.get("x-forwarded-proto") || (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
    const res = await fetch(`${proto}://${host}/api/payments/webhook`, { method: "POST", headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signPayload(body) }, body, cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    revalidatePath(`/dev/checkout/${p.id}`);
    const label: Record<string, string> = {
      applied: "وصل الإشعار الموقّع وطُبّق الأثر",
      duplicate: "نفس الإشعار وصل مرة أخرى — تجاهله الخادم ولم يتكرر الأثر",
      already_paid: "الدفع مثبت مسبقًا — لم يتكرر الأثر",
      failed_recorded: "سُجّل فشل الدفع",
      rejected: "رفض الخادم الإشعار",
    };
    if (!res.ok && res.status !== 422) throw new AppError("webhook", `فشل الإشعار (${res.status}): ${j.error || ""}`);
    return { ok: true, message: `${label[j.outcome] ?? j.outcome} (HTTP ${res.status})` };
  });
}
