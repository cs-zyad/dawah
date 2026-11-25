import { describe, it, expect, beforeAll } from "vitest";
import { db, C } from "@/lib/db";
import { registerPublic, confirmInvitation, declineInvitation, declineByManageToken, confirmRegistration } from "@/lib/core/rsvp";
import { getEvent } from "@/lib/core/events";
import { packageSummary } from "@/lib/core/payments";
import type { MessageDoc, Registration, Ticket } from "@/lib/types";
import { resetDb, mkUser, mkEvent, guests, invitationsOf, setCapacity, uniq } from "./helpers";

beforeAll(resetDb);

const pubInput = (i: number) => ({ name: `زائر ${i}`, contactType: "phone", contact: `05${30000001 + i}` });

async function ticketsFor(eventId: string) {
  const qs = await db().collection(C.tickets).where("eventId", "==", eventId).get();
  return qs.docs.map((d) => d.data() as Ticket);
}

describe("السعة والتزامن — الرابط العام", () => {
  it("20 تسجيلًا متزامنًا على 5 مقاعد = 5 بالضبط", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { type: "public", max: 5, policy: "close" });
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => registerPublic(e.publicSlug, uniq() + "-key-xxxxxxxxxx", pubInput(i))));
    expect(results.filter((r) => r.status === "confirmed")).toHaveLength(5);
    expect(results.filter((r) => r.status === "full")).toHaveLength(15);
    const ev = await getEvent(e.id);
    expect(ev!.reservedSeats).toBe(5);
    expect((await ticketsFor(e.id)).filter((t) => t.status === "active")).toHaveLength(5);
  });

  it("في العامة السعة لا تتجاوز الأماكن المدفوعة", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { type: "public", max: 50 });
    expect(e.paidPlaces).toBe(50);
    await setCapacity(e.id, 80); // حد أقصى أعلى من المدفوع
    const results = await Promise.all(Array.from({ length: 56 }, (_, i) => registerPublic(e.publicSlug, `${uniq()}-paid-key-xxxx`, pubInput(100 + i))));
    expect(results.filter((r) => r.status === "confirmed")).toHaveLength(50);
    expect((await getEvent(e.id))!.reservedSeats).toBe(50);
  });

  it("سياسة الانتظار: المؤكدون حتى السعة والبقية في الانتظار", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { type: "public", max: 50, policy: "waitlist" });
    await setCapacity(e.id, 5);
    const r = await Promise.all(Array.from({ length: 9 }, (_, i) => registerPublic(e.publicSlug, `${uniq()}-wl-key-xxxxx`, pubInput(300 + i), { joinWaitlist: true })));
    expect(r.filter((x) => x.status === "confirmed")).toHaveLength(5);
    expect(r.filter((x) => x.status === "waitlisted")).toHaveLength(4);
    const noJoin = await registerPublic(e.publicSlug, `${uniq()}-wl-key-xxxxx`, pubInput(400));
    expect(noJoin).toEqual({ status: "full", canWaitlist: true });
    expect((await getEvent(e.id))!.reservedSeats).toBe(5);
  });

  it("سياسة الإغلاق: اكتمل العدد بلا انتظار", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { type: "public", max: 50, policy: "close" });
    await setCapacity(e.id, 1);
    await registerPublic(e.publicSlug, `${uniq()}-close-xxxxxxx`, pubInput(500));
    const r = await registerPublic(e.publicSlug, `${uniq()}-close-xxxxxxx`, pubInput(501), { joinWaitlist: true });
    expect(r).toEqual({ status: "full", canWaitlist: false });
  });

  it("مفتاح النموذج المكرر يعيد نفس التسجيل ولا يكرر الحجز", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { type: "public", max: 50 });
    const key = `${uniq()}-same-key-xxxx`;
    const rs = await Promise.all(Array.from({ length: 6 }, () => registerPublic(e.publicSlug, key, pubInput(600))));
    const ids = new Set(rs.map((r) => (r.status === "confirmed" ? r.registrationId : "x")));
    expect(ids.size).toBe(1);
    expect((await getEvent(e.id))!.reservedSeats).toBe(1);
    expect(await ticketsFor(e.id)).toHaveLength(1);
    const msgs = await db().collection(C.messages).where("eventId", "==", e.id).get();
    expect(msgs.docs.filter((d) => (d.data() as MessageDoc).kind === "confirmation")).toHaveLength(1);
  });

  it("نفس الرقم بصيغة مختلفة لا يكرر ولا يكشف التذكرة، ويعيد الإرسال لصاحبه مرة واحدة ضمن المدة", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { type: "public", max: 50 });
    const first = await registerPublic(e.publicSlug, `${uniq()}-dup-a-xxxxxx`, { name: "سارة", contactType: "phone", contact: "0551234567" });
    expect(first.status).toBe("confirmed");
    const second = await registerPublic(e.publicSlug, `${uniq()}-dup-b-xxxxxx`, { name: "شخص آخر", contactType: "phone", contact: "+966 55 123 4567" });
    expect(second).toEqual({ status: "duplicate", resent: true });
    expect(JSON.stringify(second)).not.toContain("token");
    const third = await registerPublic(e.publicSlug, `${uniq()}-dup-c-xxxxxx`, { name: "خالد", contactType: "phone", contact: "966551234567" });
    expect(third).toEqual({ status: "duplicate", resent: false });
    expect((await getEvent(e.id))!.reservedSeats).toBe(1);
    const msgs = (await db().collection(C.messages).where("eventId", "==", e.id).get()).docs.map((d) => d.data() as MessageDoc);
    const resends = msgs.filter((m) => m.kind === "ticket_resend");
    expect(resends).toHaveLength(1);
    expect(resends[0].to).toBe("+966551234567");
    expect(resends[0].chargedTo).toBe("package");
  });
});

