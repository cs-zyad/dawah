import { randomBytes } from "node:crypto";
import { db, C } from "@/lib/db";
import { createUser } from "@/lib/core/users";
import { createEvent, setEventTemplate, getEvent } from "@/lib/core/events";
import { ensureDefaultTemplates } from "@/lib/core/templates";
import { addInvitations, type InvitationInput } from "@/lib/core/invitations";
import { createPackagePayment, createTopupPayment, handlePaymentWebhook, type Payment } from "@/lib/core/payments";
import { signPayload, SIGNATURE_HEADER } from "@/lib/providers/payments";
import { updateSettings } from "@/lib/core/settings";
import { msToRiyadhLocal, DAY } from "@/lib/util";
import type { EventDoc, FullPolicy, User } from "@/lib/types";

export async function resetDb() {
  const host = process.env.FIRESTORE_EMULATOR_HOST!;
  const res = await fetch(`http://${host}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!res.ok) throw new Error(`reset failed ${res.status}`);
  await ensureDefaultTemplates();
  // إعدادات اختبار: إعادة المحاولة بلا انتظار
  await updateSettings("test", { policies: { retryBaseSeconds: 0 } });
}

let n = 0;
export const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}${randomBytes(2).toString("hex")}`;

export async function mkUser(role: User["role"] = "organizer", name = "منظّم"): Promise<User> {
  return createUser({ email: `${role}-${uniq()}@wafda.test`, name, role, password: "Wafda@2026" });
}

export function sendWebhook(payment: Pick<Payment, "id" | "amount" | "currency">, o: { type?: string; eventId?: string; amount?: number; currency?: string; badSig?: boolean } = {}) {
  const body = JSON.stringify({
    id: o.eventId ?? `evt_${uniq()}`,
    type: o.type ?? "payment.succeeded",
    paymentId: payment.id,
    amount: o.amount ?? payment.amount,
    currency: o.currency ?? payment.currency,
  });
  const headers = new Headers({ [SIGNATURE_HEADER]: o.badSig ? "0".repeat(64) : signPayload(body) });
  return handlePaymentWebhook(body, headers);
}

export async function topup(owner: User, riyals: number) {
  const { payment } = await createTopupPayment(owner.id, riyals * 100);
  const r = await sendWebhook(payment);
  if (r.outcome !== "applied") throw new Error("topup failed");
}

export async function mkEvent(
  owner: User,
  o: { type?: "private" | "public"; max?: number; policy?: FullPolicy; invitations?: InvitationInput[]; pay?: boolean } = {},
): Promise<EventDoc> {
  const start = Date.now() + 2 * DAY;
  const e = await createEvent(owner.id, {
    title: "فعالية اختبار",
    orgName: "نادي الاختبار",
    description: "وصف",
    startLocal: msToRiyadhLocal(start),
    endLocal: msToRiyadhLocal(start + 3 * 3600_000),
    venue: "القاعة الكبرى",
    address: "الرياض",
    mapUrl: "",
    maxAttendees: o.max ?? 50,
    type: o.type ?? "private",
    fullPolicy: o.policy ?? "close",
  });
  await setEventTemplate(owner.id, e.id, "tpl_plum_frame");
  if (o.invitations?.length) await addInvitations(owner.id, e.id, o.invitations);
  if (o.pay !== false && (o.type === "public" || o.invitations?.length)) {
    const { payment } = await createPackagePayment(owner.id, e.id);
    const r = await sendWebhook(payment);
    if (r.outcome !== "applied") throw new Error("package payment failed: " + r.outcome);
  }
  return (await getEvent(e.id))!;
}

export const guests = (count: number, companionEvery = 0): InvitationInput[] =>
  Array.from({ length: count }, (_, i) => ({
    name: `ضيف ${i + 1}`,
    phone: `05${20000001 + i}`,
    allowCompanion: companionEvery > 0 && i % companionEvery === 0,
  }));

export async function invitationsOf(eventId: string) {
  const qs = await db().collection(C.invitations).where("eventId", "==", eventId).get();
  return qs.docs.map((d) => d.data()).sort((a, b) => a.order - b.order) as import("@/lib/types").Invitation[];
}

/** يضبط السعة مباشرة لاختبارات السعة الصغيرة */
export async function setCapacity(eventId: string, max: number) {
  await db().collection(C.events).doc(eventId).update({ maxAttendees: max });
}
