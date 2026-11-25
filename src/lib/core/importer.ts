import ExcelJS from "exceljs";
import { AppError, normalizeEmail, normalizePhone, toLatinDigits, clampStr } from "../util";
import type { Invitation } from "../types";
import { addInvitations } from "./invitations";
import { getOwnedEvent, listInvitations } from "./events";

export interface RawRow {
  name: string;
  phone: string;
  email: string;
  companion: string;
}

export interface ClassifiedRow extends RawRow {
  index: number; // رقم الصف في الملف
  status: "ok" | "duplicate" | "invalid";
  reasons: string[];
  normPhone: string | null;
  normEmail: string | null;
  allowCompanion: boolean;
}

const HEADERS: Record<keyof RawRow, string[]> = {
  name: ["الاسم", "اسم", "الاسم الكامل", "اسم المدعو", "name", "full name", "fullname", "guest", "guest name"],
  phone: ["الجوال", "رقم الجوال", "جوال", "الهاتف", "رقم الهاتف", "الواتساب", "واتساب", "phone", "mobile", "phone number", "whatsapp", "tel"],
  email: ["البريد", "البريد الإلكتروني", "البريد الالكتروني", "الايميل", "الإيميل", "ايميل", "email", "e-mail", "mail"],
  companion: ["مرافق", "المرافق", "مع مرافق", "يسمح بمرافق", "companion", "plus one", "plus-one", "+1", "guest+1"],
};

const norm = (s: string) => toLatinDigits(String(s ?? "")).trim().toLowerCase().replace(/\s+/g, " ").replace(/[إأآ]/g, "ا");

function detectColumns(first: string[]): { map: Record<keyof RawRow, number>; hasHeader: boolean } {
  const map: Partial<Record<keyof RawRow, number>> = {};
  first.forEach((cell, idx) => {
    const c = norm(cell);
    for (const key of Object.keys(HEADERS) as (keyof RawRow)[]) {
      if (map[key] === undefined && HEADERS[key].some((h) => norm(h) === c)) map[key] = idx;
    }
  });
  const found = Object.keys(map).length;
  if (found >= 1 && (map.name !== undefined || found >= 2)) {
    return { map: { name: map.name ?? -1, phone: map.phone ?? -1, email: map.email ?? -1, companion: map.companion ?? -1 }, hasHeader: true };
  }
  // لا يوجد صف عناوين: نفترض الترتيب (الاسم، الجوال، البريد، مرافق)
  return { map: { name: 0, phone: 1, email: 2, companion: 3 }, hasHeader: false };
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text; // رابط
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("hyperlink" in v) return String((v as { hyperlink: string }).hyperlink).replace(/^mailto:/, "");
  }
  return String(v);
}

/** محلل CSV بسيط يدعم الاقتباس والفاصلة أو الفاصلة المنقوطة */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const firstLine = t.split(/\r?\n/, 1)[0] || "";
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export async function parseSpreadsheet(buf: Buffer, filename: string): Promise<RawRow[]> {
  const lower = filename.toLowerCase();
  let grid: string[][];
  if (lower.endsWith(".xls")) {
    throw new AppError("xls_unsupported", "صيغة Excel القديمة (.xls) غير مدعومة. افتح الملف واحفظه بصيغة .xlsx أو .csv ثم ارفعه.");
  } else if (lower.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      throw new AppError("bad_file", "تعذّرت قراءة ملف Excel. تأكد أنه بصيغة .xlsx سليمة.");
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new AppError("empty", "الملف لا يحتوي أوراق عمل");
    grid = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      for (let c = 1; c <= Math.max(row.cellCount, 4); c++) vals.push(cellText(row.getCell(c).value).trim());
      if (vals.some((v) => v)) grid.push(vals);
    });
  } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    grid = parseCsv(buf.toString("utf8"));
  } else {
    throw new AppError("bad_type", "ارفع ملفًا بصيغة .xlsx أو .csv");
  }
  if (!grid.length) throw new AppError("empty", "الملف فارغ");
  if (grid.length > 5001) throw new AppError("too_many", "الحد الأقصى 5000 صف في الملف الواحد");
  const { map, hasHeader } = detectColumns(grid[0]);
  const body = hasHeader ? grid.slice(1) : grid;
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  return body.map((r) => ({ name: at(r, map.name), phone: at(r, map.phone), email: at(r, map.email), companion: at(r, map.companion) }));
}

const YES = ["نعم", "ايوه", "أيوه", "اي", "yes", "y", "1", "true", "✓", "✔", "x", "مرافق", "مع مرافق"];
const NO = ["لا", "no", "n", "0", "false", "", "-", "بدون"];

