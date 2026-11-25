import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";

/* ======================== معرّفات ورموز ======================== */

/** رمز عشوائي صعب التخمين. 20 بايت = 160 بت، بترميز base64url (27 حرفًا). */
export function randomToken(bytes = 20): string {
  return randomBytes(bytes).toString("base64url");
}

/** معرّف وثيقة عشوائي قصير (128 بت). */
export function newId(): string {
  return randomBytes(16).toString("base64url").replace(/[-_]/g, (c) => (c === "-" ? "a" : "b"));
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

/* ======================== أخطاء المنتج ======================== */

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const notFound = (what = "العنصر") => new AppError("not_found", `${what} غير موجود`, 404);
export const forbidden = () => new AppError("forbidden", "لا تملك صلاحية تنفيذ هذا الإجراء", 403);

/* ======================== أرقام وتواصل ======================== */

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d] ?? d);
}

/**
 * يوحّد رقم الجوال إلى صيغة E.164.
 * أرقام الجوال السعودية: 05xxxxxxxx، 5xxxxxxxx (كما يخزنها Excel)، 9665…، ‎+9665…، 009665… والأرقام العربية.
 * الأرقام الدولية الأخرى تُقبل إن بدأت بـ + أو 00 وطولها 8-15 رقمًا.
 * يعيد null إن كان الرقم غير صالح.
 */
export function normalizePhone(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  let s = toLatinDigits(String(input)).trim();
  if (!s) return null;
  // أرقام Excel قد تأتي بصيغة 5.12345678E8 أو 512345678.0
  if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, "");
  if (/^\d(\.\d+)?e\+?\d+$/i.test(s)) s = Number(s).toFixed(0);
  s = s.replace(/[\s\-().‎‏‪-‮]/g, "");
  let intl = false;
  if (s.startsWith("+")) {
    intl = true;
    s = s.slice(1);
  } else if (s.startsWith("00")) {
    intl = true;
    s = s.slice(2);
  }
  if (!/^\d+$/.test(s)) return null;
  // سعودي
  if (s.startsWith("9665") && s.length === 12) return `+${s}`;
  if (!intl) {
    if (s.startsWith("05") && s.length === 10) return `+966${s.slice(1)}`;
    if (s.startsWith("5") && s.length === 9) return `+966${s}`;
    if (s.startsWith("9665") && s.length === 12) return `+${s}`;
    return null;
  }
  if (s.startsWith("966")) return null; // رقم سعودي بطول خاطئ
  if (s.length >= 8 && s.length <= 15) return `+${s}`;
  return null;
}

export function normalizeEmail(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (s.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return null;
  return s;
}

/** أرقام البحث: يستخرج الأرقام من نص البحث ويولّد صيغًا مكافئة للبحث الجزئي في الأرقام المخزنة. */
export function phoneSearchVariants(query: string): string[] {
  const digits = toLatinDigits(query).replace(/\D/g, "");
  if (digits.length < 3) return [];
  const out = new Set<string>([digits]);
  if (digits.startsWith("00")) out.add(digits.slice(2));
  if (digits.startsWith("0")) out.add("966" + digits.slice(1));
  if (digits.startsWith("0")) out.add(digits.slice(1));
  return [...out];
}

/* ======================== مال ======================== */

/** المبالغ تُخزن بالهللة كأعداد صحيحة. */
export function formatSAR(halalas: number): string {
  const sign = halalas < 0 ? "-" : "";
  const abs = Math.abs(halalas);
  const riyals = Math.floor(abs / 100);
  const rem = abs % 100;
  const r = riyals.toLocaleString("en-US");
  return `${sign}${rem ? `${r}.${String(rem).padStart(2, "0")}` : r} ر.س`;
}

export function riyalsToHalalas(v: unknown): number | null {
  const n = Number(toLatinDigits(String(v ?? "")).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/* ======================== وقت (توقيت الرياض) ======================== */

export const TZ = "Asia/Riyadh";
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // الرياض UTC+3 بلا توقيت صيفي

/** يحوّل قيمة datetime-local (yyyy-mm-ddThh:mm) بتوقيت الرياض إلى ms. */
export function riyadhLocalToMs(local: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || "");
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return utc - RIYADH_OFFSET_MS;
}

export function msToRiyadhLocal(ms: number): string {
  const d = new Date(ms + RIYADH_OFFSET_MS);
  return d.toISOString().slice(0, 16);
}

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  timeZone: TZ,
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});
const shortFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  timeZone: TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const fmtDate = (ms: number) => dateFmt.format(ms);
export const fmtTime = (ms: number) => timeFmt.format(ms);
export const fmtDateTime = (ms: number) => `${dateFmt.format(ms)} — ${timeFmt.format(ms)}`;
export const fmtShort = (ms: number) => shortFmt.format(ms);

export const now = () => Date.now();
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/* ======================== متفرقات ======================== */

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function clampStr(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

/** يمنع حقن الصيغ في Excel/CSV */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function maskContact(c: string): string {
  if (c.includes("@")) {
    const [u, d] = c.split("@");
    return `${u.slice(0, 2)}***@${d}`;
  }
  return `${c.slice(0, 4)}*****${c.slice(-3)}`;
}
