import Link from "next/link";
import type { ReactNode } from "react";
import type { Ticket } from "@/lib/types";
import { fmtShort } from "@/lib/util";
import { brand } from "@/config/brand";
import { LogoMark } from "./Logo";
import { DemoBanner } from "./Shell";

export function GuestShell({ children }: { children: ReactNode }) {
  return (
    <>
      <DemoBanner />
      <main className="guest-wrap">
        {children}
        <p className="guest-foot">
          <LogoMark size={14} /> {brand.fullName} — {brand.tagline}
        </p>
      </main>
    </>
  );
}

export function BigState({ tone, icon, title, children }: { tone: "ok" | "warn" | "bad" | "info"; icon: string; title: string; children?: ReactNode }) {
  return (
    <div className={`big-state ${tone}`} role="status">
      <div className="icon" aria-hidden="true">
        {icon}
      </div>
      <h2 style={{ margin: "0 0 6px" }}>{title}</h2>
      {children}
    </div>
  );
}

/** روابط التذاكر: تذكرة المدعو وتذكرة المرافق المستقلة */
export function TicketLinks({ tickets }: { tickets: Ticket[] }) {
  const active = tickets.filter((t) => t.status === "active").sort((a) => (a.kind === "guest" ? -1 : 1));
  return (
    <div className="stack">
      {active.map((t) => (
        <div key={t.id} className="item row between">
          <div>
            <b>{t.kind === "guest" ? "تذكرتك" : "تذكرة المرافق"}</b>
            <div className="meta">
              {t.checkedInAt ? `تم تسجيل الدخول ${fmtShort(t.checkedInAt)}` : t.kind === "companion" ? "شاركها مع مرافقك؛ يدخل بها في أي وقت" : "مقعد محجوز — يُسجَّل الحضور عند الدخول"}
            </div>
          </div>
          <Link className={`btn ${t.kind === "guest" ? "primary" : "dark"} small`} href={`/t/${t.token}`}>
            عرض التذكرة
          </Link>
        </div>
      ))}
    </div>
  );
}
