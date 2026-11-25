import type { DocumentSnapshot, Transaction } from "firebase-admin/firestore";
import { db, C, runTx } from "../db";
import type { Channel, EventDoc, Invitation, Registration, Settings, Ticket, TicketKind, User } from "../types";
import { AppError, clampStr, fmtDateTime, normalizeEmail, normalizePhone, notFound, randomToken, sha256 } from "../util";
import { availableSeats, getEventBySlug, getOwnedEvent } from "./events";
import { getInvitationByToken } from "./invitations";
import { getSettings } from "./settings";
import { queueMessageTx, dispatchMany } from "./messages";
import { renderMessage, eventVars } from "./messageTemplates";
import { buildEventView, links } from "./view";
import { ledgerRef, writeLedger } from "./credit";

/* ======================== أنواع النتائج ======================== */

export type TicketRef = { kind: TicketKind; token: string };
export type ConfirmResult =
  | { status: "confirmed"; registrationId: string; manageToken: string; seats: number; tickets: TicketRef[]; existing?: boolean }
  | { status: "waitlisted"; registrationId: string; manageToken: string; requestedSeats: number; existing?: boolean }
  | { status: "one_left"; canWaitlist: boolean }
  | { status: "full"; canWaitlist: boolean }
  | { status: "offer_expired"; registrationId: string; manageToken: string }
  | { status: "offer_lost"; registrationId: string; manageToken: string }
  | { status: "duplicate"; resent: boolean }
  | { status: "declined"; registrationId: string; manageToken: string; existing?: boolean }
  | { status: "closed"; reason: string };

export interface ConfirmOptions {
  acceptSingle?: boolean; // تبقّى مقعد واحد: التأكيد منفردًا
  joinWaitlist?: boolean; // الانضمام لقائمة الانتظار
}

/* ======================== أدوات مشتركة ======================== */

const regRefOf = (id: string) => db().collection(C.registrations).doc(id);
const ticketRefOf = (regId: string, kind: TicketKind) => db().collection(C.tickets).doc(`${regId}_${kind}`);
export const privateRegId = (invitationId: string) => `inv_${invitationId}`;
export const publicRegId = (eventId: string, idemKey: string) => `pub_${sha256(`${eventId}:${idemKey}`).slice(0, 32)}`;
const uniqueContactRef = (eventId: string, contact: string) => db().collection(C.uniques).doc(`evc:${eventId}:${sha256(contact).slice(0, 40)}`);

/** هل التسجيل مفتوح لهذه الفعالية؟ */
export function closedReason(e: EventDoc): string | null {
  if (e.status === "cancelled") return "أُلغيت هذه الفعالية";
  if (e.status !== "active" || e.paidPlaces <= 0) return "التسجيل غير متاح حاليًا";
  if (e.endAt < Date.now()) return "انتهت هذه الفعالية";
  return null;
}

type Decision = { action: "confirm"; seats: number } | { action: "waitlist"; seats: number } | { action: "one_left"; canWaitlist: boolean } | { action: "full"; canWaitlist: boolean };

/** قرار المقاعد الوحيد في المنصة. */
export function decideSeats(available: number, wanted: number, policy: EventDoc["fullPolicy"], o: ConfirmOptions): Decision {
  const canWaitlist = policy === "waitlist";
  if (available >= wanted) return { action: "confirm", seats: wanted };
  if (wanted === 2 && available === 1) {
    if (o.acceptSingle) return { action: "confirm", seats: 1 };
    if (o.joinWaitlist && canWaitlist) return { action: "waitlist", seats: 2 };
    return { action: "one_left", canWaitlist };
  }
  if (canWaitlist && o.joinWaitlist) return { action: "waitlist", seats: wanted };
  return { action: "full", canWaitlist };
}

const ticketsOf = (snaps: DocumentSnapshot[]): TicketRef[] =>
  snaps.filter((s) => s.exists && (s.data() as Ticket).status === "active").map((s) => ({ kind: (s.data() as Ticket).kind, token: (s.data() as Ticket).token }));

const channelOf = (r: Pick<Registration, "contactType">): Channel => (r.contactType === "phone" ? "whatsapp" : "email");

function manageLinkFor(reg: Registration, inv: Invitation | null) {
  return reg.source === "private" && inv ? links.invitation(inv.token) : links.manage(reg.manageToken);
}

