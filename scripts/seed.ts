/**
 * البيانات التجريبية — تُنشأ عبر خدمات المنتج نفسها (الدفع بإشعار موقّع، الإرسال من الرصيد، التأكيد، التحضير)
 * حتى تكون متسقة. لا تكرر البيانات إن شُغّلت مرتين (علامة meta/seed).
 * التشغيل: npm run seed   (أو تلقائيًا مع npm run dev:local)
 */
import { db, C, firebaseConfigStatus } from "../src/lib/db";
import { createUser, findUserByEmail } from "../src/lib/core/users";
import { ensureDefaultTemplates } from "../src/lib/core/templates";
import { createEvent, setEventTemplate, listInvitations } from "../src/lib/core/events";
import { addInvitations } from "../src/lib/core/invitations";
import { createPackagePayment, createTopupPayment, handlePaymentWebhook, type Payment } from "../src/lib/core/payments";
import { signPayload, SIGNATURE_HEADER } from "../src/lib/providers/payments";
import { sendToInvitations } from "../src/lib/core/sending";
import { confirmInvitation, declineInvitation, registerPublic } from "../src/lib/core/rsvp";
import { addStaff } from "../src/lib/core/staff";
import { checkInByToken } from "../src/lib/core/checkin";
import { createDesignRequest, sendQuote } from "../src/lib/core/designs";
import { createSupportTicket } from "../src/lib/core/support";
import { appUrl, links } from "../src/lib/core/view";
import { completeSetupForSeed } from "./seed-helpers";
import { randomToken, DAY } from "../src/lib/util";
import type { User } from "../src/lib/types";

const PASSWORD = "Wafda@2026";
const ifEmpty = process.argv.includes("--if-empty");

async function pay(p: Pick<Payment, "id" | "amount" | "currency">) {
  const body = JSON.stringify({ id: `evt_seed_${randomToken(10)}`, type: "payment.succeeded", paymentId: p.id, amount: p.amount, currency: p.currency });
  const r = await handlePaymentWebhook(body, new Headers({ [SIGNATURE_HEADER]: signPayload(body) }));
  if (r.outcome !== "applied") throw new Error(`فشل الدفع التجريبي: ${r.outcome}`);
}

async function user(email: string, name: string, role: User["role"]) {
  return (await findUserByEmail(email)) ?? (await createUser({ email, name, role, password: PASSWORD }));
}

/** موعد بعد n أيام الساعة hh بتوقيت الرياض (صيغة datetime-local) */
function riyadhAt(days: number, hh: number) {
  const d = new Date(Date.now() + days * DAY + 3 * 3600_000);
  return `${d.toISOString().slice(0, 10)}T${String(hh).padStart(2, "0")}:00`;
}

