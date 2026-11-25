import { db, C, runTx } from "../db";
import type { LayoutKey, TemplateDoc } from "../types";
import { AppError, clampStr, notFound } from "../util";
import { audit } from "./audit";

/** التخطيطات الخمسة المبنية في الكود. الأدمن يتحكم بالاسم والتصنيف والألوان والظهور والترتيب. */
export const LAYOUTS: Record<LayoutKey, { label: string; defaultName: string; category: string; colors: TemplateDoc["colors"] }> = {
  plum_frame: { label: "إطار برقوقي", defaultName: "إطار برقوقي", category: "عام", colors: ["#28182C", "#FBF7EF", "#DDF480", "#3A2540", "#D9CCDF"] },
  ivory_classic: { label: "عاجي كلاسيكي", defaultName: "عاجي كلاسيكي", category: "مناسبات", colors: ["#FBF7EF", "#28182C", "#B08D57", "#E8DEED", "#65586B"] },
  lilac_soft: { label: "ليلكي ناعم", defaultName: "ليلكي ناعم", category: "اجتماعي", colors: ["#E8DEED", "#28182C", "#FFFFFF", "#DDF480", "#65586B"] },
  corporate: { label: "رسمي للشركات", defaultName: "رسمي للشركات", category: "شركات", colors: ["#FFFFFF", "#1F2A44", "#DDF480", "#EEF1F6", "#5B6475"] },
  workshop: { label: "ورش وتدريب", defaultName: "ورش وتدريب", category: "تدريب", colors: ["#DDF480", "#28182C", "#28182C", "#FFFFFF", "#4A3F4F"] },
};

/** معاني الألوان الخمسة في كل تخطيط */
export const COLOR_ROLES = ["الخلفية", "النص الرئيسي", "اللون المميز", "الأسطح الثانوية", "النص الثانوي"];

export async function ensureDefaultTemplates() {
  const keys = Object.keys(LAYOUTS) as LayoutKey[];
  await Promise.all(
    keys.map(async (k, i) => {
      const ref = db().collection(C.templates).doc(`tpl_${k}`);
      await runTx(async (tx) => {
        const s = await tx.get(ref);
        if (s.exists) return;
        const l = LAYOUTS[k];
        const t: TemplateDoc = { id: ref.id, layout: k, name: l.defaultName, category: l.category, colors: l.colors, visible: true, order: i + 1, ownerId: null, createdAt: Date.now() };
        tx.set(ref, t);
      });
    }),
  );
}

export async function listAllTemplates(): Promise<TemplateDoc[]> {
  const qs = await db().collection(C.templates).get();
  return qs.docs.map((d) => d.data() as TemplateDoc).sort((a, b) => a.order - b.order);
}

/** القوالب المتاحة لمنظّم: العامة الظاهرة + قوالبه الخاصة. */
export async function templatesForOrganizer(ownerId: string): Promise<TemplateDoc[]> {
  const all = await listAllTemplates();
  return all.filter((t) => (t.ownerId ? t.ownerId === ownerId : t.visible));
}

export async function getTemplate(id: string | null): Promise<TemplateDoc | null> {
  if (!id || id.includes("/")) return null;
  const s = await db().collection(C.templates).doc(id).get();
  return s.exists ? (s.data() as TemplateDoc) : null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface TemplateInput {
  layout: LayoutKey;
  name: string;
  category: string;
  colors: string[];
  visible: boolean;
  order: number;
  ownerId?: string | null;
}

function validate(i: TemplateInput) {
  if (!(i.layout in LAYOUTS)) throw new AppError("validation", "التخطيط غير معروف");
  const name = clampStr(i.name, 80);
  if (!name) throw new AppError("validation", "اسم القالب مطلوب");
  if (i.colors.length !== 5 || !i.colors.every((c) => HEX.test(c))) throw new AppError("validation", "الألوان الخمسة مطلوبة بصيغة #RRGGBB");
  return { layout: i.layout, name, category: clampStr(i.category, 60) || "عام", colors: i.colors as TemplateDoc["colors"], visible: !!i.visible, order: Number.isFinite(i.order) ? Math.round(i.order) : 99 };
}

export async function createTemplate(actorId: string, input: TemplateInput) {
  const v = validate(input);
  const ref = db().collection(C.templates).doc();
  const t: TemplateDoc = { ...v, id: ref.id, ownerId: input.ownerId ?? null, createdAt: Date.now() };
  await ref.set(t);
  await audit(actorId, "template.create", `templates/${ref.id}`, { name: t.name, ownerId: t.ownerId });
  return t;
}

export async function updateTemplate(actorId: string, id: string, input: TemplateInput) {
  const cur = await getTemplate(id);
  if (!cur) throw notFound("القالب");
  const v = validate(input);
  await db().collection(C.templates).doc(id).update(v);
  await audit(actorId, "template.update", `templates/${id}`, v);
}

export async function setTemplateVisible(actorId: string, id: string, visible: boolean) {
  const cur = await getTemplate(id);
  if (!cur) throw notFound("القالب");
  await db().collection(C.templates).doc(id).update({ visible });
  await audit(actorId, visible ? "template.show" : "template.hide", `templates/${id}`, {});
}

/** القالب المعروض لفعالية (أو القالب الافتراضي إن لم يُختر بعد). */
export async function resolveTemplate(templateId: string | null): Promise<Pick<TemplateDoc, "layout" | "colors" | "name">> {
  const t = await getTemplate(templateId);
  if (t) return t;
  const l = LAYOUTS.plum_frame;
  return { layout: "plum_frame", colors: l.colors, name: l.defaultName };
}
