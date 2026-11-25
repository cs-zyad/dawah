import Link from "next/link";
import { requireOrganizer } from "@/lib/session";
import { getUser } from "@/lib/core/users";
import { listLedger } from "@/lib/core/credit";
import { listPayments } from "@/lib/core/payments";
import { getSettings } from "@/lib/core/settings";
import { ActionForm, Submit } from "@/components/client";
import { Alert, Empty, PageHead, Stat, Tag } from "@/components/ui";
import { fmtShort, formatSAR } from "@/lib/util";
import { topupAction } from "../actions";

export const metadata = { title: "الرصيد والمدفوعات" };
const REASON: Record<string, string> = { topup: "شحن", message_batch: "إرسال رسائل", message_refund: "استرجاع رسالة فشلت", waitlist_offer: "فرصة انتظار", adjustment: "تسوية من الإدارة" };
const PURPOSE: Record<string, string> = { package: "باقة فعالية", extra_places: "أماكن إضافية", credit: "شحن رصيد", design: "تصميم خاص" };

export default async function CreditPage() {
  const u = await requireOrganizer();
  const [fresh, ledger, pays, s] = await Promise.all([getUser(u.id), listLedger(u.id), listPayments(u.id), getSettings()]);
  return (
    <div className="stack-lg">
      <PageHead title="الرصيد والمدفوعات" sub="رصيد الرسائل منفصل عن باقات الفعاليات." />
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <Stat k="رصيد الرسائل الحالي" v={formatSAR(fresh?.creditBalance || 0)} hl />
          <p className="small muted">
            واتساب {formatSAR(s.pricing.messagePrice.whatsapp)} للرسالة، البريد {formatSAR(s.pricing.messagePrice.email)}
            {s.pricing.demo ? " (أسعار تجريبية)" : ""}. الرسائل التي تفشل نهائيًا تُسترجع قيمتها تلقائيًا.
          </p>
        </div>
        <section className="card">
          <h3>شحن الرصيد</h3>
          <ActionForm action={topupAction} className="stack">
            <label className="field">
              <span>المبلغ (ر.س)</span>
              <input type="number" name="amount" min={10} max={10000} step="1" defaultValue={50} required inputMode="numeric" />
              <small>من 10 إلى 10,000 ر.س. يُضاف الرصيد بعد وصول إشعار الدفع الموثّق من المزوّد.</small>
            </label>
            <Submit>متابعة للدفع</Submit>
          </ActionForm>
        </section>
      </div>
      <section className="stack">
        <h2>حركة الرصيد</h2>
        {ledger.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>الحركة</th>
                  <th>التفاصيل</th>
                  <th>المبلغ</th>
                  <th>الرصيد بعدها</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="nowrap">{fmtShort(l.createdAt)}</td>
                    <td>{REASON[l.reason]}</td>
                    <td className="small">{l.note}</td>
                    <td className="num" style={{ color: l.amount < 0 ? "var(--bad)" : "var(--ok)" }}>
                      <bdi dir="ltr">{l.amount > 0 ? "+" : ""}{(l.amount / 100).toFixed(2)}</bdi>
                    </td>
                    <td className="num">{formatSAR(l.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>لا توجد حركات بعد.</Empty>
        )}
      </section>
      <section className="stack">
        <h2>سجل المدفوعات</h2>
        {pays.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>النوع</th>
                  <th>الوصف</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {pays.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">{fmtShort(p.createdAt)}</td>
                    <td>{PURPOSE[p.purpose]}</td>
                    <td className="small">{p.description}</td>
                    <td className="num">{formatSAR(p.amount)}</td>
                    <td>{p.status === "paid" ? <Tag tone="ok">مدفوع</Tag> : p.status === "failed" ? <Tag tone="bad">فشل</Tag> : <Link href={`/dev/checkout/${p.id}`}><Tag tone="warn">بانتظار الدفع</Tag></Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>لا توجد مدفوعات بعد.</Empty>
        )}
        <Alert tone="info">تثبيت الدفع وزيادة السعة وشحن الرصيد تتم فقط عبر إشعار موقّع من مزوّد الدفع إلى الخادم، لا من صفحة العودة.</Alert>
      </section>
    </div>
  );
}
