import { describe, it, expect, beforeAll } from "vitest";
import { getOwnedEvent, updateEvent, cancelEvent, setEventTemplate } from "@/lib/core/events";
import { addInvitations, updateInvitation, deleteInvitation } from "@/lib/core/invitations";
import { sendToInvitations, estimateSend, scheduleReminder } from "@/lib/core/sending";
import { packageSummary, createPackagePayment, createExtraPlacesPayment, getOwnedPayment } from "@/lib/core/payments";
import { cancelRegistrationByOrganizer, resendTicketByOrganizer, offerWaitlistSpot, listWaitlist, confirmInvitation } from "@/lib/core/rsvp";
import { addStaff, removeStaff } from "@/lib/core/staff";
import { resetDb, mkUser, mkEvent, guests, invitationsOf, uniq } from "./helpers";

beforeAll(resetDb);

describe("عزل المنظّمين", () => {
  it("كل عمليات المنظّم على فعالية منظّم آخر = غير موجودة", async () => {
    const a = await mkUser("organizer", "أ");
    const b = await mkUser("organizer", "ب");
    const e = await mkEvent(a, { invitations: guests(2, 1) });
    const [inv] = await invitationsOf(e.id);
    const r = await confirmInvitation(inv.token, { name: "ضيف", contactType: "phone", contact: inv.phone! });
    if (r.status !== "confirmed") throw new Error();
    const { payment } = await createExtraPlacesPayment(a.id, e.id, 1);
    const nf = { code: "not_found" };
    const ops: [string, () => Promise<unknown>][] = [
      ["getOwnedEvent", () => getOwnedEvent(b.id, e.id)],
      ["updateEvent", () => updateEvent(b.id, e.id, { title: "x".repeat(5), orgName: "جهة", startLocal: "2030-01-01T10:00", endLocal: "2030-01-01T12:00", venue: "مكان", maxAttendees: 5, type: "private", fullPolicy: "close" })],
      ["cancelEvent", () => cancelEvent(b.id, e.id)],
      ["setEventTemplate", () => setEventTemplate(b.id, e.id, "tpl_plum_frame")],
      ["addInvitations", () => addInvitations(b.id, e.id, [{ name: "تسلل", phone: "0500000001" }])],
      ["updateInvitation", () => updateInvitation(b.id, inv.id, { name: "تسلل", phone: "0500000001" })],
      ["deleteInvitation", () => deleteInvitation(b.id, inv.id)],
      ["send", () => sendToInvitations({ ownerId: b.id, eventId: e.id, kind: "invitation", mode: "both", idemKey: uniq() })],
      ["estimate", () => estimateSend(b.id, e.id, "invitation", "both")],
      ["reminder", () => scheduleReminder(b.id, e.id, Date.now() + 3600_000, "both")],
      ["summary", () => packageSummary(b.id, e.id)],
      ["pay", () => createPackagePayment(b.id, e.id)],
      ["extra", () => createExtraPlacesPayment(b.id, e.id, 5)],
      ["payment", () => getOwnedPayment(b.id, payment.id)],
      ["cancelReg", () => cancelRegistrationByOrganizer(b.id, r.registrationId)],
      ["resend", () => resendTicketByOrganizer(b.id, r.registrationId)],
      ["offer", () => offerWaitlistSpot(b.id, r.registrationId, uniq())],
      ["waitlist", () => listWaitlist(b.id, e.id)],
      ["addStaff", () => addStaff(b.id, e.id, { name: "عضو", email: `x-${uniq()}@wafda.test` })],
      ["removeStaff", () => removeStaff(b.id, e.id, b.id)],
    ];
    for (const [name, op] of ops) {
      await expect(op(), name).rejects.toMatchObject(nf);
    }
    // صاحب الفعالية يعمل طبيعيًا
    await expect(getOwnedEvent(a.id, e.id)).resolves.toMatchObject({ id: e.id });
  });
});
