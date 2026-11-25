import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTicketByToken } from "@/lib/core/checkin";
import { getEvent } from "@/lib/core/events";
import { buildEventView, links } from "@/lib/core/view";
import { qrSvg } from "@/lib/qr";
import { GuestShell } from "@/components/GuestBits";
import { ShareButton } from "@/components/client";
import { Tag } from "@/components/ui";
import { fmtShort } from "@/lib/util";

export const metadata: Metadata = { title: "التذكرة", robots: { index: false, follow: false } };

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTicketByToken(token);
  if (!t) notFound();
  const event = await getEvent(t.eventId);
  if (!event) notFound();
  const view = buildEventView(event);
  const url = links.ticket(t.token);
  const svg = t.status === "active" ? await qrSvg(url) : null;
  const holder = t.kind === "companion" ? `مرافق — ${t.guestName}` : t.holderName;
  return (
    <GuestShell>
      <article className="ticket" aria-label="تذكرة الدخول">
        <div className="ticket-head">
          <div className="small" style={{ opacity: 0.8 }}>
            {view.orgName}
          </div>
          <h1>{view.title}</h1>
        </div>
        <div className="ticket-body stack">
          <div className="row between">
            <div>
              <div className="tiny muted">{t.kind === "companion" ? "تذكرة مرافق" : "صاحب التذكرة"}</div>
              <div style={{ fontFamily: "var(--font-head)", fontSize: "1.25rem" }}>{holder}</div>
            </div>
            {t.status !== "active" ? (
              <Tag tone="bad">تذكرة ملغاة</Tag>
            ) : t.checkedInAt ? (
              <Tag tone="plum">دخل {fmtShort(t.checkedInAt)}</Tag>
            ) : (
              <Tag tone="ok">صالحة — مقعد محجوز</Tag>
            )}
          </div>
          {svg ? (
            <div className="ticket-qr" role="img" aria-label="رمز QR للدخول" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className="alert bad">هذه التذكرة ملغاة ولا تصلح للدخول.</div>
          )}
          {svg ? <p className="center small muted" style={{ margin: 0 }}>اعرض هذا الرمز على فريق الاستقبال. رفع إضاءة الشاشة يسرّع المسح.</p> : null}
          <dl className="kv small">
            <dt>الموعد</dt>
            <dd>{view.whenText}</dd>
            <dt>المكان</dt>
            <dd>
              {view.placeText || "—"}
              {view.mapUrl ? (
                <>
                  {" "}
                  — <a href={view.mapUrl} target="_blank" rel="noopener noreferrer">الخريطة</a>
                </>
              ) : null}
            </dd>
          </dl>
          {t.kind === "companion" && t.status === "active" ? <ShareButton url={url} title={`تذكرة مرافق — ${view.title}`} text={`تذكرتك لحضور «${view.title}» كمرافق لـ ${t.guestName}`} /> : null}
          <p className="tiny muted center" style={{ margin: 0 }}>
            لا تشارك رمزك إلا مع صاحبه. كل رمز يُستخدم للدخول مرة واحدة.
          </p>
        </div>
      </article>
    </GuestShell>
  );
}
