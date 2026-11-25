import { z } from "zod";
import { db, C, runTx } from "../db";
import type { EventDoc, Invitation, Registration } from "../types";
import { AppError, notFound, randomToken, riyadhLocalToMs } from "../util";
import { audit } from "./audit";

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(3, { error: "اسم الفعالية مطلوب (3 أحرف على الأقل)" }).max(120),
    orgName: z.string().trim().min(2, { error: "اسم الجهة المنظّمة مطلوب" }).max(120),
    description: z.string().trim().max(2000).default(""),
    startLocal: z.string().min(1, { error: "موعد البداية مطلوب" }),
    endLocal: z.string().min(1, { error: "موعد النهاية مطلوب" }),
    venue: z.string().trim().min(2, { error: "اسم المكان مطلوب" }).max(160),
    address: z.string().trim().max(300).default(""),
    mapUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => !v || /^https?:\/\//i.test(v), { error: "رابط الخريطة يجب أن يبدأ بـ https://" })
      .default(""),
    maxAttendees: z.coerce.number({ error: "الحد الأقصى للحضور مطلوب" }).int({ error: "عدد صحيح فقط" }).min(1, { error: "الحد الأدنى 1" }).max(20000),
    type: z.enum(["private", "public"], { error: "اختر نوع الدعوة" }),
    fullPolicy: z.enum(["close", "waitlist"], { error: "اختر سياسة اكتمال العدد" }),
  })
  .transform((v, ctx) => {
    const startAt = riyadhLocalToMs(v.startLocal);
    const endAt = riyadhLocalToMs(v.endLocal);
    if (!startAt) ctx.addIssue({ code: "custom", path: ["startLocal"], message: "موعد البداية غير صالح" });
    if (!endAt) ctx.addIssue({ code: "custom", path: ["endLocal"], message: "موعد النهاية غير صالح" });
    if (startAt && endAt && endAt <= startAt) ctx.addIssue({ code: "custom", path: ["endLocal"], message: "النهاية يجب أن تكون بعد البداية" });
    return { ...v, startAt: startAt ?? 0, endAt: endAt ?? 0 };
  });

export type EventInput = z.input<typeof eventInputSchema>;

export const capacityOf = (e: Pick<EventDoc, "maxAttendees" | "paidPlaces">) => Math.max(0, Math.min(e.maxAttendees, e.paidPlaces));
export const availableSeats = (e: Pick<EventDoc, "maxAttendees" | "paidPlaces" | "reservedSeats">) => Math.max(0, capacityOf(e) - e.reservedSeats);
export const isPaid = (e: Pick<EventDoc, "paidPlaces">) => e.paidPlaces > 0;
export const isPast = (e: Pick<EventDoc, "endAt">) => e.endAt < Date.now();

/** أماكن الباقة المطلوبة للدعوات الخاصة: مكان لكل دعوة + مكان لكل دعوة تسمح بمرافق. */
export function requiredPlaces(invs: Pick<Invitation, "allowCompanion">[]) {
  return invs.reduce((n, i) => n + 1 + (i.allowCompanion ? 1 : 0), 0);
}

export async function createEvent(ownerId: string, raw: EventInput): Promise<EventDoc> {
  const p = eventInputSchema.safeParse(raw);
  if (!p.success) throw new AppError("validation", p.error.issues[0]?.message ?? "بيانات غير صالحة");
  const v = p.data;
  const ref = db().collection(C.events).doc();
  const t = Date.now();
  const e: EventDoc = {
    id: ref.id,
    ownerId,
    status: "draft",
    type: v.type,
    title: v.title,
    orgName: v.orgName,
    description: v.description,
    startAt: v.startAt,
    endAt: v.endAt,
    venue: v.venue,
    address: v.address,
    mapUrl: v.mapUrl,
    maxAttendees: v.maxAttendees,
    fullPolicy: v.fullPolicy,
    templateId: null,
    publicSlug: randomToken(12),
    paidPlaces: 0,
    reservedSeats: 0,
    checkedInGuests: 0,
    checkedInCompanions: 0,
    confirmationSeq: 0,
    createdAt: t,
    updatedAt: t,
  };
  await ref.set(e);
  return e;
}