/** يكتب التأكيد: المقاعد والتذاكر ونسخة الحالة على الدعوة ورسالة التأكيد — داخل نفس المعاملة (بعد كل القراءات). */
function writeConfirm(
  tx: Transaction,
  p: { event: EventDoc; reg: Registration; inv: Invitation | null; seats: number; settings: Settings; companionExists: boolean },
): { reg: Registration; tickets: TicketRef[]; messageId: string } {
  const t = Date.now();
  const { event, inv, seats, settings } = p;
  const reg: Registration = {
    ...p.reg,
    status: "confirmed",
    seats,
    withCompanion: seats > 1,
    requestedSeats: seats,
    confirmedAt: t,
    offerExpiresAt: null,
    confirmCount: (p.reg.confirmCount || 0) + 1,
    updatedAt: t,
  };
  const kinds: TicketKind[] = seats > 1 ? ["guest", "companion"] : ["guest"];
  const tickets = kinds.map((kind) => {
    const ticket: Ticket = {
      id: `${reg.id}_${kind}`,
      token: randomToken(20),
      eventId: event.id,
      registrationId: reg.id,
      kind,
      holderName: kind === "guest" ? reg.name : "مرافق",
      guestName: reg.name,
      status: "active",
      checkedInAt: null,
      checkedInBy: null,
      checkedInByName: null,
      checkInMethod: null,
      createdAt: t,
    };
    tx.set(ticketRefOf(reg.id, kind), ticket);
    return { kind, token: ticket.token };
  });
  // في حال إعادة التأكيد بمقعد واحد بعد تأكيد سابق بمرافق: ألغِ تذكرة المرافق القديمة
  if (seats === 1 && p.companionExists) tx.update(ticketRefOf(reg.id, "companion"), { status: "cancelled" });
  tx.set(regRefOf(reg.id), reg);
  tx.update(db().collection(C.events).doc(event.id), { reservedSeats: event.reservedSeats + seats, updatedAt: t });
  if (inv) tx.update(db().collection(C.invitations).doc(inv.id), { regStatus: "confirmed", regId: reg.id });

  // رسالة التأكيد مع التذكرة: مشمولة في الباقة (لا تُخصم من الرصيد) مع تكلفة تشغيل تقديرية معزولة
  const channel = channelOf(reg);
  const view = buildEventView(event, reg.name);
  const companion = tickets.find((x) => x.kind === "companion");
  const msg = renderMessage(
    "confirmation",
    {
      ...eventVars(view),
      guest_name: reg.name,
      ticket_link: links.ticket(tickets[0].token),
      companion_ticket_line: companion ? `تذكرة مرافقك (شاركها معه):\n${links.ticket(companion.token)}\n` : "",
      manage_link: manageLinkFor(reg, inv),
    },
    channel,
  );
  const messageId = `conf_${reg.id}_${reg.confirmCount}`;
  queueMessageTx(tx, messageId, {
    ...msg,
    kind: "confirmation",
    channel,
    to: reg.contact,
    vars: {},
    chargedTo: "package",
    cost: 0,
    opCost: settings.pricing.confirmationOpCost[channel],
    ownerId: event.ownerId,
    eventId: event.id,
    invitationId: inv?.id ?? null,
    registrationId: reg.id,
  });
  return { reg, tickets, messageId };
}

function validateGuest(input: { name: string; contactType: string; contact: string }) {
  const name = clampStr(input.name, 120);
  if (name.length < 2) throw new AppError("validation", "اكتب اسمك (حرفان على الأقل)");
  if (input.contactType !== "phone" && input.contactType !== "email") throw new AppError("validation", "اختر وسيلة التواصل");
  const contact = input.contactType === "phone" ? normalizePhone(input.contact) : normalizeEmail(input.contact);
  if (!contact) throw new AppError("validation", input.contactType === "phone" ? "رقم الجوال غير صالح" : "البريد الإلكتروني غير صالح");
  return { name, contactType: input.contactType as "phone" | "email", contact };
}

function blankRegistration(p: {
  id: string;
  event: EventDoc;
  source: Registration["source"];
  invitationId: string | null;
  name: string;
  contactType: Registration["contactType"];
  contact: string;
}): Registration {
  const t = Date.now();
  return {
    id: p.id,
    eventId: p.event.id,
    ownerId: p.event.ownerId,
    source: p.source,
    invitationId: p.invitationId,
    name: p.name,
    contactType: p.contactType,
    contact: p.contact,
    seats: 0,
    withCompanion: false,
    requestedSeats: 1,
    status: "declined",
    manageToken: randomToken(20),
    offerExpiresAt: null,
    offeredAt: null,
    waitlistedAt: null,
    confirmedAt: null,
    declinedAt: null,
    lastTicketResendAt: null,
    resendSeq: 0,
    confirmCount: 0,
    offerCount: 0,
    createdAt: t,
    updatedAt: t,
  };
}

