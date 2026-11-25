import { describe, it, expect, beforeAll } from "vitest";
import { createDesignRequest, sendQuote, acceptQuote, payDesign, startDesignWork, deliverDesign, getDesignRequest, cancelDesign } from "@/lib/core/designs";
import { templatesForOrganizer } from "@/lib/core/templates";
import { createSupportTicket, replySupport, getSupportTicket } from "@/lib/core/support";
import { getPayment } from "@/lib/core/payments";
import { resetDb, mkUser, sendWebhook } from "./helpers";

beforeAll(resetDb);

describe("طلب التصميم الخاص والدعم", () => {
  it("مراجعة ← عرض سعر ← قبول ← دفع بإشعار ← تنفيذ ← تسليم كقالب خاص بالمنظّم فقط", async () => {
    const org = await mkUser();
    const other = await mkUser();
    const admin = await mkUser("admin", "أدمن");
    const d = await createDesignRequest(org.id, { title: "قالب النادي", details: "ألوان النادي مع الشعار" });
    expect(d.status).toBe("pending_review");
    await expect(acceptQuote(org.id, d.id)).rejects.toMatchObject({ code: "bad_state" });
    await sendQuote(admin.id, d.id, { amount: 30000, notes: "جولتا تعديل", validDays: 5 });
    await expect(acceptQuote(other.id, d.id)).rejects.toMatchObject({ code: "not_found" });
    await acceptQuote(org.id, d.id);
    const { payment } = await payDesign(org.id, d.id);
    expect(payment.amount).toBe(30000);
    await expect(startDesignWork(admin.id, d.id)).rejects.toMatchObject({ code: "bad_state" }); // قبل الدفع
    expect((await sendWebhook(payment)).outcome).toBe("applied");
    expect((await getPayment(payment.id))!.status).toBe("paid");
    expect((await getDesignRequest(d.id))!.status).toBe("paid");
    await startDesignWork(admin.id, d.id);
    const t = await deliverDesign(admin.id, d.id, { layout: "lilac_soft", name: "قالب النادي الخاص", category: "خاص", colors: ["#E8DEED", "#28182C", "#FFFFFF", "#DDF480", "#65586B"], order: 0 });
    expect((await getDesignRequest(d.id))!).toMatchObject({ status: "delivered", templateId: t.id });
    expect((await templatesForOrganizer(org.id)).some((x) => x.id === t.id)).toBe(true);
    expect((await templatesForOrganizer(other.id)).some((x) => x.id === t.id)).toBe(false);
  });

  it("عرض منتهي لا يُقبل، والإلغاء قبل الدفع", async () => {
    const org = await mkUser();
    const admin = await mkUser("admin", "أدمن");
    const d = await createDesignRequest(org.id, { title: "طلب ينتهي", details: "تفاصيل كافية للطلب" });
    await sendQuote(admin.id, d.id, { amount: 10000, notes: "", validDays: 1 });
    const { db, C } = await import("@/lib/db");
    await db().collection(C.designRequests).doc(d.id).update({ "quote.expiresAt": Date.now() - 1 });
    await expect(acceptQuote(org.id, d.id)).rejects.toMatchObject({ code: "expired" });
    await cancelDesign(org.id, d.id);
    expect((await getDesignRequest(d.id))!.status).toBe("cancelled");
  });

  it("الشكوى: حالات وردود، ومعزولة عن منظّم آخر", async () => {
    const org = await mkUser();
    const other = await mkUser();
    const admin = await mkUser("admin", "أدمن");
    const t = await createSupportTicket(org, { kind: "complaint", subject: "شكوى تجريبية", body: "تفاصيل الشكوى" });
    await expect(getSupportTicket(other, t.id)).rejects.toMatchObject({ code: "not_found" });
    await replySupport(admin, t.id, "نعمل عليها", "in_progress");
    expect((await getSupportTicket(org, t.id)).status).toBe("in_progress");
    await replySupport(admin, t.id, "", "resolved");
    await replySupport(org, t.id, "ما زالت المشكلة");
    expect((await getSupportTicket(org, t.id)).status).toBe("open");
  });
});