/** تعديل البيانات. نوع الدعوة لا يتغير بعد الدفع، والحد الأقصى لا يقل عن المحجوز. */
export async function updateEvent(ownerId: string, eventId: string, raw: EventInput): Promise<EventDoc> {
  const p = eventInputSchema.safeParse(raw);
  if (!p.success) throw new AppError("validation", p.error.issues[0]?.message ?? "بيانات غير صالحة");
  const v = p.data;
  const ref = db().collection(C.events).doc(eventId);
  return runTx(async (tx) => {
    const s = await tx.get(ref);
    const e = s.data() as EventDoc | undefined;
    if (!e || e.ownerId !== ownerId) throw notFound("الفعالية");
    if (e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
    if (isPaid(e) && v.type !== e.type) throw new AppError("type_locked", "لا يمكن تغيير نوع الدعوة بعد الدفع");
    if (v.maxAttendees < e.reservedSeats) throw new AppError("below_reserved", `الحد الأقصى لا يمكن أن يقل عن المقاعد المحجوزة (${e.reservedSeats})`);
    if (e.type === "public" && isPaid(e) && v.maxAttendees > e.paidPlaces) {
      throw new AppError("over_paid", `الحد الأقصى يتجاوز الأماكن المدفوعة (${e.paidPlaces}). اشترِ أماكن إضافية أولًا.`);
    }
    const patch = {
      title: v.title,
      orgName: v.orgName,
      description: v.description,
      startAt: v.startAt,
      endAt: v.endAt,
      venue: v.venue,
      address: v.address,
      mapUrl: v.mapUrl,
      maxAttendees: v.maxAttendees,
      type: v.type,
      fullPolicy: v.fullPolicy,
      updatedAt: Date.now(),
    };
    tx.update(ref, patch);
    return { ...e, ...patch };
  });
}

export async function getEvent(eventId: string): Promise<EventDoc | null> {
  if (!eventId || eventId.includes("/")) return null;
  const s = await db().collection(C.events).doc(eventId).get();
  return s.exists ? (s.data() as EventDoc) : null;
}

/** عزل المنظّمين: فعالية منظّم آخر = غير موجودة. */
export async function getOwnedEvent(ownerId: string, eventId: string): Promise<EventDoc> {
  const e = await getEvent(eventId);
  if (!e || e.ownerId !== ownerId) throw notFound("الفعالية");
  return e;
}

export async function getEventBySlug(slug: string): Promise<EventDoc | null> {
  if (!slug || slug.length > 64) return null;
  const qs = await db().collection(C.events).where("publicSlug", "==", slug).limit(1).get();
  return qs.empty ? null : (qs.docs[0].data() as EventDoc);
}

export async function listOwnerEvents(ownerId: string): Promise<EventDoc[]> {
  const qs = await db().collection(C.events).where("ownerId", "==", ownerId).get();
  return qs.docs.map((d) => d.data() as EventDoc).sort((a, b) => b.createdAt - a.createdAt);
}

export async function setEventTemplate(ownerId: string, eventId: string, templateId: string) {
  const e = await getOwnedEvent(ownerId, eventId);
  const t = await db().collection(C.templates).doc(templateId).get();
  const td = t.data();
  if (!td || (td.ownerId && td.ownerId !== ownerId) || (!td.ownerId && !td.visible)) throw notFound("القالب");
  if (e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
  await db().collection(C.events).doc(eventId).update({ templateId, updatedAt: Date.now() });
}

export async function cancelEvent(ownerId: string, eventId: string) {
  const e = await getOwnedEvent(ownerId, eventId);
  if (e.status === "cancelled") return;
  await db().collection(C.events).doc(eventId).update({ status: "cancelled", cancelledAt: Date.now(), updatedAt: Date.now() });
  await audit(ownerId, "event.cancel", `events/${eventId}`, { title: e.title });
}

export async function listInvitations(eventId: string): Promise<Invitation[]> {
  const qs = await db().collection(C.invitations).where("eventId", "==", eventId).get();
  return qs.docs.map((d) => d.data() as Invitation).sort((a, b) => a.order - b.order);
}

export async function listRegistrations(eventId: string): Promise<Registration[]> {
  const qs = await db().collection(C.registrations).where("eventId", "==", eventId).get();
  return qs.docs.map((d) => d.data() as Registration).sort((a, b) => a.createdAt - b.createdAt);
}
