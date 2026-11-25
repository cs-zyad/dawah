import { describe, it, expect } from "vitest";
import { normalizePhone, normalizeEmail, phoneSearchVariants, csvCell, riyadhLocalToMs, msToRiyadhLocal, formatSAR, randomToken } from "@/lib/util";
import { decideSeats } from "@/lib/core/rsvp";
import { quotePackage, DEFAULT_SETTINGS } from "@/lib/core/settings";
import { requiredPlaces } from "@/lib/core/events";
import { parseTicketInput, normalizeArabic } from "@/lib/core/checkin";
import { simulateOutcome } from "@/lib/providers/messaging";

describe("توحيد الأرقام السعودية", () => {
  const expected = "+966512345678";
  it.each([
    "0512345678",
    "512345678",
    "966512345678",
    "+966512345678",
    "00966512345678",
    "٠٥١٢٣٤٥٦٧٨",
    "+٩٦٦٥١٢٣٤٥٦٧٨",
    "05 1234 5678",
    "051-234-5678",
    512345678,
    "512345678.0",
    "‎+966 51 234 5678",
  ])("%s", (input) => {
    expect(normalizePhone(input)).toBe(expected);
  });
  it("يرفض الأرقام غير الصالحة", () => {
    for (const bad of ["", "123", "0412345678", "05123", "9665123", "abc", "+96651234", null, undefined]) expect(normalizePhone(bad)).toBeNull();
  });
  it("يقبل أرقامًا دولية أخرى", () => {
    expect(normalizePhone("+971501234567")).toBe("+971501234567");
    expect(normalizePhone("0044 7700 900123")).toBe("+447700900123");
  });
  it("صيغ البحث", () => {
    expect(phoneSearchVariants("0512")).toEqual(expect.arrayContaining(["0512", "966512", "512"]));
    expect(phoneSearchVariants("ab")).toEqual([]);
  });
});

describe("أدوات", () => {
  it("البريد", () => {
    expect(normalizeEmail(" Sara@Example.COM ")).toBe("sara@example.com");
    expect(normalizeEmail("bad@")).toBeNull();
  });
  it("منع حقن الصيغ في CSV", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+966")).toBe("'+966");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
  it("توقيت الرياض", () => {
    const ms = riyadhLocalToMs("2026-12-01T18:30")!;
    expect(new Date(ms).toISOString()).toBe("2026-12-01T15:30:00.000Z");
    expect(msToRiyadhLocal(ms)).toBe("2026-12-01T18:30");
  });
  it("العملة بالهللة", () => {
    expect(formatSAR(9900)).toBe("99 ر.س");
    expect(formatSAR(25)).toBe("0.25 ر.س");
  });
  it("الرموز 160 بت", () => {
    const t = randomToken();
    expect(Buffer.from(t, "base64url").length).toBe(20);
    expect(t).not.toBe(randomToken());
  });
  it("قراءة رمز التذكرة من الرابط أو النص", () => {
    const t = randomToken();
    expect(parseTicketInput(`https://x.test/t/${t}`)).toBe(t);
    expect(parseTicketInput(t)).toBe(t);
    expect(parseTicketInput("hello world")).toBeNull();
  });
  it("توحيد العربية للبحث", () => {
    expect(normalizeArabic("أحمد")).toBe(normalizeArabic("احمد"));
    expect(normalizeArabic("فاطمة")).toBe(normalizeArabic("فاطمه"));
  });
  it("محاكاة حالات المزوّد", () => {
    expect(simulateOutcome("whatsapp", "+966500000000", 0)?.permanent).toBe(true);
    expect(simulateOutcome("whatsapp", "+966500001111", 0)?.permanent).toBe(false);
    expect(simulateOutcome("whatsapp", "+966500001111", 1)).toBeNull();
    expect(simulateOutcome("email", "fail@x.com", 0)?.permanent).toBe(true);
    expect(simulateOutcome("email", "flaky@x.com", 0)?.ok).toBe(false);
  });
});

describe("قرار المقاعد والباقة", () => {
  it("مقعد واحد متبقٍ وطلب مقعدين", () => {
    expect(decideSeats(1, 2, "close", {})).toEqual({ action: "one_left", canWaitlist: false });
    expect(decideSeats(1, 2, "close", { acceptSingle: true })).toEqual({ action: "confirm", seats: 1 });
    expect(decideSeats(1, 2, "waitlist", { joinWaitlist: true })).toEqual({ action: "waitlist", seats: 2 });
    expect(decideSeats(0, 1, "waitlist", {})).toEqual({ action: "full", canWaitlist: true });
    expect(decideSeats(0, 1, "close", { joinWaitlist: true })).toEqual({ action: "full", canWaitlist: false });
  });
  it("حساب الباقة: 40 دعوة منها 10 بمرافق = 50 مكانًا", () => {
    const invs = Array.from({ length: 40 }, (_, i) => ({ allowCompanion: i < 10 }));
    expect(requiredPlaces(invs)).toBe(50);
    const q = quotePackage(50, DEFAULT_SETTINGS);
    expect(q.places).toBe(50);
    expect(q.price).toBe(9900);
    expect(quotePackage(51, DEFAULT_SETTINGS).places).toBe(100);
    const big = quotePackage(1010, DEFAULT_SETTINGS);
    expect(big).toMatchObject({ places: 1010, extraPlaces: 10, price: 119900 + 10 * 200 });
  });
});

describe("قراءة QR بـ jsQR (البديل عند غياب BarcodeDetector)", () => {
  it("يفك رمز تذكرة حقيقي بلا بيانات شخصية", async () => {
    const QRCode = (await import("qrcode")).default;
    const jsQR = (await import("jsqr")).default;
    const token = randomToken();
    const url = `http://localhost:3000/t/${token}`;
    const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const scale = 6;
    const margin = 4;
    const size = (n + margin * 2) * scale;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (qr.modules.get(y, x))
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) {
              const i = (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) * 4;
              data[i] = data[i + 1] = data[i + 2] = 0;
            }
    const out = jsQR(data, size, size);
    expect(out?.data).toBe(url);
    expect(parseTicketInput(out!.data)).toBe(token);
  });
});
