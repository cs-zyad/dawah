import Link from "next/link";
import { requireOrganizer } from "@/lib/session";
import { listDesignRequests, DESIGN_STATUS_AR } from "@/lib/core/designs";
import { Empty, PageHead, Tag } from "@/components/ui";
import { fmtShort } from "@/lib/util";

export const metadata = { title: "طلبات التصميم" };

export default async function DesignsPage() {
  const u = await requireOrganizer();
  const list = await listDesignRequests(u.id);
  return (
    <>
      <PageHead
        title="طلبات التصميم الخاص"
        sub="اطلب قالبًا خاصًا بهويتك؛ نراجع الطلب ونرسل عرض سعر داخل المنصة، وبعد الدفع والتنفيذ يظهر لك القالب عند اختيار القالب."
        actions={
          <Link className="btn primary" href="/dashboard/designs/new">
            + طلب جديد
          </Link>
        }
      />
      {list.length ? (
        <div className="list">
          {list.map((d) => (
            <Link key={d.id} href={`/dashboard/designs/${d.id}`} className="item row between" style={{ textDecoration: "none" }}>
              <div>
                <b>{d.title}</b>
                <div className="meta">آخر تحديث {fmtShort(d.updatedAt)}</div>
              </div>
              <Tag tone={d.status === "delivered" ? "ok" : d.status === "rejected" || d.status === "cancelled" ? "neutral" : d.status === "quoted" || d.status === "accepted" ? "warn" : "info"}>{DESIGN_STATUS_AR[d.status]}</Tag>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>لا توجد طلبات بعد.</Empty>
      )}
    </>
  );
}
