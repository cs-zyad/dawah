import { loadOwnedEvent } from "@/lib/owned";
import { EventForm } from "@/components/EventForm";
import { Alert } from "@/components/ui";
import { updateEventAction } from "../../../actions";

export default async function DetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event: e } = await loadOwnedEvent(id);
  return (
    <div className="stack">
      {e.paidPlaces > 0 ? <Alert tone="info">بعد الدفع لا يتغير نوع الدعوة. تعديل البيانات يظهر فورًا في صفحة الدعوة والرسائل القادمة لأنها من مصدر واحد.</Alert> : null}
      <div className="card">
        <EventForm action={updateEventAction.bind(null, e.id)} event={e} submitLabel="حفظ البيانات" />
      </div>
    </div>
  );
}
