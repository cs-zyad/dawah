import Link from "next/link";
import { requireUser } from "@/lib/session";
import { checkInEventsFor } from "@/lib/core/staff";
import { Empty, PageHead, Tag } from "@/components/ui";
import { fmtDateTime } from "@/lib/util";

export const metadata = { title: "التحضير" };

export default async function CheckinHome() {
  const u = await requireUser(["organizer", "staff"]);
  const list = await checkInEventsFor(u.id);
  return (
    <>
      <PageHead title="التحضير" sub="اختر الفعالية لفتح ماسح QR. تظهر هنا فقط الفعاليات المعيّن عليها." />
      {list.length ? (
        <div className="list">
          {list.map(({ event: e, role }) => (
            <Link key={e.id} href={`/checkin/${e.id}`} className="item row between" style={{ textDecoration: "none" }}>
              <div>
                <b>{e.title}</b>
                <div className="meta">
                  {fmtDateTime(e.startAt)} · {e.venue}
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Tag tone="neutral">{role === "owner" ? "منظّم" : "استقبال"}</Tag>
                <span className="btn small primary">فتح الماسح</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>لا توجد فعاليات نشطة معيّن عليها.</Empty>
      )}
    </>
  );
}