async function main() {
  const st = firebaseConfigStatus();
  if (!st.ok) {
    console.error(`✖ ${st.message}`);
    process.exit(1);
  }
  const marker = db().collection(C.meta).doc("seed");
  const existing = await marker.get();
  if (existing.exists) {
    console.log(`✓ البيانات التجريبية موجودة مسبقًا. لم يُكرر شيء.`);
    printLinks(existing.data()!.links);
    return;
  }
  if (ifEmpty) {
    const anyUser = await db().collection(C.users).limit(1).get();
    if (!anyUser.empty) {
      console.log("ℹ توجد بيانات في القاعدة بلا علامة تجريبية؛ تخطّي التعبئة.");
      return;
    }
  }
  const lock = db().collection(C.meta).doc("seed_lock");
  try {
    await lock.create({ at: Date.now() });
  } catch {
    console.log("ℹ سكربت تعبئة آخر يعمل أو توقف سابقًا. احذف meta/seed_lock إن لزم.");
    return;
  }

  console.log("… إنشاء البيانات التجريبية");
  await ensureDefaultTemplates();
  const org = await user("organizer@wafda.test", "نادي التقنية", "organizer");
  const admin = await user("admin@wafda.test", "أدمن وفدة", "admin");
  const other = await user("other@wafda.test", "شركة أخرى", "organizer");

  // رصيد 100 ر.س عبر شحن مدفوع بإشعار موقّع
  await pay((await createTopupPayment(org.id, 10000)).payment);
  await pay((await createTopupPayment(other.id, 2000)).payment);

  const base = { orgName: "نادي التقنية — جامعة الملك سعود", venue: "قاعة الملتقى", address: "حي الملقا، الرياض", mapUrl: "https://maps.google.com/?q=24.8,46.6" };

  // ===== 1. دعوات خاصة مدفوعة بسياسة انتظار
  const e1 = await createEvent(org.id, {
    ...base,
    title: "ملتقى النادي السنوي",
    description: "لقاء سنوي لأعضاء النادي وشركائه: عروض مشاريع، وتكريم، وعشاء.",
    startLocal: riyadhAt(2, 18),
    endLocal: riyadhAt(2, 22),
    maxAttendees: 60,
    type: "private",
    fullPolicy: "waitlist",
  });
  await setEventTemplate(org.id, e1.id, "tpl_plum_frame");
  await addInvitations(org.id, e1.id, [
    { name: "سارة العتيبي", phone: "0551000101" },
    { name: "خالد الدوسري", phone: "0551000102", allowCompanion: true },
    { name: "نورة الشهري", phone: "0551000103" },
    { name: "محمد القحطاني", phone: "0551000104", email: "mohammed@example.com", allowCompanion: true },
    { name: "ريم الزهراني", phone: "0551000105" },
    { name: "فهد الحربي", phone: "0551230000" },
    { name: "هند السبيعي", email: "hind@example.com" },
  ]);
  await pay((await createPackagePayment(org.id, e1.id)).payment);
  await sendToInvitations({ ownerId: org.id, eventId: e1.id, kind: "invitation", mode: "both", idemKey: `seed-e1-${randomToken(6)}` });
  await addInvitations(org.id, e1.id, [
    { name: "عبدالله المطيري", phone: "0551000108" },
    { name: "لمى العنزي", phone: "0551000109", email: "lama@example.com" },
  ]);
  const inv1 = await listInvitations(e1.id);
  const by = (n: string) => inv1.find((i) => i.name === n)!;
  await confirmInvitation(by("نورة الشهري").token, { name: "نورة الشهري", contactType: "phone", contact: "0551000103" });
  const mo = await confirmInvitation(by("محمد القحطاني").token, { name: "محمد القحطاني", contactType: "email", contact: "mohammed@example.com", withCompanion: true });
  await declineInvitation(by("ريم الزهراني").token);

  await addStaff(org.id, e1.id, { name: "عضو الاستقبال", email: "staff@wafda.test" });
  const staff = (await findUserByEmail("staff@wafda.test"))!;
  await completeSetupForSeed(staff.id, PASSWORD);
  const staffActive = (await findUserByEmail("staff@wafda.test"))!;
  if (mo.status === "confirmed") await checkInByToken(staffActive, e1.id, mo.tickets.find((t) => t.kind === "guest")!.token, "scan");

  // ===== 2. رابط عام مدفوع بقائمة انتظار
  const e2 = await createEvent(org.id, {
    ...base,
    title: "ورشة تصميم واجهات المستخدم",
    description: "ورشة عملية لثلاث ساعات. أحضر حاسبك المحمول.",
    startLocal: riyadhAt(5, 16),
    endLocal: riyadhAt(5, 19),
    maxAttendees: 40,
    type: "public",
    fullPolicy: "waitlist",
  });
  await setEventTemplate(org.id, e2.id, "tpl_workshop");
  await pay((await createPackagePayment(org.id, e2.id)).payment);
  await addStaff(org.id, e2.id, { name: "عضو الاستقبال", email: "staff@wafda.test" });
  const regs2 = [];
  const people2: [string, string, string][] = [
    ["أحمد السالم", "phone", "0552000201"],
    ["جود الغامدي", "email", "jood@example.com"],
    ["تركي العمري", "phone", "0552000203"],
    ["دانة الرشيد", "email", "dana@example.com"],
  ];
  for (const [i, g] of people2.entries()) regs2.push(await registerPublic(e2.publicSlug, `seed-e2-${i}-${randomToken(10)}`, { name: g[0], contactType: g[1], contact: g[2] }));
  if (regs2[0].status === "confirmed") await checkInByToken(org, e2.id, regs2[0].tickets[0].token, "scan");

  // ===== 3. رابط عام مكتمل العدد بسياسة إغلاق
  const e3 = await createEvent(org.id, {
    ...base,
    title: "جلسة حوارية: مستقبل الذكاء الاصطناعي",
    description: "جلسة محدودة المقاعد.",
    startLocal: riyadhAt(7, 19),
    endLocal: riyadhAt(7, 21),
    maxAttendees: 3,
    type: "public",
    fullPolicy: "close",
  });
  await setEventTemplate(org.id, e3.id, "tpl_corporate");
  await pay((await createPackagePayment(org.id, e3.id)).payment);
  const people3: [string, string, string][] = [
    ["سلمان الفيفي", "phone", "0553000301"],
    ["مها الجهني", "phone", "0553000302"],
    ["بندر الشمري", "email", "bandar@example.com"],
  ];
  for (const [i, g] of people3.entries()) await registerPublic(e3.publicSlug, `seed-e3-${i}-${randomToken(10)}`, { name: g[0], contactType: g[1], contact: g[2] });

  // ===== 4. مسودة
  const e4 = await createEvent(org.id, {
    ...base,
    title: "حفل تخرج الدفعة",
    description: "",
    startLocal: riyadhAt(20, 17),
    endLocal: riyadhAt(20, 21),
    maxAttendees: 120,
    type: "private",
    fullPolicy: "close",
  });

  // ===== 5. فعالية لمنظّم آخر (اختبار العزل) مع staff2
  const e5 = await createEvent(other.id, {
    orgName: "شركة أخرى",
    title: "اجتماع الشركاء الربعي",
    description: "اجتماع داخلي.",
    startLocal: riyadhAt(3, 10),
    endLocal: riyadhAt(3, 13),
    venue: "مقر الشركة",
    address: "طريق الملك فهد، الرياض",
    mapUrl: "",
    maxAttendees: 20,
    type: "private",
    fullPolicy: "close",
  });
  await setEventTemplate(other.id, e5.id, "tpl_corporate");
  await addInvitations(other.id, e5.id, [
    { name: "شريك أول", email: "partner1@example.com" },
    { name: "شريك ثاني", phone: "0554000502" },
  ]);
  await pay((await createPackagePayment(other.id, e5.id)).payment);
  const inv5 = await listInvitations(e5.id);
  const otherReg = await confirmInvitation(inv5[0].token, { name: "شريك أول", contactType: "email", contact: "partner1@example.com" });
  await addStaff(other.id, e5.id, { name: "استقبال فعالية أخرى", email: "staff2@wafda.test" });
  await completeSetupForSeed((await findUserByEmail("staff2@wafda.test"))!.id, PASSWORD);

  // ===== تصاميم ودعم
  await createDesignRequest(org.id, { title: "قالب بهوية النادي", details: "نريد قالبًا بألوان النادي (أزرق وذهبي) مع الشعار في الأعلى.", refUrl: "https://example.com/brand", eventId: e1.id });
  const d2 = await createDesignRequest(org.id, { title: "قالب حفل التخرج", details: "تصميم احتفالي لحفل التخرج مع مساحة لصورة الدفعة.", eventId: e4.id });
  await sendQuote(admin.id, d2.id, { amount: 25000, notes: "يشمل جولتي تعديل والتسليم خلال 3 أيام عمل.", validDays: 7 });
  await createSupportTicket(org, { kind: "complaint", subject: "تأخر وصول رسالة لأحد المدعوين", body: "أحد المدعوين يقول إن رسالة الدعوة لم تصله رغم ظهور «أُرسلت».", eventId: e1.id });

  const tk = (r: typeof mo, kind: "guest" | "companion") => (r.status === "confirmed" ? links.ticket(r.tickets.find((t) => t.kind === kind)?.token ?? "") : "");
  const linksOut = {
    app: appUrl(),
    unansweredInvitation: links.invitation(by("سارة العتيبي").token),
    companionInvitation: links.invitation(by("خالد الدوسري").token),
    confirmedGuestTicket: tk(mo, "guest"),
    companionTicketNotArrived: tk(mo, "companion"),
    publicWaitlist: links.publicEvent(e2.publicSlug),
    publicFull: links.publicEvent(e3.publicSlug),
    otherOrgTicket: tk(otherReg, "guest"),
    e1: e1.id,
    e2: e2.id,
    e3: e3.id,
    e4: e4.id,
    e5: e5.id,
  };
  await marker.set({ at: Date.now(), links: linksOut });
  await lock.delete();
  console.log("✓ اكتملت البيانات التجريبية");
  printLinks(linksOut);
}

