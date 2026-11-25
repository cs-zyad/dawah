import { listPayments, listWebhookLogs } from "@/lib/core/payments";
import { db, C } from "@/lib/db";
import type { User } from "@/lib/types";
import { PageHead, Tag } from "@/components/ui";
import { fmtShort, formatSAR } from "@/lib/util";

export const metadata = { title: "المدفوعات" };
const PURPOSE: Record<string, string> = { package: "باقة", extra_places: "أماكن إضافية", credit: "شحن رصيد", design: "تصميم" };
const OUT: Record<string, [string, "ok" | "warn" | "bad" | "neutral"]> = {
  applied: ["طُبّق", "ok"],
  duplicate: ["مكرر — تجاهل", "neutral"],
  already_paid: ["مدفوع مسبقًا — تجاهل", "neutral"],
  rejected: ["مرفوض", "bad"],
  failed_recorded: ["فشل دفع", "warn"],
};

export default async function AdminPayments() {
  const [pays, logs, users] = await Promise.all([listPayments(), listWebhookLogs(), db().collection(C.users).get()]);
  const names = new Map(users.docs.map((d) => [d.id, (d.data() as User).name]));
  return (
    <div className="stack-lg">
      <PageHead title="المدفوعات وإشعارات المزوّد" />
      <section className="stack">
        <h2>المدفوعات</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المنظّم</th>
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
                  <td>{names.get(p.ownerId)}</td>
                  <td>{PURPOSE[p.purpose]}</td>
                  <td className="small">{p.description}</td>
                  <td className="num">{formatSAR(p.amount)}</td>
                  <td>
                    <Tag tone={p.status === "paid" ? "ok" : p.status === "failed" ? "bad" : "warn"}>{{ paid: "مدفوع", failed: "فشل", pending: "بانتظار" }[p.status]}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="stack">
        <h2>إشعارات المزوّد (webhooks)</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المعرّف</th>
                <th>النوع</th>
                <th>المبلغ</th>
                <th>النتيجة</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap">{fmtShort(l.receivedAt)}</td>
                  <td className="mono tiny ltr">{l.id}</td>
                  <td className="ltr small">{l.type}</td>
                  <td className="num">
                    {formatSAR(l.amount)} <span className="tiny ltr">{l.currency}</span>
                  </td>
                  <td>
                    <Tag tone={OUT[l.outcome][1]}>{OUT[l.outcome][0]}</Tag>
                    {l.reason ? <div className="tiny muted">{l.reason}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
