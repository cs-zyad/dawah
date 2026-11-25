import { db, C } from "../db";
import type { EventDoc, User } from "../types";
import { AppError, clampStr, normalizeEmail, notFound } from "../util";
import { audit } from "./audit";
import { getOwnedEvent } from "./events";
import { createSetupToken, createUser, findUserByEmail, getUser } from "./users";
import { getSettings } from "./settings";
import { buildMessage, dispatchMany } from "./messages";
import { renderMessage, eventVars } from "./messageTemplates";
import { appUrl, buildEventView, links } from "./view";

export interface StaffMember {
  id: string; // <eventId>_<userId>
  eventId: string;
  userId: string;
  ownerId: string;
  addedAt: number;
}

/**
 * يضيف عضو استقبال لفعالية. إن لم يكن له حساب يُنشأ بحالة «مدعو» ويصله رابط إنشاء كلمة مرور
 * (صالح 7 أيام افتراضيًا، يُستخدم مرة واحدة). الرسالة على حساب المنصة.
 */
export async function addStaff(ownerId: string, eventId: string, input: { name: string; email: string }) {
  const e = await getOwnedEvent(ownerId, eventId);
  if (e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
  const email = normalizeEmail(input.email);
  if (!email) throw new AppError("validation", "البريد غير صالح");
  const name = clampStr(input.name, 120);
  if (!name) throw new AppError("validation", "الاسم مطلوب");
  let user = await findUserByEmail(email);
  let created = false;
  if (!user) {
    user = await createUser({ email, name, role: "staff", status: "invited" });
    created = true;
  }
  if (user.id === ownerId) throw new AppError("self", "أنت المنظّم وتستطيع التحضير دائمًا");
  if (user.status === "suspended") throw new AppError("suspended", "هذا الحساب موقوف");
  const ref = db().collection(C.eventStaff).doc(`${eventId}_${user.id}`);
  const exists = (await ref.get()).exists;
  if (!exists) {
    const m: StaffMember = { id: ref.id, eventId, userId: user.id, ownerId, addedAt: Date.now() };
    await ref.set(m);
  }
  const settings = await getSettings();
  let accessLine = `ادخل إلى صفحة التحضير: ${appUrl()}/checkin`;
  if (user.status === "invited") {
    const token = await createSetupToken(user.id, settings.policies.staffInviteDays);
    accessLine = `أنشئ كلمة المرور من الرابط (صالح ${settings.policies.staffInviteDays} أيام ولمرة واحدة):\n${links.setup(token)}`;
  }
  if (!exists || user.status === "invited") {
    const view = buildEventView(e);
    const msg = renderMessage("staff_invite", { ...eventVars(view), staff_name: user.name, access_line: accessLine }, "email");
    const id = db().collection(C.messages).doc().id;
    await db()
      .collection(C.messages)
      .doc(id)
      .set(
        buildMessage(id, {
          ...msg,
          kind: "staff_invite",
          channel: "email",
          to: user.email,
          vars: {},
          chargedTo: "platform",
          cost: 0,
          opCost: settings.pricing.confirmationOpCost.email,
          ownerId,
          eventId,
        }),
      );
    await dispatchMany([id]);
  }
  await audit(ownerId, "staff.add", `events/${eventId}`, { userId: user.id, email, created });
  return { user, created, alreadyMember: exists };
}

export async function removeStaff(ownerId: string, eventId: string, userId: string) {
  await getOwnedEvent(ownerId, eventId);
  const ref = db().collection(C.eventStaff).doc(`${eventId}_${userId}`);
  if (!(await ref.get()).exists) throw notFound("العضو");
  await ref.delete();
  await audit(ownerId, "staff.remove", `events/${eventId}`, { userId });
}

export async function listStaff(eventId: string): Promise<(StaffMember & { user: User | null })[]> {
  const qs = await db().collection(C.eventStaff).where("eventId", "==", eventId).get();
  const members = qs.docs.map((d) => d.data() as StaffMember).sort((a, b) => a.addedAt - b.addedAt);
  return Promise.all(members.map(async (m) => ({ ...m, user: await getUser(m.userId) })));
}

/** الفعاليات المتاحة للتحضير لهذا المستخدم: فعالياته كمنظّم + المعيّن عليها. */
export async function checkInEventsFor(userId: string): Promise<{ event: EventDoc; role: "owner" | "staff" }[]> {
  const [own, st] = await Promise.all([
    db().collection(C.events).where("ownerId", "==", userId).get(),
    db().collection(C.eventStaff).where("userId", "==", userId).get(),
  ]);
  const out: { event: EventDoc; role: "owner" | "staff" }[] = own.docs
    .map((d) => d.data() as EventDoc)
    .filter((e) => e.status === "active")
    .map((event) => ({ event, role: "owner" as const }));
  for (const d of st.docs) {
    const ev = await db().collection(C.events).doc((d.data() as StaffMember).eventId).get();
    if (ev.exists && (ev.data() as EventDoc).status === "active") out.push({ event: ev.data() as EventDoc, role: "staff" });
  }
  return out.sort((a, b) => a.event.startAt - b.event.startAt);
}
