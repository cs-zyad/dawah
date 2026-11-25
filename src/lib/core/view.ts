import type { EventDoc } from "../types";
import { fmtDate, fmtTime } from "../util";
import { brand } from "@/config/brand";

export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const v = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (v) return `https://${v.replace(/\/+$/, "")}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

export const links = {
  invitation: (token: string) => `${appUrl()}/i/${token}`,
  manage: (token: string) => `${appUrl()}/r/${token}`,
  ticket: (token: string) => `${appUrl()}/t/${token}`,
  publicEvent: (slug: string) => `${appUrl()}/e/${slug}`,
  setup: (token: string) => `${appUrl()}/set-password/${token}`,
};

/**
 * المصدر الوحيد لعرض بيانات الفعالية: تستخدمه صفحة الدعوة والقالب ونص الرسائل.
 * أي تعديل في الصياغة يتم هنا فقط حتى تتطابق البيانات أينما ظهرت.
 */
export interface EventView {
  title: string;
  orgName: string;
  description: string;
  dateText: string;
  timeText: string;
  endTimeText: string;
  whenText: string;
  venue: string;
  address: string;
  mapUrl: string;
  placeText: string;
  guestName: string;
  brandName: string;
}

export function buildEventView(
  e: Pick<EventDoc, "title" | "orgName" | "description" | "startAt" | "endAt" | "venue" | "address" | "mapUrl">,
  guestName = "",
): EventView {
  const dateText = e.startAt ? fmtDate(e.startAt) : "—";
  const timeText = e.startAt ? fmtTime(e.startAt) : "—";
  const endTimeText = e.endAt ? fmtTime(e.endAt) : "";
  return {
    title: e.title || "فعالية بدون اسم",
    orgName: e.orgName || "",
    description: e.description || "",
    dateText,
    timeText,
    endTimeText,
    whenText: `${dateText}، الساعة ${timeText}${endTimeText ? ` حتى ${endTimeText}` : ""}`,
    venue: e.venue || "",
    address: e.address || "",
    mapUrl: e.mapUrl || "",
    placeText: [e.venue, e.address].filter(Boolean).join(" — "),
    guestName,
    brandName: brand.fullName,
  };
}
