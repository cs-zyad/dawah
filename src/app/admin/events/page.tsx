import { db, C } from "@/lib/db";
import type { EventDoc, User } from "@/lib/types";
import { capacityOf } from "@/lib/core/events";
import { PageHead, Tag } from "@/components/ui";
import { fmtShort } from "@/lib/util";

export const metadata = { title: "الفعاليات" };

export default async function AdminEvents() {
  const [events, users] = await Promise.all([db().collection(C.events).get(), db().collection(C.users).get()]);
  const owners = new Map(users.docs.map((d) => [d.id, (d.data() as User).name]));
  const list = events.docs.map((d) => d.data() as EventDoc).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="stack">
      <PageHead title="كل الفعاليات" sub="عرض للمتابعة فقط؛ إدارة الفعالية من حساب صاحبها." />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الفعالية</th>
              <th>المنظّم</th>
              <th>النوع</th>
              <th>الحالة</th>
              <th>الموعد</th>
              <th>مدفوع</th>
              <th>محجوز/السعة</th>
              <th>حضر</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td>{e.title}</td>
                <td>{owners.get(e.ownerId)}</td>
                <td>{e.type === "private" ? "خاصة" : "عامة"}</td>
                <td>
                  <Tag tone={e.status === "active" ? "ok" : e.status === "draft" ? "warn" : "bad"}>{{ active: "نشطة", draft: "مسودة", cancelled: "ملغاة" }[e.status]}</Tag>
                </td>
                <td className="nowrap">{fmtShort(e.startAt)}</td>
                <td className="num">{e.paidPlaces}</td>
                <td className="num">
                  {e.reservedSeats}/{capacityOf(e)}
                </td>
                <td className="num">{(e.checkedInGuests || 0) + (e.checkedInCompanions || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