async function afterCommit(messageIds: string[]) {
  if (!messageIds.length) return;
  try {
    await dispatchMany(messageIds);
  } catch (e) {
    // العامل الدوري سيعيد المحاولة
    console.error("dispatch after commit failed", e);
  }
}

/* ======================== تأكيد الدعوة الخاصة ======================== */

export async function confirmInvitation(
  token: string,
  input: { name: string; contactType: string; contact: string; withCompanion?: boolean },
  opts: ConfirmOptions = {},
): Promise<ConfirmResult> {
  const found = await getInvitationByToken(token);
  if (!found) throw notFound("الدعوة");
  const g = validateGuest(input);
  const settings = await getSettings();
  const invRef = db().collection(C.invitations).doc(found.id);
  const eventRef = db().collection(C.events).doc(found.eventId);
  const regId = privateRegId(found.id);
  const msgs: string[] = [];

  const result = await runTx(async (tx): Promise<ConfirmResult> => {
    msgs.length = 0;
    // ---- القراءات (كلها قبل أي كتابة)
    const [invS, evS, regS, tgS, tcS] = await Promise.all([
      tx.get(invRef),
      tx.get(eventRef),
      tx.get(regRefOf(regId)),
      tx.get(ticketRefOf(regId, "guest")),
      tx.get(ticketRefOf(regId, "companion")),
    ]);
    if (!invS.exists) throw notFound("الدعوة");
    const inv = invS.data() as Invitation;
    const event = evS.data() as EventDoc;
    const existing = regS.exists ? (regS.data() as Registration) : null;

    if (existing?.status === "confirmed") {
      return { status: "confirmed", registrationId: regId, manageToken: existing.manageToken, seats: existing.seats, tickets: ticketsOf([tgS, tcS]), existing: true };
    }
    const closed = closedReason(event);
    if (closed) return { status: "closed", reason: closed };
    if (existing?.status === "cancelled") return { status: "closed", reason: "ألغى المنظّم تسجيلك في هذه الفعالية" };
    if (existing?.status === "waitlisted") {
      return { status: "waitlisted", registrationId: regId, manageToken: existing.manageToken, requestedSeats: existing.requestedSeats, existing: true };
    }
    const wanted = input.withCompanion && inv.allowCompanion ? 2 : 1;
    const base: Registration = {
      ...(existing ?? blankRegistration({ id: regId, event, source: "private", invitationId: inv.id, ...g })),
      name: g.name,
      contactType: g.contactType,
      contact: g.contact,
    };

    if (existing?.status === "offered") {
      if ((existing.offerExpiresAt ?? 0) < Date.now()) {
        tx.update(regRefOf(regId), { status: "waitlisted", offerExpiresAt: null, updatedAt: Date.now() });
        tx.update(invRef, { regStatus: "waitlisted" });
        return { status: "offer_expired", registrationId: regId, manageToken: existing.manageToken };
      }
      const d = decideSeats(availableSeats(event), wanted, event.fullPolicy, { acceptSingle: opts.acceptSingle });
      if (d.action === "confirm") {
        const w = writeConfirm(tx, { event, reg: base, inv, seats: d.seats, settings, companionExists: tcS.exists });
        msgs.push(w.messageId);
        return { status: "confirmed", registrationId: regId, manageToken: base.manageToken, seats: d.seats, tickets: w.tickets };
      }
      if (d.action === "one_left" && !opts.joinWaitlist) return { status: "one_left", canWaitlist: true };
      tx.update(regRefOf(regId), { status: "waitlisted", offerExpiresAt: null, updatedAt: Date.now() });
      tx.update(invRef, { regStatus: "waitlisted" });
      return { status: "offer_lost", registrationId: regId, manageToken: existing.manageToken };
    }

    const d = decideSeats(availableSeats(event), wanted, event.fullPolicy, opts);
    if (d.action === "confirm") {
      const w = writeConfirm(tx, { event, reg: base, inv, seats: d.seats, settings, companionExists: tcS.exists });
      msgs.push(w.messageId);
      return { status: "confirmed", registrationId: regId, manageToken: base.manageToken, seats: d.seats, tickets: w.tickets };
    }
    if (d.action === "waitlist") {
      const t = Date.now();
      tx.set(regRefOf(regId), { ...base, status: "waitlisted", requestedSeats: d.seats, withCompanion: d.seats > 1, seats: 0, waitlistedAt: t, updatedAt: t });
      tx.update(invRef, { regStatus: "waitlisted", regId });
      return { status: "waitlisted", registrationId: regId, manageToken: base.manageToken, requestedSeats: d.seats };
    }
    return d.action === "one_left" ? { status: "one_left", canWaitlist: d.canWaitlist } : { status: "full", canWaitlist: d.canWaitlist };
  });
  await afterCommit(msgs);
  return result;
}

