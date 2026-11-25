import type { Channel, MessageKind } from "../types";
import type { EventView } from "./view";

/**
 * نصوص الرسائل مكتوبة كقوالب بمتغيرات {{name}} حتى تتحول مباشرة إلى
 * قوالب واتساب معتمدة (WhatsApp Business message templates) عند اختيار المزوّد.
 * كل قالب له مفتاح ثابت (key) ومتغيرات مسمّاة.
 */
export interface MessageTemplateDef {
  key: string;
  kind: MessageKind;
  subject: string; // للبريد
  body: string;
  vars: string[];
}

export const MESSAGE_TEMPLATES: Record<string, MessageTemplateDef> = {
  invitation: {
    key: "wafda_invitation_v1",
    kind: "invitation",
    subject: "دعوة: {{event_title}}",
    body:
      "مرحبًا {{guest_name}}،\n" +
      "يسعد {{org_name}} دعوتك لحضور «{{event_title}}».\n" +
      "الموعد: {{event_when}}\n" +
      "المكان: {{event_place}}\n" +
      "{{companion_line}}" +
      "أكّد حضورك من الرابط:\n{{invitation_link}}",
    vars: ["guest_name", "org_name", "event_title", "event_when", "event_place", "companion_line", "invitation_link"],
  },
  reminder: {
    key: "wafda_reminder_v1",
    kind: "reminder",
    subject: "تذكير: {{event_title}}",
    body:
      "مرحبًا {{guest_name}}،\n" +
      "تذكير بدعوتك لحضور «{{event_title}}» في {{event_when}}.\n" +
      "لم نستلم ردك بعد. أكّد حضورك أو اعتذر من الرابط:\n{{invitation_link}}",
    vars: ["guest_name", "event_title", "event_when", "invitation_link"],
  },
  confirmation: {
    key: "wafda_confirmation_v1",
    kind: "confirmation",
    subject: "تم تأكيد حضورك: {{event_title}}",
    body:
      "{{guest_name}}، تم تأكيد حضورك لـ «{{event_title}}».\n" +
      "الموعد: {{event_when}}\n" +
      "المكان: {{event_place}}\n" +
      "تذكرتك (اعرض رمز QR عند الدخول):\n{{ticket_link}}\n" +
      "{{companion_ticket_line}}" +
      "لإدارة حضورك أو الاعتذار:\n{{manage_link}}",
    vars: ["guest_name", "event_title", "event_when", "event_place", "ticket_link", "companion_ticket_line", "manage_link"],
  },
  ticket_resend: {
    key: "wafda_ticket_resend_v1",
    kind: "ticket_resend",
    subject: "تذكرتك: {{event_title}}",
    body:
      "{{guest_name}}، هذه تذكرتك لـ «{{event_title}}» ({{event_when}}):\n{{ticket_link}}\n" +
      "{{companion_ticket_line}}" +
      "لإدارة حضورك:\n{{manage_link}}",
    vars: ["guest_name", "event_title", "event_when", "ticket_link", "companion_ticket_line", "manage_link"],
  },
  registration_status: {
    key: "wafda_registration_status_v1",
    kind: "ticket_resend",
    subject: "تسجيلك في {{event_title}}",
    body:
      "{{guest_name}}، تسجيلك في «{{event_title}}» حالته: {{status_text}}.\n" +
      "لمتابعة تسجيلك:\n{{manage_link}}",
    vars: ["guest_name", "event_title", "status_text", "manage_link"],
  },
  waitlist_offer: {
    key: "wafda_waitlist_offer_v1",
    kind: "waitlist_offer",
    subject: "توفر مقعد: {{event_title}}",
    body:
      "{{guest_name}}، توفر مقعد في «{{event_title}}» ({{event_when}}).\n" +
      "الفرصة صالحة حتى {{offer_expires}}، والمقعد يُحجز عند تأكيدك إن كان لا يزال متاحًا.\n" +
      "أكّد حضورك من الرابط:\n{{manage_link}}",
    vars: ["guest_name", "event_title", "event_when", "offer_expires", "manage_link"],
  },
  waitlist_update: {
    key: "wafda_waitlist_update_v1",
    kind: "waitlist_update",
    subject: "تحديث قائمة الانتظار: {{event_title}}",
    body: "{{guest_name}}، {{update_text}}\nلمتابعة تسجيلك:\n{{manage_link}}",
    vars: ["guest_name", "update_text", "manage_link"],
  },
  staff_invite: {
    key: "wafda_staff_invite_v1",
    kind: "staff_invite",
    subject: "انضمامك لفريق الاستقبال: {{event_title}}",
    body:
      "مرحبًا {{staff_name}}،\n" +
      "أضافك {{org_name}} لفريق الاستقبال في «{{event_title}}» ({{event_when}}).\n" +
      "{{access_line}}",
    vars: ["staff_name", "org_name", "event_title", "event_when", "access_line"],
  },
};

export function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

export function renderMessage(templateName: keyof typeof MESSAGE_TEMPLATES, vars: Record<string, string>, channel: Channel) {
  const t = MESSAGE_TEMPLATES[templateName];
  const body = fill(t.body, vars).replace(/\n{3,}/g, "\n\n");
  return {
    template: t.key,
    subject: fill(t.subject, vars),
    body: channel === "email" ? `${body}\n\n— وفدة | WAFDA` : body,
  };
}

/** متغيرات الفعالية الأساسية من دالة العرض الموحّدة */
export function eventVars(v: EventView): Record<string, string> {
  return {
    event_title: v.title,
    org_name: v.orgName || v.brandName,
    event_when: v.whenText,
    event_place: v.placeText || "يُعلن لاحقًا",
  };
}
