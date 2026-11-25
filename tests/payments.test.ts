import { describe, it, expect, beforeAll } from "vitest";
import { db, C } from "@/lib/db";
import { createExtraPlacesPayment, createPackagePayment, createTopupPayment, getPayment } from "@/lib/core/payments";
import { createEvent, getEvent } from "@/lib/core/events";
import { addInvitations } from "@/lib/core/invitations";
import { getUser } from "@/lib/core/users";
import { listLedger } from "@/lib/core/credit";
import { msToRiyadhLocal, DAY } from "@/lib/util";
import { resetDb, mkUser, mkEvent, guests, sendWebhook, uniq } from "./helpers";

beforeAll(resetDb);

describe("الدفع عبر إشعار موقّع", () => {
  it("تكرار إشعار الدفع متتابعًا ومتزامنًا لا يكرر زيادة المقاعد", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { invitations: guests(10), pay: false });
    const { payment } = await createPackagePayment(org.id, e.id);
    expect(payment.amount).toBe(9900);
    const id = `evt_${uniq()}`;
    const first = await sendWebhook(payment, { eventId: id });
    const second = await sendWebhook(payment, { eventId: id });
    const parallel = await Promise.all(Array.from({ length: 5 }, () => sendWebhook(payment, { eventId: id })));
    expect(first.outcome).toBe("applied");
    expect(second.outcome).toBe("duplicate");
    expect(parallel.every((p) => p.outcome === "duplicate")).toBe(true);
    // إشعار مختلف لنفس الدفع لا يطبّق الأثر مرة ثانية
    expect((await sendWebhook(payment)).outcome).toBe("already_paid");
    const ev = await getEvent(e.id);
    expect(ev!.paidPlaces).toBe(50);
    expect(ev!.status).toBe("active");
  });

  it("إشعارات متزامنة بمعرّفات مختلفة لنفس الدفع = تطبيق واحد", async () => {
    const org = await mkUser();
    const { payment } = await createTopupPayment(org.id, 5000);
    const rs = await Promise.all(Array.from({ length: 6 }, () => sendWebhook(payment)));
    expect(rs.filter((r) => r.outcome === "applied")).toHaveLength(1);
    expect((await getUser(org.id))!.creditBalance).toBe(5000);
    expect((await listLedger(org.id)).filter((l) => l.reason === "topup")).toHaveLength(1);
  });

  it("رفض التوقيع الخاطئ والمبلغ أو العملة الخاطئة", async () => {
    const org = await mkUser();
    const { payment } = await createTopupPayment(org.id, 2000);
    expect(await sendWebhook(payment, { badSig: true })).toMatchObject({ status: 401 });
    expect((await sendWebhook(payment, { amount: 1 })).outcome).toBe("rejected");
    expect((await sendWebhook(payment, { currency: "USD" })).outcome).toBe("rejected");
    expect((await getUser(org.id))!.creditBalance).toBe(0);
    expect((await getPayment(payment.id))!.status).toBe("pending");
    expect((await sendWebhook(payment)).outcome).toBe("applied");
    expect((await getUser(org.id))!.creditBalance).toBe(2000);
  });

  it("محاكاة فشل الدفع لا تضيف شيئًا", async () => {
    const org = await mkUser();
    const { payment } = await createTopupPayment(org.id, 2000);
    expect((await sendWebhook(payment, { type: "payment.failed" })).outcome).toBe("failed_recorded");
    expect((await getPayment(payment.id))!.status).toBe("failed");
    expect((await getUser(org.id))!.creditBalance).toBe(0);
  });

  it("الأماكن الإضافية: في العامة ترفع الحد الأقصى بنفس العدد", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { type: "public", max: 40 });
    expect(e.paidPlaces).toBe(50);
    const { payment } = await createExtraPlacesPayment(org.id, e.id, 15);
    expect(payment.amount).toBe(15 * 200);
    await sendWebhook(payment);
    const ev = await getEvent(e.id);
    expect(ev!.paidPlaces).toBe(65);
    expect(ev!.maxAttendees).toBe(55);
  });

  it("الدفع يشترط القالب والمدعوين، ولا يُدفع مرتين", async () => {
    const org = await mkUser();
    const start = Date.now() + 3 * DAY;
    const e = await createEvent(org.id, {
      title: "بدون قالب",
      orgName: "جهة",
      startLocal: msToRiyadhLocal(start),
      endLocal: msToRiyadhLocal(start + 3600_000),
      venue: "مكان",
      maxAttendees: 10,
      type: "private",
      fullPolicy: "close",
    });
    await expect(createPackagePayment(org.id, e.id)).rejects.toMatchObject({ code: "blocked" });
    await addInvitations(org.id, e.id, guests(2));
    await expect(createPackagePayment(org.id, e.id)).rejects.toMatchObject({ code: "blocked" });
    const paid = await mkEvent(org, { invitations: guests(2) });
    await expect(createPackagePayment(org.id, paid.id)).rejects.toMatchObject({ code: "already_paid" });
  });

  it("سجل الإشعارات", async () => {
    const logs = await db().collection(C.webhookEvents).get();
    expect(logs.size).toBeGreaterThan(5);
  });
});
