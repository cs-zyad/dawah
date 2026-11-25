import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { parseSpreadsheet, classifyRows, commitImport, parseCsv, parseCompanion, sampleWorkbook } from "@/lib/core/importer";
import { listInvitations } from "@/lib/core/events";
import { resetDb, mkUser, mkEvent } from "./helpers";

beforeAll(resetDb);

async function xlsx(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("x");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("الاستيراد من Excel وCSV", () => {
  it("يقرأ xlsx بعناوين عربية والأرقام المخزنة كأرقام (بدون الصفر)", async () => {
    const buf = await xlsx([
      ["الاسم", "الجوال", "البريد", "مرافق"],
      ["سارة", 551234567, "sara@example.com", "نعم"],
      ["محمد", "0569876543", "", "لا"],
      ["نورة", 966501112222, "", ""],
    ]);
    const rows = await parseSpreadsheet(buf, "guests.xlsx");
    expect(rows).toHaveLength(3);
    const c = classifyRows(rows, []);
    expect(c.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(c[0].normPhone).toBe("+966551234567");
    expect(c[0].allowCompanion).toBe(true);
    expect(c[2].normPhone).toBe("+966501112222");
  });

  it("عناوين إنجليزية بترتيب مختلف", async () => {
    const buf = await xlsx([
      ["Email", "Full Name", "Plus One", "Mobile"],
      ["a@example.com", "Ali", "yes", "0551111111"],
    ]);
    const [r] = await parseSpreadsheet(buf, "g.xlsx");
    expect(r).toEqual({ name: "Ali", phone: "0551111111", email: "a@example.com", companion: "yes" });
  });

  it("بدون صف عناوين: يفترض الترتيب", async () => {
    const rows = await parseSpreadsheet(Buffer.from("خالد,0551234567,,نعم\nريم,,reem@example.com,لا\n"), "g.csv");
    expect(rows[0]).toEqual({ name: "خالد", phone: "0551234567", email: "", companion: "نعم" });
    expect(rows).toHaveLength(2);
  });

  it("CSV مع BOM واقتباس وفاصلة منقوطة", () => {
    expect(parseCsv('﻿الاسم;الجوال\n"العتيبي; سارة";0551234567\n')).toEqual([
      ["الاسم", "الجوال"],
      ["العتيبي; سارة", "0551234567"],
    ]);
  });

  it("يرفض .xls القديم برسالة واضحة", async () => {
    await expect(parseSpreadsheet(Buffer.from("x"), "old.xls")).rejects.toMatchObject({ code: "xls_unsupported" });
    await expect(parseSpreadsheet(Buffer.from("x"), "a.pdf")).rejects.toMatchObject({ code: "bad_type" });
  });

  it("تصنيف الصفوف: مقبولة، مكررة داخل الملف ومع الموجودين، وتحتاج تصحيحًا مع السبب", () => {
    const c = classifyRows(
      [
        { name: "أ1", phone: "0551000001", email: "", companion: "" },
        { name: "أ2", phone: "+966551000001", email: "", companion: "" }, // مكرر داخل الملف بصيغة أخرى
        { name: "أ3", phone: "0551000003", email: "", companion: "" }, // موجود مسبقًا
        { name: "", phone: "0551000004", email: "", companion: "" }, // بلا اسم
        { name: "أ5", phone: "12345", email: "", companion: "" }, // رقم غير صالح
        { name: "أ6", phone: "", email: "", companion: "" }, // بلا تواصل
        { name: "أ7", phone: "", email: "x@y", companion: "ربما" }, // بريد خاطئ ومرافق غير مفهوم
      ],
      [{ phone: "+966551000003", email: null }],
    );
    expect(c.map((r) => r.status)).toEqual(["ok", "duplicate", "duplicate", "invalid", "invalid", "invalid", "invalid"]);
    expect(c[1].reasons.join()).toContain("مكرر في الملف (الصف 2)");
    expect(c[2].reasons.join()).toContain("المدعوين الحاليين");
    expect(c[3].reasons).toContain("الاسم مفقود");
    expect(c[6].reasons).toEqual(expect.arrayContaining(["البريد غير صالح", "قيمة المرافق غير مفهومة (استخدم نعم/لا)"]));
    expect(parseCompanion("YES")).toBe(true);
    expect(parseCompanion("")).toBe(false);
  });

  it("الاعتماد يعيد التحقق في الخادم ولا يضيف إلا المقبول", async () => {
    const org = await mkUser();
    const e = await mkEvent(org, { pay: false });
    const r = await commitImport(org.id, e.id, [
      { name: "مقبول", phone: "0557000001", email: "", companion: "نعم" },
      { name: "مكرر", phone: "0557000001", email: "", companion: "" },
      { name: "", phone: "0557000003", email: "", companion: "" },
    ]);
    expect(r).toEqual({ added: 1, skipped: 2 });
    const again = await commitImport(org.id, e.id, [{ name: "مقبول", phone: "0557000001", email: "", companion: "" }]);
    expect(again).toEqual({ added: 0, skipped: 1 });
    const invs = await listInvitations(e.id);
    expect(invs).toHaveLength(1);
    expect(invs[0]).toMatchObject({ phone: "+966557000001", allowCompanion: true });
  });

  it("الملف النموذجي يُقرأ صحيحًا", async () => {
    const rows = await parseSpreadsheet(await sampleWorkbook(), "sample.xlsx");
    expect(classifyRows(rows, []).every((r) => r.status === "ok")).toBe(true);
  });
});