function printLinks(l: Record<string, string>) {
  const app = l.app || appUrl();
  console.log(`
════════════ روابط التجربة ════════════
كلمة المرور لكل الحسابات: ${PASSWORD}
  منظّم:               organizer@wafda.test
  فريق استقبال:        staff@wafda.test   (معيّن على الفعاليتين 1 و2)
  أدمن:                admin@wafda.test
  منظّم آخر:           other@wafda.test
  استقبال فعالية أخرى: staff2@wafda.test

الدخول:                 ${app}/login
لوحة المنظّم:           ${app}/dashboard
لوحة الأدمن:            ${app}/admin
صندوق الرسائل التجريبي: ${app}/dev/inbox
التحضير (فعالية 1):     ${app}/checkin/${l.e1}

دعوة لم ترد (فردية):    ${l.unansweredInvitation}
دعوة لم ترد (بمرافق):   ${l.companionInvitation}
تذكرة ضيف حضر:          ${l.confirmedGuestTicket}
تذكرة مرافق لم يحضر:    ${l.companionTicketNotArrived}
رابط عام بقائمة انتظار: ${l.publicWaitlist}
رابط عام مكتمل:         ${l.publicFull}
تذكرة لفعالية أخرى:     ${l.otherOrgTicket}
════════════════════════════════════════`);
}

main().then(
  () => process.exit(0),
  async (e) => {
    console.error("✖ فشل التعبئة:", e);
    try {
      await db().collection(C.meta).doc("seed_lock").delete();
    } catch {}
    process.exit(1);
  },
);