export function parseCompanion(v: string): boolean | null {
  const s = norm(v);
  if (YES.map(norm).includes(s)) return true;
  if (NO.map(norm).includes(s)) return false;
  return null;
}

/** تصنيف الصفوف: مقبولة، مكررة (داخل الملف أو مع الموجودين)، تحتاج تصحيحًا مع السبب. */
export function classifyRows(rows: RawRow[], existing: Pick<Invitation, "phone" | "email">[], startIndex = 2): ClassifiedRow[] {
  const existingPhones = new Set(existing.map((i) => i.phone).filter(Boolean));
  const existingEmails = new Set(existing.map((i) => i.email).filter(Boolean));
  const seenPhones = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  return rows.map((r, i) => {
    const reasons: string[] = [];
    const name = clampStr(r.name, 120);
    const normPhone = r.phone ? normalizePhone(r.phone) : null;
    const normEmail = r.email ? normalizeEmail(r.email) : null;
    if (!name) reasons.push("الاسم مفقود");
    if (r.phone && !normPhone) reasons.push("رقم الجوال غير صالح");
    if (r.email && !normEmail) reasons.push("البريد غير صالح");
    if (!r.phone && !r.email) reasons.push("لا يوجد جوال ولا بريد");
    const comp = parseCompanion(r.companion);
    if (comp === null) reasons.push("قيمة المرافق غير مفهومة (استخدم نعم/لا)");
    let status: ClassifiedRow["status"] = reasons.length ? "invalid" : "ok";
    if (status === "ok") {
      const dupReasons: string[] = [];
      if (normPhone && existingPhones.has(normPhone)) dupReasons.push("الجوال موجود في المدعوين الحاليين");
      if (normEmail && existingEmails.has(normEmail)) dupReasons.push("البريد موجود في المدعوين الحاليين");
      if (normPhone && seenPhones.has(normPhone)) dupReasons.push(`الجوال مكرر في الملف (الصف ${seenPhones.get(normPhone)})`);
      if (normEmail && seenEmails.has(normEmail)) dupReasons.push(`البريد مكرر في الملف (الصف ${seenEmails.get(normEmail)})`);
      if (dupReasons.length) {
        status = "duplicate";
        reasons.push(...dupReasons);
      }
    }
    const rowNo = startIndex + i;
    if (status === "ok") {
      if (normPhone) seenPhones.set(normPhone, rowNo);
      if (normEmail) seenEmails.set(normEmail, rowNo);
    }
    return { ...r, name, index: rowNo, status, reasons, normPhone, normEmail, allowCompanion: !!comp };
  });
}

export async function previewImport(ownerId: string, eventId: string, rows: RawRow[]) {
  const e = await getOwnedEvent(ownerId, eventId);
  if (e.type !== "private") throw new AppError("not_private", "الاستيراد للدعوات الخاصة فقط");
  const existing = await listInvitations(eventId);
  return classifyRows(rows, existing);
}

/** الاعتماد: يعيد التحقق في الخادم ولا يضيف إلا المقبول. */
export async function commitImport(ownerId: string, eventId: string, rows: RawRow[]) {
  if (rows.length > 5000) throw new AppError("too_many", "الحد الأقصى 5000 صف");
  const classified = await previewImport(ownerId, eventId, rows);
  const ok = classified.filter((r) => r.status === "ok");
  const added = await addInvitations(
    ownerId,
    eventId,
    ok.map((r) => ({ name: r.name, phone: r.normPhone, email: r.normEmail, allowCompanion: r.allowCompanion })),
  );
  return { added: added.length, skipped: classified.length - ok.length };
}

/** ملف Excel نموذجي للتنزيل */
export async function sampleWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("المدعوون", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "الاسم", key: "name", width: 26 },
    { header: "الجوال", key: "phone", width: 18 },
    { header: "البريد", key: "email", width: 28 },
    { header: "مرافق", key: "companion", width: 10 },
  ];
  ws.addRow({ name: "سارة العتيبي", phone: "0551234567", email: "sara@example.com", companion: "نعم" });
  ws.addRow({ name: "محمد القحطاني", phone: "0569876543", email: "", companion: "لا" });
  ws.addRow({ name: "نورة الشهري", phone: "", email: "noura@example.com", companion: "لا" });
  ws.getRow(1).font = { bold: true };
  ws.getColumn("phone").numFmt = "@";
  return Buffer.from(await wb.xlsx.writeBuffer());
}
