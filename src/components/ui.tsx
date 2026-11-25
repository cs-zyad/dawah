import Link from "next/link";
import type { ReactNode } from "react";
import type { Invitation, Registration, SendStatus, Ticket } from "@/lib/types";
import { fmtShort } from "@/lib/util";

type Tone = "ok" | "bad" | "warn" | "info" | "neutral" | "plum";

export function Tag({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

/** البريد والأرقام داخل عنصر LTR معزول */
export function Ltr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <bdi className={`ltr ${className}`} dir="ltr">
      {children}
    </bdi>
  );
}

export function Stat({ k, v, s, hl }: { k: string; v: ReactNode; s?: ReactNode; hl?: boolean }) {
  return (
    <div className={`stat${hl ? " hl" : ""}`}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {s ? <div className="s">{s}</div> : null}
    </div>
  );
}

export function Alert({ tone = "info", children }: { tone?: "ok" | "bad" | "warn" | "info"; children: ReactNode }) {
  return (
    <div className={`alert ${tone}`} role={tone === "bad" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="row between" style={{ marginBottom: 16, alignItems: "flex-start" }}>
      <div className="grow">
        <h1 style={{ marginBottom: 4 }}>{title}</h1>
        {sub ? <div className="muted">{sub}</div> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="small muted" style={{ textDecoration: "none" }}>
      → {children}
    </Link>
  );
}

/* ===================== وسوم الحالات ===================== */

export const SEND_LABEL: Record<SendStatus, [string, Tone]> = {
  not_sent: ["لم تُرسل", "neutral"],
  sending: ["قيد الإرسال", "info"],
  sent: ["أُرسلت", "ok"],
  failed: ["تعذّر الإرسال", "bad"],
};

export function SendTag({ s }: { s: SendStatus }) {
  const [l, t] = SEND_LABEL[s];
  return <Tag tone={t}>{l}</Tag>;
}

export const REG_LABEL: Record<Invitation["regStatus"], [string, Tone]> = {
  none: ["لم يؤكد", "warn"],
  confirmed: ["مؤكد", "ok"],
  declined: ["اعتذر", "neutral"],
  waitlisted: ["في الانتظار", "info"],
  offered: ["وصلته فرصة", "info"],
  cancelled: ["أُلغي التسجيل", "bad"],
};

export function RegTag({ s }: { s: Invitation["regStatus"] | Registration["status"] }) {
  const [l, t] = REG_LABEL[s];
  return <Tag tone={t}>{l}</Tag>;
}

export function AttendTag({ t, label }: { t?: Ticket | null; label?: string }) {
  if (!t || t.status !== "active") return null;
  if (t.checkedInAt)
    return (
      <Tag tone="plum">
        {label ? `${label}: ` : ""}حضر {fmtShort(t.checkedInAt)} ({t.checkInMethod === "manual" ? "يدوي" : "مسح"})
      </Tag>
    );
  return <Tag tone="neutral">{label ? `${label}: ` : ""}لم يحضر</Tag>;
}

export const MSG_STATUS: Record<string, [string, Tone]> = {
  queued: ["في الطابور", "info"],
  sending: ["قيد الإرسال", "info"],
  sent: ["أُرسلت", "ok"],
  failed: ["فشلت", "bad"],
};

export const MSG_KIND: Record<string, string> = {
  invitation: "دعوة",
  reminder: "تذكير",
  confirmation: "تأكيد + تذكرة",
  waitlist_offer: "فرصة انتظار",
  waitlist_update: "تحديث انتظار",
  staff_invite: "دعوة استقبال",
  ticket_resend: "إعادة إرسال التذكرة",
};

export const CHANNEL_LABEL = { whatsapp: "واتساب", email: "البريد" } as const;
