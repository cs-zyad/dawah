import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canCheckIn } from "@/lib/core/checkin";
import { Scanner } from "@/components/Scanner";
import { BackLink } from "@/components/ui";

export const metadata = { title: "ماسح التحضير" };

export default async function ScannerPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const u = await requireUser(["organizer", "staff"]);
  const r = await canCheckIn(u, eventId);
  if (!r.ok || !r.event) notFound();
  const e = r.event;
  return (
    <div style={{ maxWidth: 560, marginInline: "auto" }}>
      <BackLink href="/checkin">الفعاليات</BackLink>
      <h1 style={{ fontSize: "1.25rem", margin: "6px 0 12px" }} className="break">
        {e.title}
      </h1>
      <Scanner eventId={e.id} initialCount={(e.checkedInGuests || 0) + (e.checkedInCompanions || 0)} capacity={e.reservedSeats} />
    </div>
  );
}
