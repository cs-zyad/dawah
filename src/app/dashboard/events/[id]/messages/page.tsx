import { loadOwnedEvent } from "@/lib/owned";
import { listMessages } from "@/lib/core/messages";
import { Empty, Ltr, Tag, MSG_KIND, MSG_STATUS, CHANNEL_LABEL } from "@/components/ui";
import { fmtShort, formatSAR } from "@/lib/util";

export default async function MessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event: e } = await loadOwnedEvent(id);
  const msgs = await listMessages({ eventId: e.id });
  const credit = msgs.filter((m) => m.chargedTo === "credit" && !m.refunded).reduce((n, m) => n + m.cost, 0);
  const pkg = msgs.filter((m) => m.chargedTo !== "credit").reduce((n, m) => n + m.opCost, 0);
  return (
    <div className="stack">
      <p className="small muted">
        المخصوم من الرصيد (بعد الاسترجاع): <b className="num">{formatSAR(credit)}</b> · رسائل مشمولة في الباقة (تكلفة تشغيل تقديرية): <b className="num">{formatSAR(pkg)}</b>
      </p>
      {msgs.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>النوع</th>
                <th>القناة</th>
                <th>إلى</th>
                <th>الحالة</th>
                <th>المحاولات</th>
                <th>جهة التحميل</th>
                <th>التكلفة</th>
              </tr>
            </thead>
            <tbody>
              {msgs.map((m) => (
                <tr key={m.id}>
                  <td className="nowrap">{fmtShort(m.createdAt)}</td>
                  <td>{MSG_KIND[m.kind]}</td>
                  <td>{CHANNEL_LABEL[m.channel]}</td>
                  <td>
                    <Ltr>{m.to}</Ltr>
                  </td>
                  <td>
                    <Tag tone={MSG_STATUS[m.status][1]}>{MSG_STATUS[m.status][0]}</Tag>
                    {m.error && m.status !== "sent" ? <div className="tiny muted">{m.error}</div> : null}
                    {m.refunded ? <div className="tiny">استُرجعت القيمة</div> : null}
                  </td>
                  <td className="num">{m.attempts}</td>
                  <td>{m.chargedTo === "credit" ? "الرصيد" : m.chargedTo === "package" ? "الباقة" : "المنصة"}</td>
                  <td className="num">{m.chargedTo === "credit" ? formatSAR(m.cost) : `${formatSAR(m.opCost)} (تشغيل)`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>لا توجد رسائل بعد.</Empty>
      )}
    </div>
  );
}
