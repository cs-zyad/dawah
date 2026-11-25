import { db, C, runTx } from "../db";
import type { EventDoc, Registration, Ticket, User } from "../types";
import { normalizeEmail, notFound, phoneSearchVariants, toLatinDigits } from "../util";

/** هل يستطيع هذا المستخدم التحضير في هذه الفعالية؟ المنظّم دائمًا، وعضو الاستقبال المعيّن فقط. */
export async function canCheckIn(user: Pick<User, "id" | "status">, eventId: string): Promise<{ ok: boolean; event: EventDoc | null }> {
  if (user.status !== "active") return { ok: false, event: null };
  const ev = await db().collection(C.events).doc(eventId).get();
  if (!ev.exists) return { ok: false, event: null };
  const e = ev.data() as EventDoc;
  if (e.ownerId === user.id) return { ok: true, event: e };
  const st = await db().collection(C.eventStaff).doc(`${eventId}_${user.id}`).get();
  return { ok: st.exists, event: st.exists ? e : null };
}

export async function requireCheckInAccess(user: Pick<User, "id" | "status">, eventId: string): Promise<EventDoc> {
  const r = await canCheckIn(user, eventId);
  if (!r.ok || !r.event) throw notFound("الفعالية");
  return r.event;
}

/** يستخرج رمز التذكرة من نص الرمز أو رابط التذكرة. */
export function parseTicketInput(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = /\/t\/([A-Za-z0-9_-]{16,64})/.exec(s);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{16,64}$/.test(s)) return s;
  return null;
}

export type CheckInResult =
  | { result: "ok"; holderName: string; kind: Ticket["kind"]; guestName: string; at: number; label: string }
  | { result: "already"; holderName: string; kind: Ticket["kind"]; guestName: string; at: number; method: Ticket["checkInMethod"]; byName: string | null; label: string }
  | { result: "wrong_event" }
  | { result: "cancelled"; label: string }
  | { result: "event_cancelled" }
  | { result: "not_found" };

const labelOf = (t: Pick<Ticket, "kind" | "guestName" | "holderName">) => (t.kind === "companion" ? `مرافق — ${t.guestName}` : t.holderName);

/**
 * مسار تسجيل الحضور الوحيد (للمسح والتحضير اليدوي). داخل معاملة تمنع التكرار
 * حتى مع مسحين متزامنين من جهازين.
 */
async function checkInTicketDoc(ticketDocId: string, eventId: string, actor: Pick<User, "id" | "name">, method: "scan" | "manual"): Promise<CheckInResult> {
  const tRef = db().collection(C.tickets).doc(ticketDocId);
  const eRef = db().collection(C.events).doc(eventId);
  return runTx(async (tx) => {
    const [tS, eS] = await Promise.all([tx.get(tRef), tx.get(eRef)]);
    if (!tS.exists) return { result: "not_found" } as const;
    const t = tS.data() as Ticket;
    if (t.eventId !== eventId) return { result: "wrong_event" } as const; // لا نكشف بيانات تذكرة فعالية أخرى
    const e = eS.data() as EventDoc;
    if (e.status === "cancelled") return { result: "event_cancelled" } as const;
    if (t.status !== "active") return { result: "cancelled", label: labelOf(t) } as const;
    if (t.checkedInAt) {
      return { result: "already", holderName: t.holderName, kind: t.kind, guestName: t.guestName, at: t.checkedInAt, method: t.checkInMethod, byName: t.checkedInByName, label: labelOf(t) } as const;
    }
    const at = Date.now();
    tx.update(tRef, { checkedInAt: at, checkedInBy: actor.id, checkedInByName: actor.name, checkInMethod: method });
    tx.update(eRef, t.kind === "guest" ? { checkedInGuests: (e.checkedInGuests || 0) + 1 } : { checkedInCompanions: (e.checkedInCompanions || 0) + 1 });
    return { result: "ok", holderName: t.holderName, kind: t.kind, guestName: t.guestName, at, label: labelOf(t) } as const;
  });
}

