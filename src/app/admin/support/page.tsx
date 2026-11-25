import Link from "next/link";
import { listSupportTickets, SUPPORT_STATUS_AR, SUPPORT_KIND_AR } from "@/lib/core/support";
import { Empty, PageHead, Tag } from "@/components/ui";
import { fmtShort } from "@/lib/util";

export const metadata = { title: "الدعم والشكاوى" };

export default async function AdminSupport() {
  const list = await listSupportTickets();
  return (
    <div className="stack">
      <PageHead title="الدعم والشكاوى" />
      {list.length ? (
        <div className="list">
          {list.map((t) => (
            <Link key={t.id} href={`/admin/support/${t.id}`} className="item row between" style={{ textDecoration: "none" }}>
              <div>
                <b>{t.subject}</b>
                <div className="meta">
                  {SUPPORT_KIND_AR[t.kind]} · {t.ownerName} · {fmtShort(t.updatedAt)}
                </div>
              </div>
              <Tag tone={t.status === "open" ? "warn" : t.status === "in_progress" ? "info" : "ok"}>{SUPPORT_STATUS_AR[t.status]}</Tag>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>لا توجد طلبات.</Empty>
      )}
    </div>
  );
}
