import { EventForm } from "@/components/EventForm";
import { BackLink, PageHead } from "@/components/ui";
import { createEventAction } from "../../actions";

export const metadata = { title: "فعالية جديدة" };

export default function NewEventPage() {
  return (
    <div className="medium">
      <BackLink href="/dashboard">فعالياتي</BackLink>
      <PageHead title="فعالية جديدة" sub="الخطوة 1 من 5: البيانات. بعدها تختار القالب وتعاين الدعوة." />
      <div className="card">
        <EventForm action={createEventAction} submitLabel="حفظ المسودة والمتابعة للقالب" />
      </div>
    </div>
  );
}
