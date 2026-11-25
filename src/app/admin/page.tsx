import Link from "next/link";
import { db, C } from "@/lib/db";
import { firebaseConfigStatus } from "@/lib/db";
import { messagingProviderStatus } from "@/lib/providers/messaging";
import { getPaymentProvider } from "@/lib/providers/payments";
import type { EventDoc, MessageDoc, Ticket, User } from "@/lib/types";
import type { Payment } from "@/lib/core/payments";
import type { DesignRequest } from "@/lib/core/designs";
import type { SupportTicket } from "@/lib/core/support";
import { PageHead, Stat, Tag } from "@/components/ui";
import { formatSAR } from "@/lib/util";

export const metadata = { title: "لوحة الأدمن" };

async function all<T>(c: string) {
  return (await db().collection(c).get()).docs.map((d) => d.data() as T);
}

export default async function AdminHome() {
  const [users, events, pays, msgs, tickets, designs, support] = await Promise.all([
    all<User>(C.users),
    all<EventDoc>(C.events),
    all<Payment>(C.payments),
    all<MessageDoc>(C.messages),
    all<Ticket>(C.tickets),
    all<DesignRequest>(C.designRequests),
    all<SupportTicket>(C.supportTickets),
  ]);
  const paid = pays.filter((p) => p.status === "paid");
  const msgRevenue = msgs.filter((m) => m.chargedTo === "credit" && m.status !== "failed").reduce((n, m) => n + m.cost, 0);
  const confCost = msgs.filter((m) => m.chargedTo === "package").reduce((n, m) => n + m.opCost, 0);
  const active = tickets.filter((t) => t.status === "active");
  const pendingDesigns = designs.filter((d) => d.status === "pending_review" || d.status === "paid").length;
  const openSupport = support.filter((s) => s.status === "open" || s.status === "in_progress").length;
  const failedMsgs = msgs.filter((m) => m.status === "failed").length;
  const fb = firebaseConfigStatus();
  return (
    <div className="stack-lg">
      <PageHead title="لوحة الأدمن" sub="عمليات المنصة في مكان واحد." />
      <div className="grid grid-4">
        <Stat k="المنظّمون" v={users.filter((u) => u.role === "organizer").length} s={`${users.filter((u) => u.status === "suspended").length} موقوف`} />
        <Stat k="الفعاليات" v={events.length} s={`${events.filter((e) => e.status === "active").length} نشطة · ${events.filter((e) => e.status === "draft").length} مسودة`} />
        <Stat k="إجمالي المدفوع" v={formatSAR(paid.reduce((n, p) => n + p.amount, 0))} s={`${paid.length} عملية`} hl />
        <Stat k="إيراد الرسائل (الرصيد)" v={formatSAR(msgRevenue)} s="بعد استبعاد الفاشلة المسترجعة" />
        <Stat k="تكلفة رسائل التأكيد" v={formatSAR(confCost)} s="على الباقات (تقديرية، معزولة)" />
        <Stat k="التذاكر الصالحة" v={active.length} s={`حضر ${active.filter((t) => t.checkedInAt).length}`} />
        <Stat k="ينتظر إجراء" v={pendingDesigns + openSupport} s={`${pendingDesigns} تصميم · ${openSupport} دعم`} />
        <Stat k="رسائل فشلت" v={failedMsgs} />
      </div>
      <section className="card">
        <h2>حالة الربط</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الخدمة</th>
                <th>المزوّد</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>قاعدة البيانات</td>
                <td>Firebase Firestore</td>
                <td>{fb.ok ? <Tag tone="ok">{fb.mode === "emulator" ? "محاكي محلي" : "فعلي"}</Tag> : <Tag tone="bad">غير مضبوط</Tag>}</td>
              </tr>
              {messagingProviderStatus().map((p) => (
                <tr key={p.channel}>
                  <td>{p.channel === "whatsapp" ? "واتساب" : "البريد"}</td>
                  <td>{p.name}</td>
                  <td>{p.mode === "mock" ? <Tag tone="warn">تجريبي</Tag> : <Tag tone="ok">فعلي</Tag>}</td>
                </tr>
              ))}
              <tr>
                <td>الدفع</td>
                <td>{getPaymentProvider().name}</td>
                <td>{getPaymentProvider().mode === "mock" ? <Tag tone="warn">تجريبي</Tag> : <Tag tone="ok">فعلي</Tag>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <div className="row">
        <Link className="btn" href="/admin/designs">طلبات التصميم</Link>
        <Link className="btn" href="/admin/support">الدعم والشكاوى</Link>
        <Link className="btn" href="/admin/payments">المدفوعات والإشعارات</Link>
      </div>
    </div>
  );
}