/* ======================== التسجيل العام ======================== */

export async function registerPublic(
  slug: string,
  idemKey: string,
  input: { name: string; contactType: string; contact: string },
  opts: ConfirmOptions = {},
): Promise<ConfirmResult> {
  if (!idemKey || idemKey.length < 16 || idemKey.length > 100) throw new AppError("validation", "أعد تحميل الصفحة وحاول مرة أخرى");
  const found = await getEventBySlug(slug);
  if (!found || found.type !== "public") throw notFound("الفعالية");
  const g = validateGuest(input);
  const settings = await getSettings();
  const eventRef = db().collection(C.events).doc(found.id);
  const regId = publicRegId(found.id, idemKey);
  const uRef = uniqueContactRef(found.id, g.contact);
  const msgs: string[] = [];

  const result = await runTx(async (tx): Promise<ConfirmResult> => {
    msgs.length = 0;
    // ---- القراءات
    const [evS, regS, uS, tgS] = await Promise.all([tx.get(eventRef), tx.get(regRefOf(regId)), tx.get(uRef), tx.get(ticketRefOf(regId, "guest"))]);
    const event = evS.data() as EventDoc;
    if (regS.exists) {
      // نفس مفتاح النموذج = نفس التسجيل (ضغط مكرر أو إعادة إرسال)
      const r = regS.data() as Registration;
      if (r.status === "confirmed") return { status: "confirmed", registrationId: r.id, manageToken: r.manageToken, seats: r.seats, tickets: ticketsOf([tgS]), existing: true };
      if (r.status === "waitlisted" || r.status === "offered") return { status: "waitlisted", registrationId: r.id, manageToken: r.manageToken, requestedSeats: r.requestedSeats, existing: true };
      return { status: "declined", registrationId: r.id, manageToken: r.manageToken, existing: true };
    }
    if (uS.exists) {
      // وسيلة التواصل مسجلة مسبقًا: لا نكشف التذكرة، بل نعيد إرسالها لصاحب الوسيلة (بحد أدنى للمدة)
      const otherId = uS.data()!.ref as string;
      const [oS, otS] = await Promise.all([tx.get(regRefOf(otherId)), tx.get(ticketRefOf(otherId, "guest"))]);
      if (!oS.exists) return { status: "duplicate", resent: false };
      const other = oS.data() as Registration;
      const minMs = settings.policies.ticketResendMinMinutes * 60_000;
      if (other.lastTicketResendAt && other.lastTicketResendAt + minMs > Date.now()) return { status: "duplicate", resent: false };
      const id = queueResend(tx, { event, reg: other, inv: null, guestTicket: otS.exists ? (otS.data() as Ticket) : null, companionTicket: null, settings });
      msgs.push(id);
      return { status: "duplicate", resent: true };
    }
    const closed = closedReason(event);
    if (closed) return { status: "closed", reason: closed };
    const base = blankRegistration({ id: regId, event, source: "public", invitationId: null, ...g });
    const d = decideSeats(availableSeats(event), 1, event.fullPolicy, opts);
    if (d.action === "confirm") {
      tx.set(uRef, { kind: "event_contact", eventId: event.id, ref: regId });
      const w = writeConfirm(tx, { event, reg: base, inv: null, seats: 1, settings, companionExists: false });
      msgs.push(w.messageId);
      return { status: "confirmed", registrationId: regId, manageToken: base.manageToken, seats: 1, tickets: w.tickets };
    }
    if (d.action === "waitlist") {
      const t = Date.now();
      tx.set(uRef, { kind: "event_contact", eventId: event.id, ref: regId });
      tx.set(regRefOf(regId), { ...base, status: "waitlisted", requestedSeats: 1, waitlistedAt: t });
      return { status: "waitlisted", registrationId: regId, manageToken: base.manageToken, requestedSeats: 1 };
    }
    return { status: "full", canWaitlist: d.action === "full" ? d.canWaitlist : false };
  });
  await afterCommit(msgs);
  return result;
}

