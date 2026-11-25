import { loadOwnedEvent } from "@/lib/owned";
import { templatesForOrganizer, resolveTemplate } from "@/lib/core/templates";
import { listInvitations } from "@/lib/core/events";
import { buildEventView, links } from "@/lib/core/view";
import { renderMessage, eventVars } from "@/lib/core/messageTemplates";
import { InvitationCard } from "@/components/InvitationCard";
import { ActionForm, Submit } from "@/components/client";
import { Tag, Alert } from "@/components/ui";
import { chooseTemplateAction } from "../../../actions";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, event: e } = await loadOwnedEvent(id);
  const [templates, current, invs] = await Promise.all([templatesForOrganizer(user.id), resolveTemplate(e.templateId), e.type === "private" ? listInvitations(e.id) : Promise.resolve([])]);
  const sample = invs[0];
  const guestName = e.type === "private" ? sample?.name || "اسم المدعو" : "";
  const view = buildEventView(e, guestName);
  const vars = eventVars(view);
  const invLink = sample ? links.invitation(sample.token) : links.invitation("…");
  const wa = renderMessage("invitation", { ...vars, guest_name: guestName || "اسم المدعو", companion_line: sample?.allowCompanion ? "الدعوة تشمل مرافقًا واحدًا.\n" : "", invitation_link: invLink }, "whatsapp");
  const mail = renderMessage("invitation", { ...vars, guest_name: guestName || "اسم المدعو", companion_line: "", invitation_link: invLink }, "email");
  const conf = renderMessage(
    "confirmation",
    { ...vars, guest_name: guestName || "اسم الضيف", ticket_link: links.ticket("رمز-التذكرة"), companion_ticket_line: `تذكرة مرافقك (شاركها معه):\n${links.ticket("رمز-المرافق")}\n`, manage_link: e.type === "private" ? invLink : links.manage("…") },
    "whatsapp",
  );
  return (
    <div className="stack-lg">
      <section className="stack">
        <h2>اختر القالب</h2>
        <p className="small muted">التصميم ثابت؛ تعبّئ البيانات فقط من تبويب «البيانات». لتصميم خاص اطلبه من «طلبات التصميم»، ويظهر هنا بعد التسليم.</p>
        <div className="grid grid-3">
          {templates.map((t) => (
            <div key={t.id} className="card stack" style={{ padding: 12, borderColor: e.templateId === t.id ? "var(--plum)" : undefined, borderWidth: e.templateId === t.id ? 2 : 1 }}>
              <div style={{ maxHeight: 260, overflow: "hidden", borderRadius: 16, pointerEvents: "none" }} aria-hidden="true">
                <div style={{ transform: "scale(.62)", transformOrigin: "top center", width: "161%", marginInlineStart: "-30.5%" }}>
                  <InvitationCard layout={t.layout} colors={t.colors} view={view} />
                </div>
              </div>
              <div className="row between">
                <div>
                  <b>{t.name}</b> <span className="tiny muted">{t.category}</span>
                  {t.ownerId ? (
                    <>
                      {" "}
                      <Tag tone="plum">خاص بك</Tag>
                    </>
                  ) : null}
                </div>
                {e.templateId === t.id ? (
                  <Tag tone="ok">المختار</Tag>
                ) : (
                  <ActionForm action={chooseTemplateAction.bind(null, e.id)}>
                    <input type="hidden" name="templateId" value={t.id} />
                    <Submit className="btn small primary">اختيار</Submit>
                  </ActionForm>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="stack">
        <h2>المعاينة قبل الدفع والإرسال</h2>
        {!e.templateId ? <Alert tone="warn">لم تختر قالبًا بعد؛ المعاينة بالقالب الافتراضي.</Alert> : null}
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <div className="stack">
            <h3>صفحة الدعوة كما يراها الضيف</h3>
            <InvitationCard layout={current.layout} colors={current.colors} view={view}>
              <div className="card" style={{ color: "var(--plum)" }}>
                <div className="label">نموذج تأكيد الحضور</div>
                <p className="small muted" style={{ margin: 0 }}>
                  الاسم + واتساب أو البريد{e.type === "private" && sample?.allowCompanion ? " + خيار «معي مرافق»" : ""} ثم زر «{e.type === "private" ? "أكّد حضورك" : "سجّل حضورك"}».
                </p>
              </div>
            </InvitationCard>
          </div>
          <div className="stack">
            {e.type === "private" ? (
              <>
                <h3>رسالة واتساب (الدعوة)</h3>
                <pre className="msg-preview">{wa.body}</pre>
                <h3>رسالة البريد (الدعوة)</h3>
                <div className="msg-preview email">
                  <b>{mail.subject}</b>
                  <hr className="divider" style={{ margin: "8px 0" }} />
                  <pre className="msg-preview email" style={{ border: 0, padding: 0 }}>
                    {mail.body}
                  </pre>
                </div>
              </>
            ) : (
              <Alert tone="info">في الرابط العام لا تُرسل دعوات؛ تشارك الرابط بنفسك بعد الدفع.</Alert>
            )}
            <h3>رسالة تأكيد الحضور (مع التذكرة)</h3>
            <pre className="msg-preview">{conf.body}</pre>
            <p className="tiny muted">النصوص مكتوبة كقوالب بمتغيرات لتتحول إلى قوالب واتساب معتمدة عند ربط المزوّد.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
