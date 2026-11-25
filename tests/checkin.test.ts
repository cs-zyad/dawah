import { describe, it, expect, beforeAll } from "vitest";
import { confirmInvitation, declineInvitation, registerPublic } from "@/lib/core/rsvp";
import { checkInByToken, checkInManually, searchAttendees } from "@/lib/core/checkin";
import { addStaff } from "@/lib/core/staff";
import { getEvent } from "@/lib/core/events";
import { completeSetup, findUserByEmail } from "@/lib/core/users";
import { db, C } from "@/lib/db";
import { resetDb, mkUser, mkEvent, guests, invitationsOf, uniq } from "./helpers";

beforeAll(resetDb);

async function setup() {
  const org = await mkUser();
  const e = await mkEvent(org, { invitations: guests(3, 1) });
  const invs = await invitationsOf(e.id);
  const r = await confirmInvitation(invs[0].token, { name: "محمد العتيبي", contactType: "phone", contact: "0551112233", withCompanion: true });
  if (r.status !== "confirmed") throw new Error("no confirm");
  const guestT = r.tickets.find((t) => t.kind === "guest")!.token;
  const compT = r.tickets.find((t) => t.kind === "companion")!.token;
  return { org, e, invs, guestT, compT, regId: r.registrationId };
}

describe("التحضير", () => {
  it("مسح صالح ثم مكرر = «حضر مسبقًا»، والمرافق يُحضّر يدويًا", async () => {
    const { org, e, guestT, regId } = await setup();
    const ok = await checkInByToken(org, e.id, guestT);
    expect(ok).toMatchObject({ result: "ok", label: "محمد العتيبي" });
    const again = await checkInByToken(org, e.id, `http://localhost:3000/t/${guestT}`);
    expect(again).toMatchObject({ result: "already", method: "scan", byName: org.name });
    const manual = await checkInManually(org, e.id, `${regId}_companion`);
    expect(manual).toMatchObject({ result: "ok", label: "مرافق — محمد العتيبي" });
    const manualAgain = await checkInManually(org, e.id, `${regId}_companion`);
    expect(manualAgain).toMatchObject({ result: "already", method: "manual" });
    const ev = await getEvent(e.id);
    expect(ev!.checkedInGuests).toBe(1);
    expect(ev!.checkedInCompanions).toBe(1);
  });

  it("مسح متزامن من أجهزة متعددة لا يكرر الحضور", async () => {
    const { org, e, guestT, regId } = await setup();
    const rs = await Promise.all([
      ...Array.from({ length: 8 }, () => checkInByToken(org, e.id, guestT)),
      checkInManually(org, e.id, `${regId}_guest`),
      checkInManually(org, e.id, `${regId}_guest`),
    ]);
    expect(rs.filter((r) => r.result === "ok")).toHaveLength(1);
    expect(rs.filter((r) => r.result === "already")).toHaveLength(9);
    expect((await getEvent(e.id))!.checkedInGuests).toBe(1);
  });

  it("عضو غير معيّن ممنوع، والمعيّن يعمل على فعاليته فقط", async () => {
    const { org, e, guestT } = await setup();
    const stranger = await mkUser("staff", "غريب");
    await expect(checkInByToken(stranger, e.id, guestT)).rejects.toMatchObject({ code: "not_found" });
    await expect(searchAttendees(stranger, e.id, "محمد")).rejects.toMatchObject({ code: "not_found" });
    const email = `st-${uniq()}@wafda.test`;
    await addStaff(org.id, e.id, { name: "عضو الاستقبال", email });
    const invited = await findUserByEmail(email);
    expect(invited!.status).toBe("invited");
    // يستخدم رابط إنشاء كلمة المرور من الرسالة
    const msg = (await db().collection(C.messages).where("to", "==", email).get()).docs[0].data();
    const token = /set-password\/([A-Za-z0-9_-]+)/.exec(msg.body)![1];
    await completeSetup(token, "Wafda@2026");
    await expect(completeSetup(token, "Wafda@2026")).rejects.toMatchObject({ code: "used_token" });
    const staff = (await findUserByEmail(email))!;
    expect(staff.status).toBe("active");
    expect(await checkInByToken(staff, e.id, guestT)).toMatchObject({ result: "ok" });
    // نفس العضو على فعالية أخرى لم يُعيّن عليها
    const other = await mkEvent(org, { invitations: guests(1) });
    await expect(checkInByToken(staff, other.id, guestT)).rejects.toMatchObject({ code: "not_found" });
  });

  it("تذكرة لفعالية أخرى لا تكشف بياناتها، والتذكرة الملغاة رسالة واضحة", async () => {
    const a = await setup();
    const b = await setup();
    const wrong = await checkInByToken(a.org, a.e.id, b.guestT);
    expect(wrong).toEqual({ result: "wrong_event" });
    // نفس المنظّم لفعاليتين: ما زالت لا تخص هذه الفعالية
    const e2 = await mkEvent(a.org, { type: "public", max: 50 });
    const r = await registerPublic(e2.publicSlug, `${uniq()}-ck-xxxxxxxxx`, { name: "سلمى", contactType: "email", contact: "s@example.com" });
    if (r.status !== "confirmed") throw new Error();
    expect(await checkInByToken(a.org, a.e.id, r.tickets[0].token)).toEqual({ result: "wrong_event" });
    // ملغاة
    await declineInvitation(a.invs[0].token);
    expect(await checkInByToken(a.org, a.e.id, a.guestT)).toMatchObject({ result: "cancelled" });
    expect(await checkInByToken(a.org, a.e.id, "not-a-real-token-xxxxxxxx")).toEqual({ result: "not_found" });
  });

  it("لا يمكن الاعتذار بعد تسجيل الحضور", async () => {
    const { org, e, invs, guestT } = await setup();
    await checkInByToken(org, e.id, guestT);
    await expect(declineInvitation(invs[0].token)).rejects.toMatchObject({ code: "checked_in" });
  });

  it("البحث بالاسم أو أي جزء من الجوال بأي صيغة أو البريد — داخل الفعالية فقط", async () => {
    const { org, e } = await setup();
    const b = await setup(); // فعالية أخرى بنفس الاسم
    for (const q of ["محمد", "العتيبى", "0551112233", "+966 55 111", "1112233", "٠٥٥١١١"]) {
      const hits = await searchAttendees(org, e.id, q);
      expect(hits, q).toHaveLength(1);
      expect(hits[0].tickets).toHaveLength(2);
    }
    expect(await searchAttendees(org, e.id, "غير موجود")).toHaveLength(0);
    // منظّم الفعالية الأخرى لا يرى نتائج هذه الفعالية
    await expect(searchAttendees(b.org, e.id, "محمد")).rejects.toMatchObject({ code: "not_found" });
  });
});