/** رسالة إعادة إرسال التذكرة (أو حالة التسجيل إن لم يكن مؤكدًا). مشمولة في الباقة. يجب استدعاؤها بعد القراءات. */
function queueResend(
  tx: Transaction,
  p: { event: EventDoc; reg: Registration; inv: Invitation | null; guestTicket: Ticket | null; companionTicket: Ticket | null; settings: Settings },
): string {
  const { event, reg, inv } = p;
  const channel = channelOf(reg);
  const view = buildEventView(event, reg.name);
  const seq = (reg.resendSeq || 0) + 1;
  const manage = manageLinkFor(reg, inv);
  const msg =
    reg.status === "confirmed" && p.guestTicket?.status === "active"
      ? renderMessage(
          "ticket_resend",
          {
            ...eventVars(view),
            guest_name: reg.name,
            ticket_link: links.ticket(p.guestTicket.token),
            companion_ticket_line: p.companionTicket?.status === "active" ? `تذكرة مرافقك:\n${links.ticket(p.companionTicket.token)}\n` : "",
            manage_link: manage,
          },
          channel,
        )
      : renderMessage(
          "registration_status",
          {
            ...eventVars(view),
            guest_name: reg.name,
            status_text: reg.status === "waitlisted" || reg.status === "offered" ? "في قائمة الانتظار" : "غير مؤكد",
            manage_link: manage,
          },
          channel,
        );
  const id = `resend_${reg.id}_${seq}`;
  queueMessageTx(tx, id, {
    ...msg,
    kind: "ticket_resend",
    channel,
    to: reg.contact,
    vars: {},
    chargedTo: "package",
    cost: 0,
    opCost: p.settings.pricing.confirmationOpCost[channel],
    ownerId: event.ownerId,
    eventId: event.id,
    invitationId: inv?.id ?? null,
    registrationId: reg.id,
  });
  tx.update(regRefOf(reg.id), { lastTicketResendAt: Date.now(), resendSeq: seq });
  return id;
}

/* ======================== التأكيد من صفحة الإدارة (العامة/فرصة الانتظار/بعد الاعتذار) ======================== */

export async function getRegistrationByManageToken(token: string): Promise<Registration | null> {
  if (!token || token.length > 64) return null;
  const qs = await db().collection(C.registrations).where("manageToken", "==", token).limit(1).get();
  return qs.empty ? null : (qs.docs[0].data() as Registration);
}

