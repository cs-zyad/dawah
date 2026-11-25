import Link from "next/link";
import { loadOwnedEvent } from "@/lib/owned";
import { isPast, listInvitations } from "@/lib/core/events";
import { Tabs } from "@/components/Tabs";
import { BackLink, Tag } from "@/components/ui";
import { fmtDateTime } from "@/lib/util";

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event: e } = await loadOwnedEvent(id);
  const invs = e.type === "private" ? await listInvitations(e.id) : [];
  const base = `/dashboard/events/${e.id}`;
  const paid = e.paidPlaces > 0;
  const steps: { label: string; d: string; done: boolean; href: string }[] = [
    { label: "البيانات", d: "الاسم والموعد والمكان", done: true, href: `${base}/details` },
    { label: "القالب", d: "اختيار ومعاينة", done: !!e.templateId, href: `${base}/template` },
    e.type === "private"
      ? { label: "المدعوون", d: `${invs.length} دعوة`, done: invs.length > 0, href: `${base}/guests` }
      : { label: "السعة", d: `${e.maxAttendees} مكان`, done: e.maxAttendees > 0, href: `${base}/details` },
    { label: "الدفع", d: paid ? `${e.paidPlaces} مكان مدفوع` : "الباقة", done: paid, href: `${base}/payment` },
    e.type === "private"
      ? { label: "الإرسال", d: "الدعوات والتذكير", done: invs.some((i) => i.sendStatus === "sent"), href: `${base}/send` }
      : { label: "النشر", d: "الرابط العام", done: paid, href: `${base}/payment` },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);
  const tabs: [string, string][] = [
    ["", "نظرة عامة"],
    ["guests", e.type === "private" ? "المدعوون" : "المسجلون"],
    ...(e.type === "private" ? ([["send", "الإرسال والتذكيرات"]] as [string, string][]) : []),
    ["waitlist", "قائمة الانتظار"],
    ["template", "القالب والمعاينة"],
    ["payment", e.type === "public" ? "الباقة والرابط العام" : "الباقة والدفع"],
    ["staff", "فريق الاستقبال"],
    ["details", "البيانات"],
    ["messages", "سجل الرسائل"],
  ];
  return (
    <>
      <BackLink href="/dashboard">فعالياتي</BackLink>
      <div className="row between" style={{ margin: "6px 0 14px", alignItems: "flex-start" }}>
        <div className="grow">
          <h1 style={{ marginBottom: 2 }} className="break">
            {e.title}
          </h1>
          <div className="muted small">
            {fmtDateTime(e.startAt)} · {e.venue}
          </div>
        </div>
        <div className="row">
          <Tag tone="neutral">{e.type === "private" ? "دعوات خاصة بالاسم" : "رابط عام"}</Tag>
          {e.status === "cancelled" ? <Tag tone="bad">ملغاة</Tag> : e.status === "draft" ? <Tag tone="warn">مسودة</Tag> : isPast(e) ? <Tag tone="neutral">انتهت</Tag> : <Tag tone="ok">نشطة</Tag>}
          {e.status === "active" ? (
            <Link className="btn small dark" href={`/checkin/${e.id}`}>
              التحضير
            </Link>
          ) : null}
        </div>
      </div>
      {e.status !== "cancelled" ? (
        <ol className="steps" aria-label="خطوات التجهيز" style={{ listStyle: "none", padding: 0 }}>
          {steps.map((s, i) => (
            <li key={s.label} style={{ display: "contents" }}>
              <Link href={s.href} className={`step${s.done ? " done" : ""}${i === currentIdx ? " current" : ""}`}>
                <b>
                  {s.done ? "✓ " : `${i + 1}. `}
                  {s.label}
                </b>
                <span className="d muted">{s.d}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
      <Tabs base={base} items={tabs} />
      {children}
    </>
  );
}
