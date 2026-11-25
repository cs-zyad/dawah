import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEvent } from "@/lib/core/events";
import { resolveTemplate } from "@/lib/core/templates";
import { buildEventView } from "@/lib/core/view";
import { closedReason, getRegistrationByManageToken, getRegistrationTickets } from "@/lib/core/rsvp";
import { InvitationCard } from "@/components/InvitationCard";
import { GuestShell, BigState, TicketLinks } from "@/components/GuestBits";
import { ConfirmExistingForm, DeclineForm } from "@/components/RsvpForms";
import { confirmRegistrationAction, declineRegistrationAction } from "@/app/guest-actions";
import { fmtDateTime } from "@/lib/util";

export const metadata: Metadata = { title: "تسجيلك", robots: { index: false, follow: false } };

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reg = await getRegistrationByManageToken(token);
  if (!reg) notFound();
  const event = await getEvent(reg.eventId);
  if (!event) notFound();
  const [tpl, tickets] = await Promise.all([resolveTemplate(event.templateId), getRegistrationTickets(reg.id)]);
  const view = buildEventView(event, reg.name);
  const closed = closedReason(event);
  const checkedIn = tickets.some((t) => t.status === "active" && t.checkedInAt);
  const confirm = confirmRegistrationAction.bind(null, token);
  const decline = declineRegistrationAction.bind(null, token);
  return (
    <GuestShell>
      <section className="card stack" aria-label="حالة التسجيل">
        <p className="small muted" style={{ margin: 0 }}>
          {reg.name} — {event.title}
        </p>
        {reg.status === "confirmed" ? (
          <>
            <BigState tone="ok" icon="✓" title={checkedIn ? "تم تسجيل حضورك" : "تم تأكيد حضورك"}>
              <p style={{ margin: 0 }}>مقعدك محجوز. اعرض رمز QR عند الدخول.</p>
            </BigState>
            <TicketLinks tickets={tickets} />
            {!checkedIn && !closed ? <DeclineForm action={decline} /> : null}
          </>
        ) : reg.status === "waitlisted" ? (
          <>
            <BigState tone="info" icon="⌛" title="أنت في قائمة الانتظار">
              <p style={{ margin: 0 }}>سيصلك إشعار إن توفر مقعد.</p>
            </BigState>
            <DeclineForm action={decline} label="الخروج من قائمة الانتظار" />
          </>
        ) : reg.status === "offered" ? (
          <>
            <BigState tone="warn" icon="★" title="توفر مقعد!">
              <p style={{ margin: 0 }}>الفرصة صالحة حتى {fmtDateTime(reg.offerExpiresAt!)}. يُحجز المقعد عند تأكيدك إن كان لا يزال متاحًا.</p>
            </BigState>
            {closed ? <div className="alert bad">{closed}</div> : <ConfirmExistingForm action={confirm} />}
            <DeclineForm action={decline} />
          </>
        ) : reg.status === "cancelled" ? (
          <BigState tone="bad" icon="!" title="ألغى المنظّم تسجيلك في هذه الفعالية" />
        ) : (
          <>
            <BigState tone="info" icon="—" title="سجّلت اعتذارك" />
            {closed ? <div className="alert bad">{closed}</div> : <ConfirmExistingForm action={confirm} label="أكّد حضورك من جديد" />}
          </>
        )}
      </section>
      <div style={{ marginTop: 16 }}>
        <InvitationCard layout={tpl.layout} colors={tpl.colors} view={view} />
      </div>
    </GuestShell>
  );
}