export async function confirmRegistration(manageToken: string, opts: ConfirmOptions = {}): Promise<ConfirmResult> {
  const found = await getRegistrationByManageToken(manageToken);
  if (!found) throw notFound("التسجيل");
  const settings = await getSettings();
  const regRef = regRefOf(found.id);
  const eventRef = db().collection(C.events).doc(found.eventId);
  const invRef = found.invitationId ? db().collection(C.invitations).doc(found.invitationId) : null;
  const msgs: string[] = [];
  const result = await runTx(async (tx): Promise<ConfirmResult> => {
    msgs.length = 0;
    const [rS, evS, tgS, tcS, invS] = await Promise.all([
      tx.get(regRef),
      tx.get(eventRef),
      tx.get(ticketRefOf(found.id, "guest")),
      tx.get(ticketRefOf(found.id, "companion")),
      invRef ? tx.get(invRef) : Promise.resolve(null),
    ]);
    const reg = rS.data() as Registration;
    const event = evS.data() as EventDoc;
    const inv = invS?.exists ? (invS.data() as Invitation) : null;
    if (reg.status === "confirmed") return { status: "confirmed", registrationId: reg.id, manageToken: reg.manageToken, seats: reg.seats, tickets: ticketsOf([tgS, tcS]), existing: true };
    const closed = closedReason(event);
    if (closed) return { status: "closed", reason: closed };
    if (reg.status === "cancelled") return { status: "closed", reason: "ألغى المنظّم تسجيلك في هذه الفعالية" };
    if (reg.status === "waitlisted") return { status: "waitlisted", registrationId: reg.id, manageToken: reg.manageToken, requestedSeats: reg.requestedSeats, existing: true };
    const wanted = reg.source === "private" && inv?.allowCompanion ? Math.min(2, Math.max(1, reg.requestedSeats)) : 1;
    if (reg.status === "offered") {
      if ((reg.offerExpiresAt ?? 0) < Date.now()) {
        tx.update(regRef, { status: "waitlisted", offerExpiresAt: null, updatedAt: Date.now() });
        if (invRef) tx.update(invRef, { regStatus: "waitlisted" });
        return { status: "offer_expired", registrationId: reg.id, manageToken: reg.manageToken };
      }
      const d = decideSeats(availableSeats(event), wanted, event.fullPolicy, { acceptSingle: opts.acceptSingle });
      if (d.action === "confirm") {
        const w = writeConfirm(tx, { event, reg, inv, seats: d.seats, settings, companionExists: tcS.exists });
        msgs.push(w.messageId);
        return { status: "confirmed", registrationId: reg.id, manageToken: reg.manageToken, seats: d.seats, tickets: w.tickets };
      }
      if (d.action === "one_left" && !opts.joinWaitlist) return { status: "one_left", canWaitlist: true };
      tx.update(regRef, { status: "waitlisted", offerExpiresAt: null, updatedAt: Date.now() });
      if (invRef) tx.update(invRef, { regStatus: "waitlisted" });
      return { status: "offer_lost", registrationId: reg.id, manageToken: reg.manageToken };
    }
    // معتذر سابقًا يؤكد من جديد إن توفر مقعد
    const d = decideSeats(availableSeats(event), wanted, event.fullPolicy, opts);
    if (d.action === "confirm") {
      const w = writeConfirm(tx, { event, reg, inv, seats: d.seats, settings, companionExists: tcS.exists });
      msgs.push(w.messageId);
      return { status: "confirmed", registrationId: reg.id, manageToken: reg.manageToken, seats: d.seats, tickets: w.tickets };
    }
    if (d.action === "waitlist") {
      tx.update(regRef, { status: "waitlisted", requestedSeats: d.seats, waitlistedAt: Date.now(), updatedAt: Date.now() });
      if (invRef) tx.update(invRef, { regStatus: "waitlisted" });
      return { status: "waitlisted", registrationId: reg.id, manageToken: reg.manageToken, requestedSeats: d.seats };
    }
    return d.action === "one_left" ? { status: "one_left", canWaitlist: d.canWaitlist } : { status: "full", canWaitlist: d.canWaitlist };
  });
  await afterCommit(msgs);
  return result;
}

/* ======================== الاعتذار والإلغاء ======================== */

/**
 * يحرر المقاعد ويلغي التذاكر. ممنوع بعد تسجيل حضور أي تذكرة. تكراره آمن.
 * by=guest => "declined"، by=organizer => "cancelled".
 */
async function releaseRegistration(regId: string, by: "guest" | "organizer", createFrom?: { event: EventDoc; inv: Invitation }) {
  const regRef = regRefOf(regId);
  return runTx(async (tx) => {
    const rS = await tx.get(regRef);
    let reg = rS.exists ? (rS.data() as Registration) : null;
    const eventId = reg?.eventId ?? createFrom?.event.id;
    if (!eventId) throw notFound("التسجيل");
    const invId = reg?.invitationId ?? createFrom?.inv.id ?? null;
    const [evS, tgS, tcS, invS] = await Promise.all([
      tx.get(db().collection(C.events).doc(eventId)),
      tx.get(ticketRefOf(regId, "guest")),
      tx.get(ticketRefOf(regId, "companion")),
      invId ? tx.get(db().collection(C.invitations).doc(invId)) : Promise.resolve(null),
    ]);
    const event = evS.data() as EventDoc;
    const newStatus = by === "guest" ? "declined" : "cancelled";
    const t = Date.now();
    if (!reg) {
      // المدعو يعتذر قبل أن يؤكد
      const inv = createFrom!.inv;
      reg = blankRegistration({
        id: regId,
        event,
        source: "private",
        invitationId: inv.id,
        name: inv.name,
        contactType: inv.phone ? "phone" : "email",
        contact: (inv.phone || inv.email)!,
      });
      tx.set(regRef, { ...reg, status: newStatus, declinedAt: t });
      if (invS?.exists) tx.update(invS.ref, { regStatus: newStatus, regId });
      return { changed: true, status: newStatus };
    }
    if (reg.status === "declined" || reg.status === "cancelled") return { changed: false, status: reg.status };
    const tickets = [tgS, tcS].filter((s) => s.exists).map((s) => s.data() as Ticket);
    if (reg.status === "confirmed" && tickets.some((x) => x.status === "active" && x.checkedInAt)) {
      throw new AppError("checked_in", "تم تسجيل الحضور، لذلك لا يمكن الاعتذار أو الإلغاء");
    }
    if (reg.status === "confirmed") {
      tx.update(evS.ref, { reservedSeats: Math.max(0, event.reservedSeats - reg.seats), updatedAt: t });
      for (const s of [tgS, tcS]) if (s.exists) tx.update(s.ref, { status: "cancelled" });
    }
    tx.update(regRef, { status: newStatus, declinedAt: t, offerExpiresAt: null, seats: 0, updatedAt: t });
    if (invS?.exists) tx.update(invS.ref, { regStatus: newStatus });
    return { changed: true, status: newStatus };
  });
}

