import type { TemplateDoc } from "@/lib/types";
import { LAYOUTS, COLOR_ROLES } from "@/lib/core/templates";

export function TemplateFields({ t, hideVisibility }: { t?: Partial<TemplateDoc>; hideVisibility?: boolean }) {
  const layout = t?.layout ?? "plum_frame";
  const colors = t?.colors ?? LAYOUTS[layout].colors;
  return (
    <div className="stack">
      <div className="grid grid-3">
        <label className="field">
          <span>التخطيط</span>
          <select name="layout" defaultValue={layout}>
            {Object.entries(LAYOUTS).map(([k, l]) => (
              <option key={k} value={k}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>الاسم</span>
          <input type="text" name="name" required defaultValue={t?.name ?? ""} maxLength={80} />
        </label>
        <label className="field">
          <span>التصنيف</span>
          <input type="text" name="category" defaultValue={t?.category ?? ""} maxLength={60} />
        </label>
      </div>
      <fieldset>
        <legend className="label">الألوان الخمسة</legend>
        <div className="row">
          {COLOR_ROLES.map((role, i) => (
            <label key={i} className="row small" style={{ gap: 6 }}>
              <input type="color" name={`c${i}`} defaultValue={colors[i]} aria-label={role} />
              {role}
            </label>
          ))}
        </div>
      </fieldset>
      {hideVisibility ? null : (
        <div className="row">
          <label className="check">
            <input type="checkbox" name="visible" defaultChecked={t?.visible ?? true} />
            <span>ظاهر للمنظّمين</span>
          </label>
          <label className="row small" style={{ gap: 6 }}>
            الترتيب
            <input type="number" name="order" defaultValue={t?.order ?? 10} style={{ width: 90 }} />
          </label>
        </div>
      )}
    </div>
  );
}
