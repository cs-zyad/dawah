import { db, C } from "../db";
import type { EventDoc, Invitation, Registration, Ticket } from "../types";
import { availableSeats, capacityOf, listInvitations, listRegistrations } from "./events";
import { csvCell, fmtShort } from "../util";

export async function listTickets(eventId: string): Promise<Ticket[]> {
  const qs = await db().collection(C.tickets).where("eventId", "==", eventId).get();
  return qs.docs.map((d) => d.data() as Ticket);
}

export interface EventStats {
  invitations: number;
  invitedPersons: number; // الدعوات + المرافقون المسموحون
  notResponded: number;
  confirmedInvitations: number;
  confirmedPersons: number;
  attendedGuests: number;
  attendedCompanions: number;
  available: number;
  capacity: number;
  sendFailed: number;
  notSent: number;
  waitlist: number;
  declined: number;
  cancelled: number;
  registrations: number;
}

export function computeStats(e: EventDoc, invs: Invitation[], regs: Registration[]): EventStats {
  const confirmed = regs.filter((r) => r.status === "confirmed");
  return {
    invitations: invs.length,
    invitedPersons: invs.reduce((n, i) => n + 1 + (i.allowCompanion ? 1 : 0), 0),
    notResponded: invs.filter((i) => i.regStatus === "none").length,
    confirmedInvitations: confirmed.length,
    confirmedPersons: confirmed.reduce((n, r) => n + r.seats, 0),
    attendedGuests: e.checkedInGuests || 0,
    attendedCompanions: e.checkedInCompanions || 0,
    available: availableSeats(e),
    capacity: capacityOf(e),
    sendFailed: invs.filter((i) => i.sendStatus === "failed").length,
    notSent: invs.filter((i) => i.sendStatus === "not_sent").length,
    waitlist: regs.filter((r) => r.status === "waitlisted" || r.status === "offered").length,
    declined: regs.filter((r) => r.status === "declined").length,
    cancelled: regs.filter((r) => r.status === "cancelled").length,
    registrations: regs.length,
  };
}

export async function loadEventData(e: EventDoc) {
  const [invs, regs, tickets] = await Promise.all([e.type === "private" ? listInvitations(e.id) : Promise.resolve([]), listRegistrations(e.id), listTickets(e.id)]);
  return { invs, regs, tickets, stats: computeStats(e, invs, regs) };
}

const REG_AR: Record<string, string> = { none: "لم يؤكد", confirmed: "مؤكد", declined: "اعتذر", waitlisted: "في الانتظار", offered: "وصلته فرصة", cancelled: "أُلغي" };
const SEND_AR: Record<string, string> = { not_sent: "لم تُرسل", sending: "قيد الإرسال", sent: "أُرسلت", failed: "تعذّر الإرسال" };

/** كشف الحضور CSV: صف لكل شخص (المدعو والمرافق)، مع منع حقن الصيغ في Excel. */
export async function attendanceCsv(e: EventDoc): Promise<string> {
  const { invs, regs, tickets } = await loadEventData(e);
  const byReg = new Map<string, Ticket[]>();
  tickets.forEach((t) => byReg.set(t.registrationId, [...(byReg.get(t.registrationId) || []), t]));
  const regById = new Map(regs.map((r) => [r.id, r]));
  const header = ["النوع", "الاسم", "صاحب الدعوة", "الجوال", "البريد", "حالة الإرسال", "حالة التأكيد", "الحضور", "وقت الدخول", "طريقة الدخول", "سجّله"];
  const rows: string[][] = [];
  const pushPeople = (base: { name: string; phone: string; email: string; send: string; reg: string }, ts: Ticket[], allowCompanionRow: boolean) => {
    const g = ts.find((t) => t.kind === "guest" && t.status === "active");
    rows.push(["ضيف", base.name, base.name, base.phone, base.email, base.send, base.reg, g?.checkedInAt ? "حضر" : "لم يحضر", g?.checkedInAt ? fmtShort(g.checkedInAt) : "", g?.checkInMethod === "manual" ? "يدوي" : g?.checkInMethod === "scan" ? "مسح" : "", g?.checkedInByName ?? ""]);
    const c = ts.find((t) => t.kind === "companion" && t.status === "active");
    if (c || allowCompanionRow) {
      rows.push(["مرافق", "مرافق", base.name, "", "", "", c ? "مؤكد" : base.reg === "مؤكد" ? "بدون مرافق" : base.reg, c?.checkedInAt ? "حضر" : "لم يحضر", c?.checkedInAt ? fmtShort(c.checkedInAt) : "", c?.checkInMethod === "manual" ? "يدوي" : c?.checkInMethod === "scan" ? "مسح" : "", c?.checkedInByName ?? ""]);
    }
  };
  if (e.type === "private") {
    for (const i of invs) {
      const reg = i.regId ? regById.get(i.regId) : undefined;
      const ts = reg ? byReg.get(reg.id) || [] : [];
      pushPeople(
        {
          name: reg?.name || i.name,
          phone: reg?.contactType === "phone" ? reg.contact : i.phone || "",
          email: reg?.contactType === "email" ? reg.contact : i.email || "",
          send: SEND_AR[i.sendStatus],
          reg: REG_AR[i.regStatus],
        },
        ts,
        i.allowCompanion,
      );
    }
  } else {
    for (const r of regs) {
      pushPeople(
        { name: r.name, phone: r.contactType === "phone" ? r.contact : "", email: r.contactType === "email" ? r.contact : "", send: "—", reg: REG_AR[r.status] },
        byReg.get(r.id) || [],
        false,
      );
    }
  }
  // BOM حتى يفتح Excel العربية بشكل صحيح
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