export async function declineInvitation(token: string) {
  const inv = await getInvitationByToken(token);
  if (!inv) throw notFound("الدعوة");
  const event = (await db().collection(C.events).doc(inv.eventId).get()).data() as EventDoc;
  return releaseRegistration(privateRegId(inv.id), "guest", { event, inv });
}

export async function declineByManageToken(token: string) {
  const reg = await getRegistrationByManageToken(token);
  if (!reg) throw notFound("التسجيل");
  return releaseRegistration(reg.id, "guest");
}

export async function cancelRegistrationByOrganizer(ownerId: string, regId: string) {
  const r = await regRefOf(regId).get();
  const reg = r.data() as Registration | undefined;
  if (!reg || reg.ownerId !== ownerId) throw notFound("التسجيل");
  const res = await releaseRegistration(regId, "organizer");
  const { audit } = await import("./audit");
  await audit(ownerId, "registration.cancel", `registrations/${regId}`, { name: reg.name });
  return res;
}

/** المنظّم يعيد إرسال التذكرة (مشمولة في الباقة، بحد أدنى للمدة). */
export async function resendTicketByOrganizer(ownerId: string, regId: string) {
  const settings = await getSettings();
  const regRef = regRefOf(regId);
  const msgs: string[] = [];
  const res = await runTx(async (tx) => {
    msgs.length = 0;
    const rS = await tx.get(regRef);
    const reg = rS.data() as Registration | undefined;
    if (!reg || reg.ownerId !== ownerId) throw notFound("التسجيل");
    const [evS, tgS, tcS, invS] = await Promise.all([
      tx.get(db().collection(C.events).doc(reg.eventId)),
      tx.get(ticketRefOf(regId, "guest")),
      tx.get(ticketRefOf(regId, "companion")),
      reg.invitationId ? tx.get(db().collection(C.invitations).doc(reg.invitationId)) : Promise.resolve(null),
    ]);
    if (reg.status !== "confirmed") throw new AppError("not_confirmed", "لا توجد تذكرة لهذا التسجيل");
    const minMs = settings.policies.ticketResendMinMinutes * 60_000;
    if (reg.lastTicketResendAt && reg.lastTicketResendAt + minMs > Date.now()) {
      throw new AppError("too_soon", `أُعيد الإرسال قبل قليل. انتظر ${settings.policies.ticketResendMinMinutes} دقائق بين كل إعادة.`);
    }
    const id = queueResend(tx, {
      event: evS.data() as EventDoc,
      reg,
      inv: invS?.exists ? (invS.data() as Invitation) : null,
      guestTicket: tgS.exists ? (tgS.data() as Ticket) : null,
      companionTicket: tcS.exists ? (tcS.data() as Ticket) : null,
      settings,
    });
    msgs.push(id);
    return { messageId: id };
  });
  await afterCommit(msgs);
  return res;
}

/* ======================== قائمة الانتظار ======================== */

/**
 * المنظّم يرسل فرصة لشخص في الانتظار. الفرصة لا تحجز المقعد.
 * ممنوع إن لم يتوفر مقعد. تُخصم الرسالة من رصيد الرسائل.
 */
