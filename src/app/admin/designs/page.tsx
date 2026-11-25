import Link from "next/link";
import { listDesignRequests, DESIGN_STATUS_AR } from "@/lib/core/designs";
import { db, C } from "@/lib/db";
import type { User } from "@/lib/types";
import { Empty, PageHead, Tag } from "@/components/ui";
import { fmtShort } from "@/lib/util";

export const metadata = { title: "طلبات التصميم" };

export default async function AdminDesigns() {
  const [list, users] = await Promise.all([listDesignRequests(), db().collection(C.users).get()]);
  const names = new Map(users.docs.map((d) => [d.id, (d.data() as User).name]));
  return (
    <div className="stack">
      <PageHead title="طلبات التصميم" />
      {list.length ? (
        <div className="list">
          {list.map((d) => (
            <Link key={d.id} href={`/admin/designs/${d.id}`} className="item row between" style={{ textDecoration: "none" }}>
              <div>
                <b>{d.title}</b>
                <div className="meta">
                  {names.get(d.ownerId)} · {fmtShort(d.updatedAt)}
                </div>
              </div>
              <Tag tone={d.status === "pending_review" || d.status === "paid" ? "warn" : "info"}>{DESIGN_STATUS_AR[d.status]}</Tag>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>لا توجد طلبات.</Empty>
      )}
    </div>
  );
}
