import { db, C, runTx } from "../db";
import type { User } from "../types";
import { AppError, clampStr, notFound, DAY } from "../util";
import { audit } from "./audit";
import { createDesignPayment } from "./payments";
import { createTemplate, type TemplateInput } from "./templates";
import { getOwnedEvent } from "./events";

export type DesignStatus = "pending_review" | "quoted" | "accepted" | "paid" | "in_progress" | "delivered" | "rejected" | "cancelled";

export const DESIGN_STATUS_AR: Record<DesignStatus, string> = {
  pending_review: "بانتظار المراجعة",
  quoted: "وصل عرض السعر",
  accepted: "مقبول بانتظار الدفع",
  paid: "مدفوع",
  in_progress: "قيد التنفيذ",
  delivered: "تم التسليم",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

export interface DesignRequest {
  id: string;
  ownerId: string;
  eventId: string | null;
  title: string;
  details: string;
  refUrl: string;
  status: DesignStatus;
  quote: { amount: number; notes: string; validDays: number; sentAt: number; expiresAt: number } | null;
  paymentId: string | null;
  templateId: string | null;
  rejectReason: string | null;
  createdAt: number;
  updatedAt: number;
  paidAt?: number;
}

export interface DesignMessage {
  id: string;
  requestId: string;
  authorId: string;
  authorRole: "organizer" | "admin";
  authorName: string;
  body: string;
  createdAt: number;
}

const ref = (id: string) => db().collection(C.designRequests).doc(id);

export async function getDesignRequest(id: string): Promise<DesignRequest | null> {
  if (!id || id.includes("/")) return null;
  const s = await ref(id).get();
  return s.exists ? (s.data() as DesignRequest) : null;
}

async function owned(ownerId: string, id: string) {
  const r = await getDesignRequest(id);
  if (!r || r.ownerId !== ownerId) throw notFound("الطلب");
  return r;
}

export async function createDesignRequest(ownerId: string, input: { title: string; details: string; refUrl?: string; eventId?: string | null }) {
  const title = clampStr(input.title, 120);
  const details = clampStr(input.details, 3000);
  if (title.length < 3) throw new AppError("validation", "عنوان الطلب مطلوب");
  if (details.length < 10) throw new AppError("validation", "اكتب تفاصيل كافية (10 أحرف على الأقل)");
  const refUrl = clampStr(input.refUrl, 500);
  if (refUrl && !/^https?:\/\//i.test(refUrl)) throw new AppError("validation", "الرابط المرجعي يجب أن يبدأ بـ https://");
  if (input.eventId) await getOwnedEvent(ownerId, input.eventId);
  const r = ref(db().collection(C.designRequests).doc().id);
  const t = Date.now();
  const d: DesignRequest = { id: r.id, ownerId, eventId: input.eventId || null, title, details, refUrl, status: "pending_review", quote: null, paymentId: null, templateId: null, rejectReason: null, createdAt: t, updatedAt: t };
  await r.set(d);
  return d;
}

export async function listDesignRequests(ownerId?: string): Promise<DesignRequest[]> {
  const q = ownerId ? db().collection(C.designRequests).where("ownerId", "==", ownerId) : db().collection(C.designRequests);
  const qs = await q.get();
  return qs.docs.map((d) => d.data() as DesignRequest).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listDesignMessages(requestId: string): Promise<DesignMessage[]> {
  const qs = await db().collection(C.designMessages).where("requestId", "==", requestId).get();
  return qs.docs.map((d) => d.data() as DesignMessage).sort((a, b) => a.createdAt - b.createdAt);
}

export async function addDesignMessage(actor: User, requestId: string, body: string) {
  const r = await getDesignRequest(requestId);
  if (!r || (actor.role !== "admin" && r.ownerId !== actor.id)) throw notFound("الطلب");
  const text = clampStr(body, 3000);
  if (!text) throw new AppError("validation", "اكتب الرسالة");
  const m = db().collection(C.designMessages).doc();
  const msg: DesignMessage = { id: m.id, requestId, authorId: actor.id, authorRole: actor.role === "admin" ? "admin" : "organizer", authorName: actor.name, body: text, createdAt: Date.now() };
  await m.set(msg);
  await ref(requestId).update({ updatedAt: Date.now() });
  return msg;
}

async function transition(id: string, from: DesignStatus[], patch: Partial<DesignRequest>, guard?: (r: DesignRequest) => void) {
  return runTx(async (tx) => {
    const s = await tx.get(ref(id));
    const r = s.data() as DesignRequest | undefined;
    if (!r) throw notFound("الطلب");
    if (!from.includes(r.status)) throw new AppError("bad_state", `لا يمكن تنفيذ الإجراء والطلب بحالة «${DESIGN_STATUS_AR[r.status]}»`);
    guard?.(r);
    tx.update(ref(id), { ...patch, updatedAt: Date.now() });
    return { ...r, ...patch };
  });
}

export async function sendQuote(adminId: string, id: string, q: { amount: number; notes: string; validDays: number }) {
  if (!Number.isInteger(q.amount) || q.amount < 100) throw new AppError("validation", "المبلغ غير صالح");
  if (!Number.isInteger(q.validDays) || q.validDays < 1 || q.validDays > 60) throw new AppError("validation", "صلاحية العرض بين 1 و60 يومًا");
  const t = Date.now();
  const r = await transition(id, ["pending_review", "quoted"], { status: "quoted", quote: { amount: q.amount, notes: clampStr(q.notes, 1000), validDays: q.validDays, sentAt: t, expiresAt: t + q.validDays * DAY } });
  await audit(adminId, "design.quote", `designRequests/${id}`, q);
  return r;
}

export async function rejectDesign(adminId: string, id: string, reason: string) {
  const r = await transition(id, ["pending_review", "quoted", "accepted"], { status: "rejected", rejectReason: clampStr(reason, 500) || "—" });
  await audit(adminId, "design.reject", `designRequests/${id}`, { reason });
  return r;
}

export async function acceptQuote(ownerId: string, id: string) {
  await owned(ownerId, id);
  return transition(id, ["quoted"], { status: "accepted" }, (r) => {
    if (!r.quote || r.quote.expiresAt < Date.now()) throw new AppError("expired", "انتهت صلاحية عرض السعر. اطلب عرضًا جديدًا من خلال المراسلات.");
  });
}

export async function payDesign(ownerId: string, id: string) {
  const r = await owned(ownerId, id);
  if (r.status !== "accepted" || !r.quote) throw new AppError("bad_state", "اقبل عرض السعر أولًا");
  const p = await createDesignPayment(ownerId, id, r.quote.amount, r.title);
  await ref(id).update({ paymentId: p.payment.id, updatedAt: Date.now() });
  return p;
}

export async function cancelDesign(ownerId: string, id: string) {
  await owned(ownerId, id);
  return transition(id, ["pending_review", "quoted", "accepted"], { status: "cancelled" });
}

export async function startDesignWork(adminId: string, id: string) {
  const r = await transition(id, ["paid"], { status: "in_progress" });
  await audit(adminId, "design.start", `designRequests/${id}`, {});
  return r;
}

/** التسليم كقالب خاص بهذا المنظّم يظهر له عند اختيار القالب. */
export async function deliverDesign(adminId: string, id: string, tpl: Omit<TemplateInput, "ownerId" | "visible">) {
  const r = await getDesignRequest(id);
  if (!r) throw notFound("الطلب");
  if (r.status !== "in_progress" && r.status !== "paid") throw new AppError("bad_state", "التسليم بعد الدفع فقط");
  const t = await createTemplate(adminId, { ...tpl, visible: true, ownerId: r.ownerId });
  await transition(id, ["in_progress", "paid"], { status: "delivered", templateId: t.id });
  await audit(adminId, "design.deliver", `designRequests/${id}`, { templateId: t.id });
  return t;
}
