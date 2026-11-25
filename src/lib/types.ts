// أنواع وثائق Firestore. الأوقات أرقام (ms منذ 1970) والمبالغ بالهللة.

export type Role = "organizer" | "staff" | "admin";
export type UserStatus = "active" | "invited" | "suspended";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  passwordHash?: string;
  creditBalance: number; // هللة
  createdAt: number;
}

export type EventType = "private" | "public";
export type FullPolicy = "close" | "waitlist";
export type EventStatus = "draft" | "active" | "cancelled";

export interface EventDoc {
  id: string;
  ownerId: string;
  status: EventStatus;
  type: EventType;
  title: string;
  orgName: string;
  description: string;
  startAt: number;
  endAt: number;
  venue: string;
  address: string;
  mapUrl: string;
  maxAttendees: number;
  fullPolicy: FullPolicy;
  templateId: string | null;
  publicSlug: string; // رمز الرابط العام
  paidPlaces: number; // أماكن الباقة المدفوعة
  reservedSeats: number; // مقاعد محجوزة فعليًا (مؤكدون + مرافقوهم)
  checkedInGuests: number;
  checkedInCompanions: number;
  confirmationSeq: number;
  createdAt: number;
  updatedAt: number;
  activatedAt?: number;
  cancelledAt?: number;
}

export type Channel = "whatsapp" | "email";
export type ChannelMode = "whatsapp" | "email" | "both";
export type SendStatus = "not_sent" | "sending" | "sent" | "failed";
export type RegStatus = "none" | "confirmed" | "declined" | "waitlisted" | "offered" | "cancelled";

export interface Invitation {
  id: string;
  eventId: string;
  ownerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  allowCompanion: boolean;
  token: string;
  channelOverride: ChannelMode | null; // تعديل لكل مدعو
  sendStatus: SendStatus;
  waStatus: SendStatus;
  emailStatus: SendStatus;
  lastSentAt: number | null;
  regStatus: RegStatus; // نسخة من حالة التسجيل لتسهيل الاستعلام
  regId: string | null;
  order: number;
  createdAt: number;
}

export type RegistrationStatus = "confirmed" | "waitlisted" | "offered" | "declined" | "cancelled";

export interface Registration {
  id: string;
  eventId: string;
  ownerId: string;
  source: "private" | "public";
  invitationId: string | null;
  name: string;
  contactType: "phone" | "email";
  contact: string;
  seats: number; // المقاعد المحجوزة فعليًا عند التأكيد (1 أو 2)
  withCompanion: boolean;
  requestedSeats: number; // في الانتظار: عدد المقاعد المطلوبة
  status: RegistrationStatus;
  manageToken: string;
  offerExpiresAt: number | null;
  offeredAt: number | null;
  waitlistedAt: number | null;
  confirmedAt: number | null;
  declinedAt: number | null;
  lastTicketResendAt: number | null;
  resendSeq: number;
  confirmCount: number;
  offerCount: number;
  createdAt: number;
  updatedAt: number;
}

export type TicketKind = "guest" | "companion";

export interface Ticket {
  id: string; // <registrationId>_<kind>
  token: string; // 160 بت، هو محتوى رمز QR
  eventId: string;
  registrationId: string;
  kind: TicketKind;
  holderName: string; // للمرافق: "مرافق"
  guestName: string; // اسم المدعو صاحب التسجيل
  status: "active" | "cancelled";
  checkedInAt: number | null;
  checkedInBy: string | null;
  checkedInByName: string | null;
  checkInMethod: "scan" | "manual" | null;
  createdAt: number;
}

export type MessageKind =
  | "invitation"
  | "reminder"
  | "confirmation"
  | "waitlist_offer"
  | "waitlist_update"
  | "staff_invite"
  | "ticket_resend";

export type ChargedTo = "credit" | "package" | "platform";

export interface MessageDoc {
  id: string;
  ownerId: string | null;
  eventId: string | null;
  batchId: string | null;
  kind: MessageKind;
  channel: Channel;
  to: string;
  template: string; // مفتاح قالب الرسالة (لقوالب واتساب المعتمدة)
  vars: Record<string, string>;
  subject: string;
  body: string;
  status: "queued" | "sending" | "sent" | "failed";
  attempts: number;
  nextAttemptAt: number;
  leaseUntil: number | null;
  chargedTo: ChargedTo;
  cost: number; // المخصوم من رصيد المنظّم (هللة)
  opCost: number; // تكلفة تشغيل تقديرية (للباقة/المنصة)
  refunded: boolean;
  invitationId: string | null;
  registrationId: string | null;
  error: string | null;
  providerId: string | null;
  createdAt: number;
  sentAt: number | null;
  history: { at: number; status: string; note?: string }[];
}

export interface Settings {
  pricing: {
    demo: boolean;
    packages: { places: number; price: number }[];
    extraPlacePrice: number;
    messagePrice: Record<Channel, number>;
    confirmationOpCost: Record<Channel, number>;
  };
  policies: {
    insufficientCredit: "block" | "partial";
    maxAttempts: number;
    retryBaseSeconds: number;
    waitlistOfferHours: number;
    ticketResendMinMinutes: number;
    staffInviteDays: number;
  };
  updatedAt: number;
}

export interface TemplateDoc {
  id: string;
  layout: LayoutKey;
  name: string;
  category: string;
  colors: [string, string, string, string, string];
  visible: boolean;
  order: number;
  ownerId: string | null; // قالب خاص بمنظّم
  createdAt: number;
}

export type LayoutKey = "plum_frame" | "ivory_classic" | "lilac_soft" | "corporate" | "workshop";
