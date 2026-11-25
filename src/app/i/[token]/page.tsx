import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, C } from "@/lib/db";
import { getInvitationByToken } from "@/lib/core/invitations";
import { getEvent } from "@/lib/core/events";
import { resolveTemplate } from "@/lib/core/templates";
import { buildEventView } from "@/lib/core/view";
import { closedReason, getRegistrationTickets, privateRegId } from "@/lib/core/rsvp";
import { InvitationCard } from "@/components/InvitationCard";
import { GuestShell, BigState, TicketLinks } from "@/components/GuestBits";
import { GuestRsvpForm, DeclineForm } from "@/components/RsvpForms";
import { confirmInvitationAction, declineInvitationAction } from "@/app/guest-actions";
import type { Registration } from "@/lib/types";
import { fmtDateTime, localPhone } from "@/lib/util";

export const metadata: Metadata = { title: "دعوة", robots: { index: false, follow: false } };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvitationByToken(token);
  if (!inv) notFound();
  const event = await getEvent(inv.eventId);
  if (!event) notFound();
  const [tpl, regSnap] = await Promise.all([resolveTemplate(event.templateId), db().collection(C.registrations).doc(privateRegId(inv.id)).get()]);
  const reg = regSnap.exists ? (regSnap.data() as Registration) : null;
  const tickets = reg ? await getRegistrationTickets(reg.id) : [];
  const view = buildEventView(event, inv.name);
  const closed = closedReason(event);
  const checkedIn = tickets.some((t) => t.status === "active" && t.checkedInAt);
  const confirmAction = confirmInvitationAction.bind(null, token);
  const declineAction = declineInvitationAction.bind(null, token);
  const defaults = { name: reg?.name || inv.name, phone: localPhone(reg?.contactType === "phone" ? reg.contact : inv.phone), email: reg?.contactType === "email" ? reg.contact : inv.email || "" };

  let panel: React.ReactNode;
  if (reg?.status === "confirmed") {
    panel = (
      <div className="stack">
        <BigState tone="ok" icon="✓" title={checkedIn ? "تم تسجيل حضورك" : "تم تأكيد حضورك"}>
          <p style={{ margin: 0 }}>
            {reg.seats > 1 ? "حُجز مقعدان: لك ولمرافقك." : "حُجز مقعدك."} {checkedIn ? "" : "يُسجَّل الحضور الفعلي عند الدخول بمسح رمز QR."}
          </p>
        </BigState>
        <TicketLinks tickets={tickets} />
        {!checkedIn && !closed ? <DeclineForm action={declineAction} /> : null}
      </div>
    );
  } else if (closed && reg?.status !== "declined") {
    panel = <BigState tone="bad" icon="!" title={closed} />;
  } else if (reg?.status === "waitlisted") {
    panel = (
      <div className="stack">
        <BigState tone="info" icon="⌛" title="أنت في قائمة الانتظار">
          <p style={{ margin: 0 }}>طلبت {reg.requestedSeats > 1 ? "مقعدين" : "مقعدًا واحدًا"}. سيصلك إشعار إن توفر مقعد.</p>
        </BigState>
        <DeclineForm action={declineAction} label="الخروج من قائمة الانتظار" />
      </div>
    );
  } else if (reg?.status === "offered") {
    panel = (
      <div className="stack">
        <BigState tone="warn" icon="★" title="توفر مقعد!">
          <p style={{ margin: 0 }}>الفرصة صالحة حتى {fmtDateTime(reg.offerExpiresAt!)}. المقعد يُحجز عند تأكيدك إن كان لا يزال متاحًا.</p>
        </BigState>
        <GuestRsvpForm action={confirmAction} defaults={defaults} allowCompanion={inv.allowCompanion && reg.requestedSeats > 1} />
        <DeclineForm action={declineAction} />
      </div>
    );
  } else if (reg?.status === "cancelled") {
    panel = <BigState tone="bad" icon="!" title="ألغى المنظّم تسجيلك في هذه الفعالية" />;
  } else {
    panel = (
      <div className="stack">
        {reg?.status === "declined" ? <div className="alert info">سجّلت اعتذارك سابقًا. يمكنك التأكيد الآن إن توفر مقعد.</div> : null}
        {closed ? (
          <BigState tone="bad" icon="!" title={closed} />
        ) : (
          <>
            <GuestRsvpForm action={confirmAction} defaults={defaults} allowCompanion={inv.allowCompanion} />
            {reg?.status !== "declined" ? <DeclineForm action={declineAction} /> : null}
          </>
        )}
      </div>
    );
  }

  return (
    <GuestShell>
      <InvitationCard layout={tpl.layout} colors={tpl.colors} view={view} />
      <section className="card" style={{ marginTop: 16 }} aria-label="تأكيد الحضور">
        {inv.allowCompanion && reg?.status !== "confirmed" ? <p className="small muted">دعوتك تسمح بمرافق واحد.</p> : null}
        {panel}
      </section>
    </GuestShell>
  );
}