export async function offerWaitlistSpot(ownerId: string, regId: string, idemKey: string) {
  const settings = await getSettings();
  const regRef = regRefOf(regId);
  const userRef = db().collection(C.users).doc(ownerId);
  const lRef = ledgerRef(`offer:${regId}:${idemKey}`);
  const msgs: string[] = [];
  const res = await runTx(async (tx) => {
    msgs.length = 0;
    const [rS, uS, lS] = await Promise.all([tx.get(regRef), tx.get(userRef), tx.get(lRef)]);
    const reg = rS.data() as Registration | undefined;
    if (!reg || reg.ownerId !== ownerId) throw notFound("التسجيل");
    const [evS, invS] = await Promise.all([
      tx.get(db().collection(C.events).doc(reg.eventId)),
      reg.invitationId ? tx.get(db().collection(C.invitations).doc(reg.invitationId)) : Promise.resolve(null),
    ]);
    if (lS.exists) return { duplicate: true, expiresAt: reg.offerExpiresAt };
    const event = evS.data() as EventDoc;
    if (reg.status !== "waitlisted") throw new AppError("not_waitlisted", "هذا الشخص ليس في قائمة الانتظار");
    const closed = closedReason(event);
    if (closed) throw new AppError("closed", closed);
    if (availableSeats(event) < 1) throw new AppError("no_seat", "لا يوجد مقعد متاح الآن. انتظر اعتذار أحد الضيوف أو اشترِ أماكن إضافية.");
    const channel = channelOf(reg);
    const price = settings.pricing.messagePrice[channel];
    const balance = (uS.data() as User).creditBalance || 0;
    if (balance < price) throw new AppError("insufficient_credit", "رصيد الرسائل غير كافٍ لإرسال الفرصة. اشحن الرصيد أولًا.");
    const t = Date.now();
    const expiresAt = t + settings.policies.waitlistOfferHours * 3600_000;
    const inv = invS?.exists ? (invS.data() as Invitation) : null;
    const seq = (reg.offerCount || 0) + 1;
    const msgId = `offer_${reg.id}_${seq}`;
    const view = buildEventView(event, reg.name);
    const msg = renderMessage(
      "waitlist_offer",
      { ...eventVars(view), guest_name: reg.name, offer_expires: fmtDateTime(expiresAt), manage_link: manageLinkFor(reg, inv) },
      channel,
    );
    tx.update(regRef, { status: "offered", offeredAt: t, offerExpiresAt: expiresAt, offerCount: seq, updatedAt: t });
    if (invS?.exists) tx.update(invS.ref, { regStatus: "offered" });
    writeLedger(tx, userRef, balance, {
      userId: ownerId,
      amount: -price,
      reason: "waitlist_offer",
      note: `فرصة انتظار — ${event.title}`,
      ref: msgId,
      idemKey: `offer:${regId}:${idemKey}`,
    });
    queueMessageTx(tx, msgId, {
      ...msg,
      kind: "waitlist_offer",
      channel,
      to: reg.contact,
      vars: {},
      chargedTo: "credit",
      cost: price,
      ownerId,
      eventId: event.id,
      invitationId: inv?.id ?? null,
      registrationId: reg.id,
    });
    msgs.push(msgId);
    return { duplicate: false, expiresAt };
  });
  await afterCommit(msgs);
  return res;
}

/** الفرص المنتهية تعود للانتظار تلقائيًا. */
export async function expireOffers(): Promise<number> {
  const qs = await db().collection(C.registrations).where("status", "==", "offered").get();
  const t = Date.now();
  let n = 0;
  for (const d of qs.docs) {
    const r = d.data() as Registration;
    if ((r.offerExpiresAt ?? 0) >= t) continue;
    const changed = await runTx(async (tx) => {
      const s = await tx.get(d.ref);
      const cur = s.data() as Registration;
      if (cur.status !== "offered" || (cur.offerExpiresAt ?? 0) >= Date.now()) return false;
      tx.update(d.ref, { status: "waitlisted", offerExpiresAt: null, updatedAt: Date.now() });
      if (cur.invitationId) tx.update(db().collection(C.invitations).doc(cur.invitationId), { regStatus: "waitlisted" });
      return true;
    });
    if (changed) n++;
  }
  return n;
}

export async function listWaitlist(ownerId: string, eventId: string) {
  await getOwnedEvent(ownerId, eventId);
  const qs = await db().collection(C.registrations).where("eventId", "==", eventId).get();
  return qs.docs
    .map((d) => d.data() as Registration)
    .filter((r) => r.status === "waitlisted" || r.status === "offered")
    .sort((a, b) => (a.waitlistedAt ?? a.createdAt) - (b.waitlistedAt ?? b.createdAt));
}

export async function getRegistrationTickets(regId: string): Promise<Ticket[]> {
  const [g, c] = await Promise.all([ticketRefOf(regId, "guest").get(), ticketRefOf(regId, "companion").get()]);
  return [g, c].filter((s) => s.exists).map((s) => s.data() as Ticket);
}
