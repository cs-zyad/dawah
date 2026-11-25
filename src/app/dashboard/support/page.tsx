import Link from "next/link";
import { requireOrganizer } from "@/lib/session";
import { listSupportTickets, SUPPORT_STATUS_AR, SUPPORT_KIND_AR } from "@/lib/core/support";
import { Empty, PageHead, Tag } from "@/components/ui";
import { fmtShort } from "@/lib/util";

export const metadata = { title: "الدعم والشكاوى" };

export default async function SupportPage() {
  const u = await requireOrganizer();
  const list = await listSupportTickets(u.id);
  return (
    <>
      <PageHead
        title="الدعم والشكاوى"
        actions={
          <Link className="btn primary" href="/dashboard/support/new">
            + طلب جديد
          </Link>
        }
      />
      {list.length ? (
        <div className="list">
          {list.map((t) => (
            <Link key={t.id} href={`/dashboard/support/${t.id}`} className="item row between" style={{ textDecoration: "none" }}>
              <div>
                <b>{t.subject}</b>
                <div className="meta">
                  {SUPPORT_KIND_AR[t.kind]} · {fmtShort(t.updatedAt)}
                </div>
              </div>
              <Tag tone={t.status === "resolved" || t.status === "closed" ? "ok" : t.status === "in_progress" ? "info" : "warn"}>{SUPPORT_STATUS_AR[t.status]}</Tag>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>لا توجد طلبات.</Empty>
      )}
    </>
  );
}
