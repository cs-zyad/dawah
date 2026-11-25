import { describe, it, expect, beforeAll } from "vitest";
import { db, C } from "@/lib/db";
import { confirmInvitation, declineInvitation, offerWaitlistSpot, expireOffers, registerPublic, confirmRegistration } from "@/lib/core/rsvp";
import { getEvent } from "@/lib/core/events";
import { getUser } from "@/lib/core/users";
import type { Registration } from "@/lib/types";
import { resetDb, mkUser, mkEvent, guests, invitationsOf, setCapacity, topup, uniq } from "./helpers";

beforeAll(resetDb);

const conf = (inv: { token: string; name: string; phone: string | null }, o = {}) => confirmInvitation(inv.token, { name: inv.name, contactType: "phone", contact: inv.phone! }, o);

describe("قائمة الانتظار", () => {
  it("اختيار شخص من الانتظار ثم تأكيده، والفرصة تُخصم من الرصيد", async () => {
    const org = await mkUser();
    await topup(org, 10);
    const e = await mkEvent(org, { invitations: guests(3), policy: "waitlist" });
    await setCapacity(e.id, 1);
    const invs = await invitationsOf(e.id);
    await conf(invs[0]);
    const w = await conf(invs[1], { joinWaitlist: true });
    expect(w.status).toBe("waitlisted");
    if (w.status !== "waitlisted") return;
    // لا مقعد متاح => ممنوع إرسال فرصة
    await expect(offerWaitlistSpot(org.id, w.registrationId, uniq())).rejects.toMatchObject({ code: "no_seat" });
    await declineInvitation(invs[0].token);
    const before = (await getUser(org.id))!.creditBalance;
    const key = uniq();
    const o1 = await offerWaitlistSpot(org.id, w.registrationId, key);
    const o2 = await offerWaitlistSpot(org.id, w.registrationId, key); // ضغط مكرر
    expect(o1.duplicate).toBe(false);
    expect(o2.duplicate).toBe(true);
    expect((await getUser(org.id))!.creditBalance).toBe(before - 25);
    // الفرصة لا تحجز المقعد
    expect((await getEvent(e.id))!.reservedSeats).toBe(0);
    expect((await invitationsOf(e.id))[1].regStatus).toBe("offered");
    const c = await conf(invs[1]);
    expect(c.status).toBe("confirmed");
    expect((await getEvent(e.id))!.reservedSeats).toBe(1);
  });

  it("أخذ المقعد قبل تأكيد صاحب الفرصة يعيده للانتظار برسالة واضحة", async () => {
    const org = await mkUser();
    await topup(org, 10);
    const e = await mkEvent(org, { type: "public", max: 50, policy: "waitlist" });
    await setCapacity(e.id, 1);
    const a = await registerPublic(e.publicSlug, `${uniq()}-wa-xxxxxxxxx`, { name: "أحمد", contactType: "phone", contact: "0561000001" });
    const b = await registerPublic(e.publicSlug, `${uniq()}-wb-xxxxxxxxx`, { name: "بدر", contactType: "phone", contact: "0561000002" }, { joinWaitlist: true });
    const c = await registerPublic(e.publicSlug, `${uniq()}-wc-xxxxxxxxx`, { name: "جود", contactType: "phone", contact: "0561000003" }, { joinWaitlist: true });
    if (a.status !== "confirmed" || b.status !== "waitlisted" || c.status !== "waitlisted") throw new Error("setup");
    const { declineByManageToken } = await import("@/lib/core/rsvp");
    await declineByManageToken(a.manageToken);
    await offerWaitlistSpot(org.id, b.registrationId, uniq());
    await offerWaitlistSpot(org.id, c.registrationId, uniq());
    const cWins = await confirmRegistration(c.manageToken);
    expect(cWins.status).toBe("confirmed");
    const bLost = await confirmRegistration(b.manageToken);
    expect(bLost.status).toBe("offer_lost");
    const reg = (await db().collection(C.registrations).doc(b.registrationId).get()).data() as Registration;
    expect(reg.status).toBe("waitlisted");
    expect((await getEvent(e.id))!.reservedSeats).toBe(1);
  });

  it("الفرصة المنتهية تعود للانتظار تلقائيًا، وتأكيدها بعد الانتهاء مرفوض", async () => {
    const org = await mkUser();
    await topup(org, 10);
    const e = await mkEvent(org, { invitations: guests(3), policy: "waitlist" });
    await setCapacity(e.id, 1);
    const invs = await invitationsOf(e.id);
    await conf(invs[0]);
    const w1 = await conf(invs[1], { joinWaitlist: true });
    const w2 = await conf(invs[2], { joinWaitlist: true });
    if (w1.status !== "waitlisted" || w2.status !== "waitlisted") throw new Error();
    await declineInvitation(invs[0].token);
    await offerWaitlistSpot(org.id, w1.registrationId, uniq());
    await offerWaitlistSpot(org.id, w2.registrationId, uniq());
    // نجعل الفرص منتهية
    await db().collection(C.registrations).doc(w1.registrationId).update({ offerExpiresAt: Date.now() - 1000 });
    await db().collection(C.registrations).doc(w2.registrationId).update({ offerExpiresAt: Date.now() - 1000 });
    const r = await conf(invs[2]);
    expect(r.status).toBe("offer_expired");
    expect(await expireOffers()).toBe(1);
    const regs = await Promise.all([w1, w2].map(async (w) => ((await db().collection(C.registrations).doc(w.registrationId).get()).data() as Registration).status));
    expect(regs).toEqual(["waitlisted", "waitlisted"]);
    expect((await invitationsOf(e.id))[1].regStatus).toBe("waitlisted");
  });

  it("الرصيد غير الكافي يمنع إرسال الفرصة", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { invitations: guests(2), policy: "waitlist" });
    await setCapacity(e.id, 1);
    const invs = await invitationsOf(e.id);
    await conf(invs[0]);
    const w = await conf(invs[1], { joinWaitlist: true });
    if (w.status !== "waitlisted") throw new Error();
    await declineInvitation(invs[0].token);
    await expect(offerWaitlistSpot(org.id, w.registrationId, uniq())).rejects.toMatchObject({ code: "insufficient_credit" });
  });
});
