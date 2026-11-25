import { db, C, runTx } from "../db";
import type { EventDoc, User } from "../types";
import { AppError, notFound, randomToken } from "../util";
import { getPaymentProvider, type PaymentWebhookEvent } from "../providers/payments";
import { audit } from "./audit";
import { getOwnedEvent, isPaid, listInvitations, requiredPlaces } from "./events";
import { getSettings, quotePackage } from "./settings";
import { ledgerRef, writeLedger } from "./credit";

export type PaymentPurpose = "package" | "extra_places" | "credit" | "design";

export interface Payment {
  id: string;
  ownerId: string;
  purpose: PaymentPurpose;
  eventId: string | null;
  designRequestId: string | null;
  places: number;
  amount: number; // هللة
  currency: "SAR";
  description: string;
  status: "pending" | "paid" | "failed";
  provider: string;
  createdAt: number;
  paidAt: number | null;
  failedAt: number | null;
  lastWebhook: string | null; // آخر إشعار (للتجربة: إعادة إرسال نفس الإشعار)
}

export interface WebhookLog {
  id: string;
  paymentId: string;
  type: string;
  outcome: "applied" | "duplicate" | "already_paid" | "rejected" | "failed_recorded";
  reason: string | null;
  amount: number;
  currency: string;
  receivedAt: number;
}

export const MIN_TOPUP = 1000; // 10 ر.س
export const MAX_TOPUP = 1000000; // 10,000 ر.س

/** ملخص الباقة قبل الدفع. */
export async function packageSummary(ownerId: string, eventId: string) {
  const e = await getOwnedEvent(ownerId, eventId);
  const s = await getSettings();
  if (e.type === "private") {
    const invs = await listInvitations(eventId);
    const needed = requiredPlaces(invs);
    const withCompanion = invs.filter((i) => i.allowCompanion).length;
    const missing = Math.max(0, needed - e.paidPlaces);
    return {
      event: e,
      invitations: invs.length,
      withCompanion,
      needed,
      paidPlaces: e.paidPlaces,
      missing,
      quote: isPaid(e) ? null : quotePackage(needed, s),
      extraPrice: missing * s.pricing.extraPlacePrice,
      settings: s,
      blockers: [!e.templateId && "اختر قالب الدعوة أولًا", !invs.length && "أضف المدعوين أولًا"].filter(Boolean) as string[],
    };
  }
  return {
    event: e,
    invitations: 0,
    withCompanion: 0,
    needed: e.maxAttendees,
    paidPlaces: e.paidPlaces,
    missing: Math.max(0, e.maxAttendees - e.paidPlaces),
    quote: isPaid(e) ? null : quotePackage(e.maxAttendees, s),
    extraPrice: 0,
    settings: s,
    blockers: [!e.templateId && "اختر قالب الدعوة أولًا"].filter(Boolean) as string[],
  };
}

async function insertPayment(p: Omit<Payment, "id" | "currency" | "status" | "provider" | "createdAt" | "paidAt" | "failedAt" | "lastWebhook">) {
  const ref = db().collection(C.payments).doc(`pay_${randomToken(12)}`);
  const pay: Payment = { ...p, id: ref.id, currency: "SAR", status: "pending", provider: getPaymentProvider().name, createdAt: Date.now(), paidAt: null, failedAt: null, lastWebhook: null };
  await ref.set(pay);
  return { payment: pay, checkoutUrl: getPaymentProvider().checkoutUrl(pay.id) };
}

