import Link from "next/link";
import { requireOrganizer } from "@/lib/session";
import { capacityOf, isPast, listOwnerEvents } from "@/lib/core/events";
import { getUser } from "@/lib/core/users";
import { Empty, PageHead, Stat, Tag } from "@/components/ui";
import { fmtDate, fmtTime, formatSAR } from "@/lib/util";
import type { EventDoc } from "@/lib/types";

export const metadata = { title: "فعالياتي" };

function EventRow({ e }: { e: EventDoc }) {
  const cap = capacityOf(e);
  const attended = (e.checkedInGuests || 0) + (e.checkedInCompanions || 0);
  return (
    <Link href={`/dashboard/events/${e.id}`} className="item" style={{ textDecoration: "none", display: "block" }}>
      <div className="row between">
        <b className="break">{e.title}</b>
        <div className="row" style={{ gap: 6 }}>
          <Tag tone="neutral">{e.type === "private" ? "دعوات خاصة" : "رابط عام"}</Tag>
          {e.status === "cancelled" ? <Tag tone="bad">ملغاة</Tag> : e.status === "draft" ? <Tag tone="warn">مسودة</Tag> : isPast(e) ? <Tag tone="neutral">انتهت</Tag> : <Tag tone="ok">نشطة</Tag>}
        </div>
      </div>
      <div className="meta">
        {fmtDate(e.startAt)} — {fmtTime(e.startAt)} · {e.venue}
      </div>
      {e.status === "active" ? (
        <div className="meta" style={{ marginTop: 4 }}>
          محجوز <span className="num">{e.reservedSeats}</span> من <span className="num">{cap}</span> · حضر <span className="num">{attended}</span>
        </div>
      ) : null}
    </Link>
  );
}

export default async function DashboardPage() {
  const u = await requireOrganizer();
  const [events, fresh] = await Promise.all([listOwnerEvents(u.id), getUser(u.id)]);
  const active = events.filter((e) => e.status === "active" && !isPast(e)).sort((a, b) => a.startAt - b.startAt);
  const drafts = events.filter((e) => e.status === "draft");
  const past = events.filter((e) => e.status === "cancelled" || (e.status === "active" && isPast(e)));
  return (
    <>
      <PageHead
        title={`أهلًا ${u.name}`}
        sub="فعالياتك في مكان واحد: من دُعي، ومن أكّد، ومن حضر."
        actions={
          <Link className="btn primary" href="/dashboard/events/new">
            + فعالية جديدة
          </Link>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <Stat k="رصيد الرسائل" v={formatSAR(fresh?.creditBalance || 0)} s={<Link href="/dashboard/credit">شحن الرصيد</Link>} hl />
        <Stat k="فعاليات نشطة" v={active.length} />
        <Stat k="مسودات" v={drafts.length} />
        <Stat k="سابقة وملغاة" v={past.length} />
      </div>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="stack">
          <h2>الفعاليات النشطة</h2>
          {active.length ? <div className="list">{active.map((e) => <EventRow key={e.id} e={e} />)}</div> : <Empty>لا توجد فعاليات نشطة.</Empty>}
        </section>
        <section className="stack">
          <h2>المسودات</h2>
          {drafts.length ? <div className="list">{drafts.map((e) => <EventRow key={e.id} e={e} />)}</div> : <Empty>لا توجد مسودات.</Empty>}
          <h2 style={{ marginTop: 20 }}>السابقة والملغاة</h2>
          {past.length ? <div className="list">{past.map((e) => <EventRow key={e.id} e={e} />)}</div> : <Empty>لا شيء بعد.</Empty>}
        </section>
      </div>
    </>
  );
}