export async function checkInByToken(actor: Pick<User, "id" | "name" | "status">, eventId: string, raw: string, method: "scan" | "manual" = "scan"): Promise<CheckInResult> {
  await requireCheckInAccess(actor, eventId);
  const token = parseTicketInput(raw);
  if (!token) return { result: "not_found" };
  const qs = await db().collection(C.tickets).where("token", "==", token).limit(1).get();
  if (qs.empty) return { result: "not_found" };
  return checkInTicketDoc(qs.docs[0].id, eventId, actor, method);
}

/** التحضير اليدوي من نتائج البحث. */
export async function checkInManually(actor: Pick<User, "id" | "name" | "status">, eventId: string, ticketId: string): Promise<CheckInResult> {
  await requireCheckInAccess(actor, eventId);
  if (!/^[A-Za-z0-9_-]+_(guest|companion)$/.test(ticketId)) return { result: "not_found" };
  return checkInTicketDoc(ticketId, eventId, actor, "manual");
}

/** توحيد النص العربي للبحث: إزالة التشكيل وتوحيد الألف والياء والتاء المربوطة. */
export function normalizeArabic(s: string): string {
  return toLatinDigits(s)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SearchHit {
  registrationId: string;
  name: string;
  contactMasked: string;
  tickets: { id: string; kind: Ticket["kind"]; label: string; status: Ticket["status"]; checkedInAt: number | null; method: Ticket["checkInMethod"] }[];
}

/** «تعذّر عرض الرمز»: بحث بالاسم أو الجوال (أي جزء وبأي صيغة) أو البريد — داخل الفعالية فقط. */
export async function searchAttendees(actor: Pick<User, "id" | "status">, eventId: string, q: string): Promise<SearchHit[]> {
  await requireCheckInAccess(actor, eventId);
  const query = q.trim();
  if (query.length < 2) return [];
  const nq = normalizeArabic(query);
  const phoneVars = phoneSearchVariants(query);
  const emailQ = normalizeEmail(query) ?? (query.includes("@") ? query.toLowerCase() : null);
  const regs = await db().collection(C.registrations).where("eventId", "==", eventId).get();
  const matches = regs.docs
    .map((d) => d.data() as Registration)
    .filter((r) => r.status === "confirmed")
    .filter((r) => {
      if (normalizeArabic(r.name).includes(nq)) return true;
      if (r.contactType === "phone" && phoneVars.length) {
        const digits = r.contact.replace(/\D/g, "");
        if (phoneVars.some((v) => digits.includes(v))) return true;
      }
      if (r.contactType === "email" && emailQ && r.contact.includes(emailQ)) return true;
      return false;
    })
    .slice(0, 20);
  const out: SearchHit[] = [];
  for (const r of matches) {
    const ts = await db().collection(C.tickets).where("registrationId", "==", r.id).get();
    out.push({
      registrationId: r.id,
      name: r.name,
      contactMasked: r.contactType === "email" ? r.contact.replace(/^(.{2}).*(@.*)$/, "$1***$2") : `…${r.contact.slice(-4)}`,
      tickets: ts.docs
        .map((d) => d.data() as Ticket)
        .filter((t) => t.eventId === eventId)
        .sort((a) => (a.kind === "guest" ? -1 : 1))
        .map((t) => ({ id: t.id, kind: t.kind, label: labelOf(t), status: t.status, checkedInAt: t.checkedInAt, method: t.checkInMethod })),
    });
  }
  return out;
}

export async function recentCheckIns(eventId: string, n = 8) {
  const qs = await db().collection(C.tickets).where("eventId", "==", eventId).get();
  return qs.docs
    .map((d) => d.data() as Ticket)
    .filter((t) => t.checkedInAt)
    .sort((a, b) => b.checkedInAt! - a.checkedInAt!)
    .slice(0, n)
    .map((t) => ({ label: labelOf(t), at: t.checkedInAt!, method: t.checkInMethod, byName: t.checkedInByName }));
}

export async function getTicketByToken(token: string): Promise<Ticket | null> {
  if (!token || token.length > 64) return null;
  const qs = await db().collection(C.tickets).where("token", "==", token).limit(1).get();
  return qs.empty ? null : (qs.docs[0].data() as Ticket);
}
