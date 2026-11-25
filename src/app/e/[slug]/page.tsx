import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { availableSeats, getEventBySlug } from "@/lib/core/events";
import { resolveTemplate } from "@/lib/core/templates";
import { buildEventView } from "@/lib/core/view";
import { closedReason } from "@/lib/core/rsvp";
import { InvitationCard } from "@/components/InvitationCard";
import { GuestShell, BigState } from "@/components/GuestBits";
import { GuestRsvpForm } from "@/components/RsvpForms";
import { registerPublicAction } from "@/app/guest-actions";
import { randomToken } from "@/lib/util";

export const metadata: Metadata = { title: "التسجيل في الفعالية" };

export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.type !== "public" || event.paidPlaces <= 0) notFound();
  const tpl = await resolveTemplate(event.templateId);
  const view = buildEventView(event);
  const closed = closedReason(event);
  const left = availableSeats(event);
  const full = left <= 0;
  return (
    <GuestShell>
      <InvitationCard layout={tpl.layout} colors={tpl.colors} view={view} />
      <section className="card stack" style={{ marginTop: 16 }} aria-label="التسجيل">
        {closed ? (
          <BigState tone="bad" icon="!" title={closed} />
        ) : full && event.fullPolicy === "close" ? (
          <BigState tone="bad" icon="!" title="اكتمل العدد">
            <p style={{ margin: 0 }}>نعتذر، لا توجد مقاعد متاحة لهذه الفعالية.</p>
          </BigState>
        ) : (
          <>
            {full ? (
              <div className="alert warn">
                <b>اكتمل العدد.</b> يمكنك الانضمام لقائمة الانتظار، وسيصلك إشعار إن توفر مقعد.
              </div>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                سجّل حضورك لتصلك تذكرة QR على واتساب أو البريد. {left <= 10 ? <b>تبقّى {left} مقعد.</b> : null}
              </p>
            )}
            <GuestRsvpForm
              action={registerPublicAction.bind(null, slug)}
              defaults={{ name: "", phone: "", email: "" }}
              allowCompanion={false}
              submitLabel="سجّل حضورك"
              idemKey={randomToken(18)}
              waitlistOnly={full}
            />
          </>
        )}
      </section>
    </GuestShell>
  );
}