/** أول دفع: أصغر باقة تغطي العدد. المبلغ يُحسب في الخادم فقط. */
export async function createPackagePayment(ownerId: string, eventId: string) {
  const sum = await packageSummary(ownerId, eventId);
  if (sum.event.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
  if (isPaid(sum.event)) throw new AppError("already_paid", "الباقة مدفوعة. استخدم شراء أماكن إضافية.");
  if (sum.blockers.length) throw new AppError("blocked", sum.blockers.join("، "));
  const q = sum.quote!;
  return insertPayment({
    ownerId,
    purpose: "package",
    eventId,
    designRequestId: null,
    places: q.places,
    amount: q.price,
    description: `${q.label} — ${sum.event.title}`,
  });
}

export async function createExtraPlacesPayment(ownerId: string, eventId: string, places: number) {
  const e = await getOwnedEvent(ownerId, eventId);
  if (!isPaid(e)) throw new AppError("not_paid", "ادفع الباقة أولًا");
  if (e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
  if (!Number.isInteger(places) || places < 1 || places > 5000) throw new AppError("validation", "عدد الأماكن غير صالح");
  const s = await getSettings();
  return insertPayment({
    ownerId,
    purpose: "extra_places",
    eventId,
    designRequestId: null,
    places,
    amount: places * s.pricing.extraPlacePrice,
    description: `${places} مكان إضافي — ${e.title}`,
  });
}

export async function createTopupPayment(ownerId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) throw new AppError("validation", "مبلغ الشحن بين 10 و10,000 ر.س");
  return insertPayment({ ownerId, purpose: "credit", eventId: null, designRequestId: null, places: 0, amount, description: "شحن رصيد الرسائل" });
}

export async function createDesignPayment(ownerId: string, designRequestId: string, amount: number, title: string) {
  return insertPayment({ ownerId, purpose: "design", eventId: null, designRequestId, places: 0, amount, description: `تصميم خاص — ${title}` });
}

export async function getPayment(id: string): Promise<Payment | null> {
  if (!id || id.includes("/")) return null;
  const s = await db().collection(C.payments).doc(id).get();
  return s.exists ? (s.data() as Payment) : null;
}

/**
 * معالجة إشعار الدفع الموثّق (webhook). هذا المسار الوحيد الذي يثبّت الدفع ويزيد السعة ويشحن الرصيد.
 * يتحقق من المبلغ والعملة، ويسجل كل إشعار بمعرّفه الفريد ويطبّق الأثر مرة واحدة داخل معاملة.
 */
export async function applyPaymentWebhook(ev: PaymentWebhookEvent): Promise<WebhookLog["outcome"]> {
  const logRef = db().collection(C.webhookEvents).doc(`${getPaymentProvider().mode}_${ev.id}`.slice(0, 200));
  const payRef = db().collection(C.payments).doc(ev.paymentId);
  const outcome = await runTx(async (tx): Promise<WebhookLog["outcome"]> => {
    // ---- القراءات
    const [logS, payS] = await Promise.all([tx.get(logRef), tx.get(payRef)]);
    if (logS.exists) return "duplicate";
    const pay = payS.data() as Payment | undefined;
    const log = (outcome: WebhookLog["outcome"], reason: string | null = null) =>
      tx.set(logRef, { id: logRef.id, paymentId: ev.paymentId, type: ev.type, outcome, reason, amount: ev.amount, currency: ev.currency, receivedAt: Date.now() } satisfies WebhookLog);
    if (!pay) {
      log("rejected", "عملية دفع غير معروفة");
      return "rejected";
    }
    if (ev.amount !== pay.amount || ev.currency !== pay.currency) {
      log("rejected", `المبلغ/العملة لا تطابق (${ev.amount} ${ev.currency} ≠ ${pay.amount} ${pay.currency})`);
      return "rejected";
    }
    const eventRef = pay.eventId ? db().collection(C.events).doc(pay.eventId) : null;
    const userRef = db().collection(C.users).doc(pay.ownerId);
    const dRef = pay.designRequestId ? db().collection(C.designRequests).doc(pay.designRequestId) : null;
    const lRef = ledgerRef(`topup:${pay.id}`);
    const [evS, uS, dS, lS] = await Promise.all([
      eventRef ? tx.get(eventRef) : Promise.resolve(null),
      tx.get(userRef),
      dRef ? tx.get(dRef) : Promise.resolve(null),
      tx.get(lRef),
    ]);
    // ---- الكتابات
    if (ev.type === "payment.failed") {
      if (pay.status === "pending") tx.update(payRef, { status: "failed", failedAt: Date.now() });
      log("failed_recorded");
      return "failed_recorded";
    }
    if (pay.status === "paid") {
      log("already_paid", "الدفع مثبت مسبقًا بإشعار آخر");
      return "already_paid";
    }
    const t = Date.now();
    tx.update(payRef, { status: "paid", paidAt: t });
    if ((pay.purpose === "package" || pay.purpose === "extra_places") && evS?.exists) {
      const e = evS.data() as EventDoc;
      const patch: Partial<EventDoc> = { paidPlaces: e.paidPlaces + pay.places, updatedAt: t };
      if (pay.purpose === "package" && e.status === "draft") {
        patch.status = "active";
        patch.activatedAt = t;
      }
      // في العامة: الأماكن الإضافية ترفع الحد الأقصى بنفس العدد
      if (pay.purpose === "extra_places" && e.type === "public") patch.maxAttendees = e.maxAttendees + pay.places;
      tx.update(eventRef!, patch);
    } else if (pay.purpose === "credit" && !lS.exists) {
      writeLedger(tx, userRef, (uS.data() as User).creditBalance || 0, {
        userId: pay.ownerId,
        amount: pay.amount,
        reason: "topup",
        note: "شحن رصيد الرسائل",
        ref: pay.id,
        idemKey: `topup:${pay.id}`,
      });
    } else if (pay.purpose === "design" && dS?.exists) {
      tx.update(dRef!, { status: "paid", paidAt: t, updatedAt: t });
    }
    log("applied");
    return "applied";
  });
  if (outcome === "applied") {
    const pay = (await payRef.get()).data() as Payment;
    await audit(pay.ownerId, "payment.paid", `payments/${pay.id}`, { purpose: pay.purpose, amount: pay.amount, places: pay.places, eventId: pay.eventId, webhookId: ev.id });
  }
  return outcome;
}

export async function listPayments(ownerId?: string): Promise<Payment[]> {
  const q = ownerId ? db().collection(C.payments).where("ownerId", "==", ownerId) : db().collection(C.payments);
  const qs = await q.get();
  return qs.docs.map((d) => d.data() as Payment).sort((a, b) => b.createdAt - a.createdAt);
}

export async function listWebhookLogs(): Promise<WebhookLog[]> {
  const qs = await db().collection(C.webhookEvents).get();
  return qs.docs.map((d) => d.data() as WebhookLog).sort((a, b) => b.receivedAt - a.receivedAt);
}

export async function getOwnedPayment(ownerId: string, id: string) {
  const p = await getPayment(id);
  if (!p || p.ownerId !== ownerId) throw notFound("عملية الدفع");
  return p;
}

/** نقطة الدخول من مسار الـ webhook: التحقق من التوقيع ثم التطبيق. */
export async function handlePaymentWebhook(rawBody: string, headers: Headers): Promise<{ status: number; outcome?: WebhookLog["outcome"]; error?: string }> {
  const ev = getPaymentProvider().verifyWebhook(rawBody, headers);
  if (!ev) return { status: 401, error: "توقيع غير صالح" };
  const outcome = await applyPaymentWebhook(ev);
  return { status: outcome === "rejected" ? 422 : 200, outcome };
}
