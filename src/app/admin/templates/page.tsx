import { listAllTemplates, LAYOUTS } from "@/lib/core/templates";
import { buildEventView } from "@/lib/core/view";
import { InvitationCard } from "@/components/InvitationCard";
import { TemplateFields } from "@/components/TemplateFields";
import { ActionForm, Submit } from "@/components/client";
import { PageHead, Tag } from "@/components/ui";
import { saveTemplateAction, toggleTemplateAction } from "../actions";

export const metadata = { title: "القوالب" };

const sampleView = buildEventView(
  { title: "ملتقى الشركاء السنوي", orgName: "جهة تجريبية", description: "لقاء سنوي يجمع الشركاء.", startAt: Date.UTC(2026, 11, 20, 16, 0), endAt: Date.UTC(2026, 11, 20, 19, 0), venue: "قاعة الملتقى", address: "الرياض", mapUrl: "https://maps.example.com" },
  "سارة العتيبي",
);

export default async function AdminTemplates() {
  const list = await listAllTemplates();
  return (
    <div className="stack-lg">
      <PageHead title="القوالب" sub={`${Object.keys(LAYOUTS).length} تخطيطات مبنية في الكود؛ تتحكم هنا بالاسم والتصنيف والألوان والظهور والترتيب.`} />
      <details className="card">
        <summary>+ إضافة قالب</summary>
        <ActionForm action={saveTemplateAction.bind(null, null)} className="stack" resetOnSuccess>
          <TemplateFields />
          <Submit>إضافة</Submit>
        </ActionForm>
      </details>
      <div className="grid grid-2">
        {list.map((t) => (
          <div key={t.id} className="card stack">
            <div className="row between">
              <div>
                <b>{t.name}</b> <span className="tiny muted">{LAYOUTS[t.layout].label} · {t.category}</span>{" "}
                {t.ownerId ? <Tag tone="plum">خاص بمنظّم</Tag> : t.visible ? <Tag tone="ok">ظاهر</Tag> : <Tag tone="neutral">مخفي</Tag>}
              </div>
              {!t.ownerId ? (
                <ActionForm action={toggleTemplateAction.bind(null, t.id, !t.visible)}>
                  <Submit className="btn small ghost">{t.visible ? "إخفاء" : "إظهار"}</Submit>
                </ActionForm>
              ) : null}
            </div>
            <div style={{ maxHeight: 300, overflow: "hidden", borderRadius: 16 }}>
              <div style={{ transform: "scale(.7)", transformOrigin: "top center", width: "143%", marginInlineStart: "-21.5%" }}>
                <InvitationCard layout={t.layout} colors={t.colors} view={sampleView} />
              </div>
            </div>
            <details>
              <summary className="small">تعديل</summary>
              <ActionForm action={saveTemplateAction.bind(null, t.id)} className="stack">
                <TemplateFields t={t} />
                <Submit className="btn small primary">حفظ</Submit>
              </ActionForm>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
