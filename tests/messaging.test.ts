import { describe, it, expect, beforeAll } from "vitest";
import { db, C } from "@/lib/db";
import { estimateSend, sendToInvitations, scheduleReminder, runDueReminders } from "@/lib/core/sending";
import { confirmInvitation, declineInvitation } from "@/lib/core/rsvp";
import { dispatchDue } from "@/lib/core/messages";
import { updateSettings } from "@/lib/core/settings";
import { getUser } from "@/lib/core/users";
import { addInvitations } from "@/lib/core/invitations";
import type { MessageDoc } from "@/lib/types";
import type { Reminder } from "@/lib/core/sending";
import { resetDb, mkUser, mkEvent, invitationsOf, topup, uniq } from "./helpers";

beforeAll(resetDb);

async function msgs(eventId: string, kind?: string) {
  const qs = await db().collection(C.messages).where("eventId", "==", eventId).get();
  return qs.docs.map((d) => d.data() as MessageDoc).filter((m) => !kind || m.kind === kind);
}
const balance = async (id: string) => (await getUser(id))!.creditBalance;

describe("الإرسال ورصيد الرسائل", () => {
  it("الخصم حسب القناة، والضغط المتكرر لا يكرر الخصم ولا الرسائل", async () => {
    const org = await mkUser();
    await topup(org, 20);
    const e = await mkEvent(org, {
      invitations: [
        { name: "واتساب وبريد", phone: "0570000001", email: "both@example.com" },
        { name: "واتساب فقط", phone: "0570000002" },
        { name: "بريد فقط", email: "mail@example.com" },
      ],
    });
    const est = await estimateSend(org.id, e.id, "invitation", "both");
    expect(est.byChannel).toEqual({ whatsapp: 2, email: 2 });
    expect(est.cost).toBe(2 * 25 + 2 * 5);
    const key = uniq();
    const [a, b] = await Promise.all([
      sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "invitation", mode: "both", idemKey: key }),
      sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "invitation", mode: "both", idemKey: key }),
    ]);
    expect(a.status).toBe("sent");
    expect(b.status).toBe("sent");
    const c = await sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "invitation", mode: "both", idemKey: key });
    expect(c).toMatchObject({ status: "sent", duplicate: true });
    expect(await balance(org.id)).toBe(2000 - 60);
    const ms = await msgs(e.id, "invitation");
    expect(ms).toHaveLength(4);
    expect(ms.every((m) => m.status === "sent" && m.chargedTo === "credit")).toBe(true);
    const invs = await invitationsOf(e.id);
    expect(invs.every((i) => i.sendStatus === "sent")).toBe(true);
    // البريد في صندوق الرسائل التجريبي
    const inbox = await db().collection(C.devInbox).where("eventId", "==", e.id).get();
    expect(inbox.size).toBe(4);
    expect(inbox.docs[0].data().body).toContain("/i/");
  });

  it("الرصيد غير الكافي — سياسة المنع: لا يُرسل ولا يُخصم شيء", async () => {
    const org = await mkUser();
    await topup(org, 10); // 1000 هللة
    const invs = Array.from({ length: 50 }, (_, i) => ({ name: `ضيف ${i}`, phone: `05800${String(i + 10001).slice(-5)}` }));
    const e = await mkEvent(org, { invitations: invs }); // 50 × 25 = 1250 > 1000
    const r = await sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "invitation", mode: "whatsapp", idemKey: uniq() });
    expect(r).toMatchObject({ status: "insufficient", needed: 1250, balance: 1000 });
    expect(await balance(org.id)).toBe(1000);
    expect(await msgs(e.id)).toHaveLength(0);
  });

  it("سياسة «إرسال ما يغطيه الرصيد» بترتيب القائمة", async () => {
    await updateSettings("test", { policies: { insufficientCredit: "partial" } });
    try {
      const org = await mkUser();
      await topup(org, 10);
      const invs = Array.from({ length: 50 }, (_, i) => ({ name: `ضيف ${i}`, phone: `05810${String(i + 10001).slice(-5)}` }));
      const e = await mkEvent(org, { invitations: invs });
      const r = await sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "invitation", mode: "whatsapp", idemKey: uniq() });
      expect(r).toMatchObject({ status: "sent", messages: 40, skippedForCredit: 10, balanceAfter: 0 });
      const sentNames = (await invitationsOf(e.id)).filter((i) => i.sendStatus === "sent").map((i) => i.name);
      expect(sentNames).toEqual(invs.slice(0, 40).map((i) => i.name));
    } finally {
      await updateSettings("test", { policies: { insufficientCredit: "block" } });
    }
  });

  it("الفشل النهائي يسترجع القيمة، والفشل المؤقت يعاد حتى ينجح", async () => {
    const org = await mkUser();
    await topup(org, 10);
    const e = await mkEvent(org, {
      invitations: [
        { name: "يفشل", phone: "0590000000" },
        { name: "متقطع", phone: "0590001111" },
        { name: "بريد يفشل", email: "fail@example.com" },
        { name: "سليم", phone: "0590002222" },
      ],
    });
    const r = await sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "invitation", mode: "both", idemKey: uniq() });
    expect(r.status).toBe("sent");
    expect(await balance(org.id)).toBe(1000 - (3 * 25 + 5) + 25 + 5); // استرجاع رسالتين فشلتا نهائيًا
    let ms = await msgs(e.id);
    const flaky = ms.find((m) => m.to.endsWith("1111"))!;
    expect(flaky.status).toBe("queued");
    expect(flaky.attempts).toBe(1);
    await dispatchDue();
    ms = await msgs(e.id);
    expect(ms.find((m) => m.to.endsWith("1111"))!.status).toBe("sent");
    expect(ms.find((m) => m.to.endsWith("0000"))).toMatchObject({ status: "failed", refunded: true, attempts: 1 });
    const invs = await invitationsOf(e.id);
    expect(invs.find((i) => i.name === "يفشل")!.sendStatus).toBe("failed");
    expect(invs.find((i) => i.name === "يفشل")!.regStatus).toBe("none"); // «تعذّر الإرسال» مستقل عن «لم يؤكد»
    expect(invs.find((i) => i.name === "متقطع")!.sendStatus).toBe("sent");
    // إعادة المحاولة المتكررة لا تكرر الاسترجاع
    await dispatchDue();
    expect(await balance(org.id)).toBe(1000 - 50);
  });

  it("3 محاولات للفشل المؤقت ثم «فشلت» مع الاسترجاع", async () => {
    const { setMessageProvider, getMessageProvider } = await import("@/lib/providers/messaging");
    const real = getMessageProvider("whatsapp");
    setMessageProvider({ channel: "whatsapp", name: "x", mode: "mock", send: async () => ({ ok: false, permanent: false, error: "مؤقت" }) });
    try {
      const org = await mkUser();
      await topup(org, 10);
      const e = await mkEvent(org, { invitations: [{ name: "دائم التعطل", phone: "0591234567" }] });
      await sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "invitation", mode: "whatsapp", idemKey: uniq() });
      await dispatchDue();
      await dispatchDue();
      await dispatchDue();
      const [m] = await msgs(e.id);
      expect(m).toMatchObject({ status: "failed", attempts: 3, refunded: true });
      expect(await balance(org.id)).toBe(1000);
    } finally {
      setMessageProvider(real);
    }
  });

  it("التذكير يصل فقط لمن وصلته الدعوة ولم يرد", async () => {
    const org = await mkUser();
    await topup(org, 10);
    const e = await mkEvent(org, {
      invitations: [
        { name: "لم يرد", phone: "0520000101" },
        { name: "أكّد", phone: "0520000102" },
        { name: "اعتذر", phone: "0520000103" },
        { name: "فشل إرساله", phone: "0520000000" },
      ],
    });
    await addInvitations(org.id, e.id, []); // لا شيء
    await sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "invitation", mode: "whatsapp", idemKey: uniq() });
    const invs = await invitationsOf(e.id);
    await confirmInvitation(invs[1].token, { name: "أكّد", contactType: "phone", contact: invs[1].phone! });
    await declineInvitation(invs[2].token);
    const est = await estimateSend(org.id, e.id, "reminder", "whatsapp");
    expect(est.recipients).toBe(1);
    const r = await sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "reminder", mode: "whatsapp", idemKey: uniq() });
    expect(r).toMatchObject({ status: "sent", messages: 1 });
    const rem = await msgs(e.id, "reminder");
    expect(rem.map((m) => m.to)).toEqual([invs[0].phone]);
  });

  it("التذكير المجدول يفحص الحالة لحظة التنفيذ ولا يُنفّذ مرتين", async () => {
    const org = await mkUser();
    await topup(org, 10);
    const e = await mkEvent(org, { invitations: [{ name: "أول", phone: "0520000201" }, { name: "ثاني", phone: "0520000202" }] });
    await sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "invitation", mode: "whatsapp", idemKey: uniq() });
    const rem = await scheduleReminder(org.id, e.id, Date.now() + 120_000, "whatsapp");
    // بعد الجدولة وقبل التنفيذ: أحدهما يؤكد
    const invs = await invitationsOf(e.id);
    await confirmInvitation(invs[0].token, { name: "أول", contactType: "phone", contact: invs[0].phone! });
    await db().collection(C.reminders).doc(rem.id).update({ runAt: Date.now() - 1 });
    const bal = await balance(org.id);
    const [r1, r2] = await Promise.all([runDueReminders(), runDueReminders()]);
    expect(r1.length + r2.length).toBe(1);
    await runDueReminders();
    const doc = (await db().collection(C.reminders).doc(rem.id).get()).data() as Reminder;
    expect(doc.status).toBe("done");
    const sent = await msgs(e.id, "reminder");
    expect(sent.map((m) => m.to)).toEqual([invs[1].phone]);
    expect(await balance(org.id)).toBe(bal - 25);
    // انتهاء مهلة التنفيذ وإعادة التشغيل لا تكرر الخصم
    await db().collection(C.reminders).doc(rem.id).update({ status: "running", leaseUntil: Date.now() - 1 });
    await runDueReminders();
    expect(await balance(org.id)).toBe(bal - 25);
    expect(await msgs(e.id, "reminder")).toHaveLength(1);
  });

  it("التذكير المجدول يفشل بسبب الرصيد دون إرسال جزئي", async () => {
    const org = await mkUser();
    await topup(org, 10);
    const invs = Array.from({ length: 30 }, (_, i) => ({ name: `ضيف ${i}`, phone: `05830${String(i + 10001).slice(-5)}` }));
    const e = await mkEvent(org, { invitations: invs });
    await sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "invitation", mode: "whatsapp", idemKey: uniq() }); // 750
    const rem = await scheduleReminder(org.id, e.id, Date.now() + 120_000, "whatsapp");
    await db().collection(C.reminders).doc(rem.id).update({ runAt: Date.now() - 1 });
    await runDueReminders();
    const doc = (await db().collection(C.reminders).doc(rem.id).get()).data() as Reminder;
    expect(doc.status).toBe("failed");
    expect(doc.result).toContain("رصيد");
    expect(await msgs(e.id, "reminder")).toHaveLength(0);
    expect(await balance(org.id)).toBe(250);
  });

  it("إضافة مدعوين يتجاوزون الباقة تمنع الإرسال حتى شراء أماكن", async () => {
    const org = await mkUser();
    await topup(org, 10);
    const e = await mkEvent(org, { invitations: Array.from({ length: 50 }, (_, i) => ({ name: `ض${i}`, email: `g${i}@example.com` })) });
    await addInvitations(org.id, e.id, [{ name: "زائد", email: "extra@example.com", allowCompanion: true }]);
    await expect(sendToInvitations({ ownerId: org.id, eventId: e.id, kind: "invitation", mode: "email", idemKey: uniq() })).rejects.toMatchObject({ code: "over_package" });
  });
});
