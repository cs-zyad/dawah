import { listMessages } from "@/lib/core/messages";
import { db, C } from "@/lib/db";
import type { EventDoc } from "@/lib/types";
import { Ltr, PageHead, Stat, Tag, MSG_KIND, MSG_STATUS, CHANNEL_LABEL } from "@/components/ui";
import { fmtShort, formatSAR } from "@/lib/util";

export const metadata = { title: "الرسائل والتكلفة" };

export default async function AdminMessages() {
  const [msgs, evs] = await Promise.all([listMessages({}), db().collection(C.events).get()]);
  const titles = new Map(evs.docs.map((d) => [d.id, (d.data() as EventDoc).title]));
  const credit = msgs.filter((m) => m.chargedTo === "credit");
  const pkg = msgs.filter((m) => m.chargedTo === "package");
  const platform = msgs.filter((m) => m.chargedTo === "platform");
  return (
    <div className="stack-lg">
      <PageHead title="الرسائل والتكلفة" sub="عزل محاسبي: رسائل الرصيد (إيراد) مقابل رسائل مشمولة في الباقة (تكلفة تشغيل)." />
      <div className="grid grid-4">
        <Stat k="رسائل الرصيد" v={credit.length} s={`إيراد ${formatSAR(credit.filter((m) => !m.refunded).reduce((n, m) => n + m.cost, 0))} · مسترجع ${formatSAR(credit.filter((m) => m.refunded).reduce((n, m) => n + m.cost, 0))}`} />
        <Stat k="رسائل الباقة (تأكيد/تذكرة)" v={pkg.length} s={`تكلفة تقديرية ${formatSAR(pkg.reduce((n, m) => n + m.opCost, 0))}`} />
        <Stat k="رسائل المنصة" v={platform.length} s={`تكلفة تقديرية ${formatSAR(platform.reduce((n, m) => n + m.opCost, 0))}`} />
        <Stat k="فشلت" v={msgs.filter((m) => m.status === "failed").length} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الوقت</th>
              <th>الفعالية</th>
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
            {msgs.slice(0, 300).map((m) => (
              <tr key={m.id}>
                <td className="nowrap">{fmtShort(m.createdAt)}</td>
                <td className="small">{m.eventId ? titles.get(m.eventId) : "—"}</td>
                <td>{MSG_KIND[m.kind]}</td>
                <td>{CHANNEL_LABEL[m.channel]}</td>
                <td>
                  <Ltr>{m.to}</Ltr>
                </td>
                <td>
                  <Tag tone={MSG_STATUS[m.status][1]}>{MSG_STATUS[m.status][0]}</Tag>
                </td>
                <td className="num">{m.attempts}</td>
                <td>{m.chargedTo === "credit" ? "رصيد" : m.chargedTo === "package" ? "باقة" : "منصة"}</td>
                <td className="num">{m.chargedTo === "credit" ? formatSAR(m.cost) : formatSAR(m.opCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