describe("الدعوات الخاصة — التأكيد والمرافق", () => {
  it("تأكيدات متزامنة لنفس الدعوة لا تكرر الحجز ولا التذاكر ولا رسالة التأكيد", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { invitations: guests(3, 1) }); // كلها بمرافق
    const [inv] = await invitationsOf(e.id);
    const rs = await Promise.all(
      Array.from({ length: 10 }, () => confirmInvitation(inv.token, { name: inv.name, contactType: "phone", contact: inv.phone!, withCompanion: true })),
    );
    expect(rs.every((r) => r.status === "confirmed")).toBe(true);
    const ev = await getEvent(e.id);
    expect(ev!.reservedSeats).toBe(2);
    const tks = await ticketsFor(e.id);
    expect(tks).toHaveLength(2);
    const msgs = (await db().collection(C.messages).where("eventId", "==", e.id).get()).docs.map((d) => d.data() as MessageDoc);
    expect(msgs.filter((m) => m.kind === "confirmation")).toHaveLength(1);
    expect(msgs[0].chargedTo).toBe("package");
    expect(msgs[0].cost).toBe(0);
    expect(msgs[0].opCost).toBeGreaterThan(0);
  });

  it("رمزا المدعو والمرافق مستقلان", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { invitations: guests(1, 1) });
    const [inv] = await invitationsOf(e.id);
    const r = await confirmInvitation(inv.token, { name: "نورة", contactType: "email", contact: "noura@example.com", withCompanion: true });
    if (r.status !== "confirmed") throw new Error();
    expect(r.tickets).toHaveLength(2);
    expect(r.tickets[0].token).not.toBe(r.tickets[1].token);
    const tks = await ticketsFor(e.id);
    expect(tks.find((t) => t.kind === "companion")!.holderName).toBe("مرافق");
    expect(tks.find((t) => t.kind === "companion")!.guestName).toBe("نورة");
  });

  it("تأكيدات متزامنة من مدعوين مختلفين مع مرافقين لا تتجاوز السعة", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { invitations: guests(12, 1) }); // 12 دعوة كلها بمرافق = 24 مكانًا
    await setCapacity(e.id, 7);
    const invs = await invitationsOf(e.id);
    const rs = await Promise.all(invs.map((inv) => confirmInvitation(inv.token, { name: inv.name, contactType: "phone", contact: inv.phone!, withCompanion: true }, { acceptSingle: true })));
    const ev = await getEvent(e.id);
    expect(ev!.reservedSeats).toBeLessThanOrEqual(7);
    const seats = rs.reduce((n, r) => n + (r.status === "confirmed" ? r.seats : 0), 0);
    expect(seats).toBe(ev!.reservedSeats);
    expect(ev!.reservedSeats).toBe(7);
    const regs = (await db().collection(C.registrations).where("eventId", "==", e.id).get()).docs.map((d) => d.data() as Registration);
    expect(regs.filter((r) => r.status === "confirmed").reduce((n, r) => n + r.seats, 0)).toBe(7);
  });

  it("مقعد واحد متبقٍ وطلب مرافق: تنبيه، والتأكيد منفردًا، والانتظار بمقعدين", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { invitations: guests(4, 1), policy: "waitlist" });
    await setCapacity(e.id, 3);
    const invs = await invitationsOf(e.id);
    await confirmInvitation(invs[0].token, { name: "أحمد", contactType: "phone", contact: invs[0].phone!, withCompanion: true });
    const ask = await confirmInvitation(invs[1].token, { name: "بدر", contactType: "phone", contact: invs[1].phone!, withCompanion: true });
    expect(ask).toEqual({ status: "one_left", canWaitlist: true });
    const wl = await confirmInvitation(invs[2].token, { name: "جود", contactType: "phone", contact: invs[2].phone!, withCompanion: true }, { joinWaitlist: true });
    expect(wl).toMatchObject({ status: "waitlisted", requestedSeats: 2 });
    const single = await confirmInvitation(invs[1].token, { name: "بدر", contactType: "phone", contact: invs[1].phone!, withCompanion: true }, { acceptSingle: true });
    expect(single).toMatchObject({ status: "confirmed", seats: 1 });
    expect((await getEvent(e.id))!.reservedSeats).toBe(3);
    const inv2 = (await invitationsOf(e.id))[2];
    expect(inv2.regStatus).toBe("waitlisted");
  });

  it("الاعتذار يحرر المقاعد وتكراره آمن، والمعتذر يؤكد لاحقًا إن توفر مقعد", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { invitations: guests(2, 1) });
    await setCapacity(e.id, 2);
    const invs = await invitationsOf(e.id);
    await confirmInvitation(invs[0].token, { name: "أحمد", contactType: "phone", contact: invs[0].phone!, withCompanion: true });
    expect((await getEvent(e.id))!.reservedSeats).toBe(2);
    const d = await Promise.all([declineInvitation(invs[0].token), declineInvitation(invs[0].token), declineInvitation(invs[0].token)]);
    expect(d.filter((x) => x.changed)).toHaveLength(1);
    expect((await getEvent(e.id))!.reservedSeats).toBe(0);
    const tks = await ticketsFor(e.id);
    expect(tks.every((t) => t.status === "cancelled")).toBe(true);
    // ضيف آخر يأخذ مقعدًا ثم المعتذر يعود بمقعد واحد
    await confirmInvitation(invs[1].token, { name: "بدر", contactType: "phone", contact: invs[1].phone! });
    const back = await confirmInvitation(invs[0].token, { name: "أحمد", contactType: "phone", contact: invs[0].phone!, withCompanion: true });
    expect(back).toEqual({ status: "one_left", canWaitlist: false });
    const back2 = await confirmInvitation(invs[0].token, { name: "أحمد", contactType: "phone", contact: invs[0].phone!, withCompanion: true }, { acceptSingle: true });
    expect(back2).toMatchObject({ status: "confirmed", seats: 1 });
    expect((await getEvent(e.id))!.reservedSeats).toBe(2);
    const all = await ticketsFor(e.id);
    expect(all.filter((t) => t.status === "active")).toHaveLength(2);
    expect((await invitationsOf(e.id))[0].regStatus).toBe("confirmed");
  });

  it("الاعتذار قبل التأكيد يُسجّل كـ «اعتذر»، والعام يعتذر من صفحة الإدارة", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { invitations: guests(1) });
    const [inv] = await invitationsOf(e.id);
    await declineInvitation(inv.token);
    expect((await invitationsOf(e.id))[0].regStatus).toBe("declined");
    const pub = await mkEvent(org, { type: "public", max: 50 });
    const r = await registerPublic(pub.publicSlug, `${uniq()}-decl-xxxxxxx`, pubInput(700));
    if (r.status !== "confirmed") throw new Error();
    await declineByManageToken(r.manageToken);
    expect((await getEvent(pub.id))!.reservedSeats).toBe(0);
    const again = await confirmRegistration(r.manageToken);
    expect(again.status).toBe("confirmed");
    expect((await getEvent(pub.id))!.reservedSeats).toBe(1);
  });

  it("حساب الباقة: 40 دعوة منها 10 بمرافق = 50 مكانًا", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { invitations: guests(40, 4), pay: false });
    const s = await packageSummary(org.id, e.id);
    expect(s.invitations).toBe(40);
    expect(s.withCompanion).toBe(10);
    expect(s.needed).toBe(50);
    expect(s.quote!.places).toBe(50);
  });

  it("التسجيل مغلق قبل الدفع", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { invitations: guests(1), pay: false });
    const [inv] = await invitationsOf(e.id);
    const r = await confirmInvitation(inv.token, { name: "أحمد", contactType: "phone", contact: inv.phone! });
    expect(r.status).toBe("closed");
  });
});
