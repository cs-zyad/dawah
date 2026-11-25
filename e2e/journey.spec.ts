import { test, expect, chromium, type Browser, type Page, type BrowserContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

/**
 * الرحلة كاملة: إنشاء فعالية ← القالب ← المدعوون ← الدفع ← الإرسال ← فتح الدعوة من صندوق الرسائل على الجوال
 * ← تأكيد فردي ومع مرافق ← مسح QR بكاميرا افتراضية ← «حضر مسبقًا» ← تحضير المرافق يدويًا ← منع عضو غير معيّن
 * ← اللوحة وCSV ← الرابط العام والمكتمل ← عزل المنظّمين ← زيارة كل الصفحات.
 */

const BASE = process.env.E2E_BASE_URL || "http://localhost:3100";
const ART = path.resolve("e2e/.artifacts");
mkdirSync(ART, { recursive: true });
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const shot = (p: Page, name: string) => p.screenshot({ path: path.join(ART, `${name}.png`), fullPage: true });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill("Wafda@2026");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.getByRole("button", { name: "دخول" }).click()]);
}

test.describe.serial("رحلة وفدة كاملة", () => {
  let browser: Browser;
  let org: BrowserContext;
  let orgPage: Page;
  let eventId = "";
  let guestTicket = "";
  let companionTicket = "";

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    org = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
    orgPage = await org.newPage();
    orgPage.on("dialog", (d) => d.accept());
    await login(orgPage, "organizer@wafda.test");
  });

  test("1. إنشاء فعالية ثم القالب ثم المدعوين ثم الدفع ثم الإرسال", async () => {
    const p = orgPage;
    await p.goto("/dashboard/events/new");
    await p.getByLabel("اسم الفعالية").fill("أمسية اختبار الرحلة");
    await p.getByLabel("الجهة المنظّمة").fill("فريق الجودة");
    await p.getByLabel("الوصف").fill("فعالية آلية لاختبار الرحلة كاملة.");
    const d = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    await p.getByLabel("البداية").fill(`${d}T18:00`);
    await p.getByLabel("النهاية").fill(`${d}T21:00`);
    await p.getByLabel("المكان").fill("القاعة الرئيسية");
    await p.getByLabel("العنوان").fill("الرياض");
    await p.getByLabel("الحد الأقصى للحضور").fill("30");
    await p.getByLabel("خاصة بالاسم").check();
    await p.getByLabel("قائمة انتظار").check();
    await p.getByRole("button", { name: "حفظ المسودة والمتابعة للقالب" }).click();
    await p.waitForURL(/\/template$/);
    eventId = p.url().split("/")[5];
    await p.getByRole("button", { name: "اختيار" }).first().click();
    await expect(p.getByText("المختار", { exact: true })).toBeVisible();
    await expect(p.getByRole("link", { name: /✓ القالب/ })).toBeVisible();
    await shot(p, "01-template-preview");

    await p.goto(`/dashboard/events/${eventId}/guests`);
    const add = async (name: string, phone: string, email: string, companion: boolean) => {
      await p.getByLabel("الاسم", { exact: true }).first().fill(name);
      await p.getByLabel("الجوال", { exact: true }).first().fill(phone);
      await p.getByLabel("البريد", { exact: true }).first().fill(email);
      if (companion) await p.getByLabel("يسمح بمرافق واحد").check();
      await p.getByRole("button", { name: "إضافة", exact: true }).click();
      await expect(p.getByText("أُضيف المدعو")).toBeVisible();
      await expect(p.getByText(name, { exact: true }).first()).toBeVisible();
    };
    await add("ضيف الرحلة", "0559990001", "", true);
    await add("ضيفة البريد", "", "e2e.guest@example.com", false);

    await p.goto(`/dashboard/events/${eventId}/payment`);
    await p.getByRole("button", { name: "ادفع قبل إرسال الدعوات" }).click();
    await p.waitForURL(/\/dev\/checkout\//);
    await p.getByRole("button", { name: "ادفع الآن (تجريبي)" }).click();
    await expect(p.getByText("وصل الإشعار الموقّع وطُبّق الأثر")).toBeVisible();
    await p.getByRole("button", { name: "إعادة إرسال نفس الإشعار" }).click();
    await expect(p.getByText("تجاهله الخادم")).toBeVisible();
    await shot(p, "02-mock-checkout");
    await p.goto(`/dashboard/events/${eventId}/payment`);
    await expect(p.locator(".stat", { hasText: "الأماكن المدفوعة" })).toContainText("50");

    await p.goto(`/dashboard/events/${eventId}/send`);
    await p.getByRole("button", { name: "إرسال الدعوات" }).click();
    await expect(p.getByText(/أُرسلت 2 رسالة/)).toBeVisible();
    await shot(p, "03-send");
  });

  test("2. فتح الدعوة من صندوق الرسائل على الجوال: تأكيد مع مرافق وتأكيد فردي", async () => {
    const ctx = await browser.newContext({ baseURL: BASE, ...MOBILE });
    const p = await ctx.newPage();
    await p.goto("/dev/inbox?to=%2B966559990001");
    await shot(p, "04-inbox");
    await p.locator('a[href*="/i/"]').first().click();
    await expect(p.getByRole("heading", { name: "أمسية اختبار الرحلة" })).toBeVisible();
    await expect(p.getByLabel("رقم الجوال (واتساب)")).toHaveValue("0559990001");
    await p.getByLabel("معي مرافق").check();
    await shot(p, "05-invitation-mobile");
    await p.getByRole("button", { name: "أكّد حضورك" }).click();
    await expect(p.getByText("تم تأكيد حضورك")).toBeVisible();
    await expect(p.getByText("حُجز مقعدان")).toBeVisible();
    await shot(p, "06-confirmed-mobile");
    const hrefs = await p.getByRole("link", { name: "عرض التذكرة" }).evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(hrefs).toHaveLength(2);
    guestTicket = hrefs[0].split("/t/")[1];
    companionTicket = hrefs[1].split("/t/")[1];
    expect(guestTicket).not.toBe(companionTicket);
    await p.goto(`/t/${companionTicket}`);
    await expect(p.getByText("مرافق — ضيف الرحلة")).toBeVisible();
    await expect(p.getByRole("button", { name: "مشاركة التذكرة مع المرافق" })).toBeVisible();
    await shot(p, "07-companion-ticket");
    expect(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

    await p.goto("/dev/inbox?to=e2e.guest%40example.com");
    await p.locator('a[href*="/i/"]').first().click();
    await expect(p.getByLabel("البريد الإلكتروني")).toHaveValue("e2e.guest@example.com");
    await p.getByRole("button", { name: "أكّد حضورك" }).click();
    await expect(p.getByText("تم تأكيد حضورك")).toBeVisible();
    await expect(p.getByText("حُجز مقعدك")).toBeVisible();
    // رسالة التأكيد مع التذكرة وصلت للصندوق التجريبي
    await p.goto("/dev/inbox?to=e2e.guest%40example.com");
    await expect(p.getByText("تم تأكيد حضورك").first()).toBeVisible();
    await ctx.close();
  });

  test("3-4. مسح QR بكاميرا افتراضية ثم «حضر مسبقًا» ثم تحضير المرافق يدويًا", async () => {
    // فيديو y4m مولّد عبر ffmpeg من رمز تذكرة حقيقي
    const png = path.join(ART, "qr.png");
    const y4m = path.join(ART, "qr.y4m");
    await QRCode.toFile(png, `${BASE}/t/${guestTicket}`, { width: 560, margin: 4 });
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", png, "-t", "3", "-r", "10", "-vf", "scale=560:560,pad=960:720:(ow-iw)/2:(oh-ih)/2:white", "-pix_fmt", "yuv420p", y4m]);
    const cam = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`] });
    const ctx = await cam.newContext({ baseURL: BASE, ...MOBILE, permissions: ["camera"] });
    const p = await ctx.newPage();
    await login(p, "organizer@wafda.test");
    await p.goto(`/checkin/${eventId}`);
    await p.getByRole("button", { name: "تشغيل الكاميرا" }).click();
    const result = p.getByTestId("scan-result");
    await expect(result).toContainText("تم تسجيل الدخول", { timeout: 30_000 });
    await expect(result).toContainText("ضيف الرحلة");
    await expect(p.getByTestId("count")).toHaveText("1");
    await shot(p, "08-scan-ok");
    await expect(result).toContainText("حضر مسبقًا", { timeout: 30_000 });
    await expect(result).toContainText("بالمسح");
    await shot(p, "09-scan-already");
    await p.getByRole("button", { name: "إيقاف الكاميرا" }).click();

    await p.getByText("تعذّر عرض الرمز؟").click();
    await p.getByLabel("بحث").fill("ضيف الرحلة");
    await p.getByRole("button", { name: "بحث", exact: true }).click();
    await p.getByRole("button", { name: "تسجيل الحضور يدويًا" }).click();
    await expect(result).toContainText("مرافق — ضيف الرحلة");
    await expect(result).toContainText("تم تسجيل الدخول");
    await expect(p.getByTestId("count")).toHaveText("2");
    await shot(p, "10-manual-companion");
    // إدخال الرمز يدويًا لتذكرة سبق تحضيرها
    await p.getByText("إدخال الرمز أو رابط التذكرة يدويًا").click();
    await p.getByLabel("الرمز أو الرابط").fill(`${BASE}/t/${companionTicket}`);
    await p.getByRole("button", { name: "تحقق" }).click();
    await expect(result).toContainText("حضر مسبقًا");
    // نفس المسح عبر jsQR على إطارات الفيديو (البديل عند غياب BarcodeDetector)
    await p.goto(`/checkin/${eventId}?engine=jsqr`);
    await p.getByRole("button", { name: "تشغيل الكاميرا" }).click();
    await expect(p.getByText("(jsQR)")).toBeVisible();
    await expect(p.getByTestId("scan-result")).toContainText("حضر مسبقًا", { timeout: 30_000 });
    await expect(p.getByTestId("count")).toHaveText("2");
    await cam.close();
  });

  test("5. منع عضو غير معيّن في الواجهة وفي API", async () => {
    const ctx = await browser.newContext({ baseURL: BASE, ...MOBILE });
    const p = await ctx.newPage();
    await login(p, "staff2@wafda.test");
    const r = await p.goto(`/checkin/${eventId}`);
    expect(r?.status()).toBe(404);
    const api = await p.request.post(`/api/checkin/${eventId}`, { data: { op: "scan", value: guestTicket } });
    expect(api.status()).toBe(404);
    const search = await p.request.post(`/api/checkin/${eventId}`, { data: { op: "search", value: "ضيف" } });
    expect(search.status()).toBe(404);
    await p.goto("/checkin");
    await expect(p.getByText("أمسية اختبار الرحلة")).toHaveCount(0);
    await ctx.close();
  });

  test("6. النتيجة في اللوحة وفي CSV", async () => {
    const p = orgPage;
    await p.goto(`/dashboard/events/${eventId}`);
    await expect(p.locator(".stat", { hasText: "الحاضرون" })).toContainText("2");
    await expect(p.locator(".stat", { hasText: "الحاضرون" })).toContainText("1 ضيف + 1 مرافق");
    await expect(p.locator(".stat", { hasText: "المؤكدون" })).toContainText("3");
    await shot(p, "11-overview-desktop");
    await p.goto(`/dashboard/events/${eventId}/guests`);
    await expect(p.getByText(/الضيف: حضر/)).toBeVisible();
    await expect(p.getByText(/المرافق: حضر/)).toBeVisible();
    await shot(p, "12-guests-desktop");
    const csv = await (await p.request.get(`/dashboard/events/${eventId}/export`)).text();
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toContain("النوع");
    expect(lines.filter((l) => l.includes("ضيف الرحلة") && l.includes("حضر"))).toHaveLength(2);
    expect(lines.some((l) => l.startsWith("مرافق") && l.includes("يدوي"))).toBe(true);
    expect(lines.some((l) => l.includes("ضيفة البريد") && l.includes("لم يحضر"))).toBe(true);
  });

  test("7. الرابط العام والرابط المكتمل", async () => {
    const p = orgPage;
    await p.goto("/dashboard");
    await p.getByRole("link", { name: /ورشة تصميم واجهات المستخدم/ }).click();
    await p.getByRole("link", { name: "الباقة والرابط العام" }).click();
    const publicUrl = await p.locator(".copy-box input").inputValue();
    await p.goto("/dashboard");
    await p.getByRole("link", { name: /جلسة حوارية/ }).click();
    await p.getByRole("link", { name: "الباقة والرابط العام" }).click();
    const fullUrl = await p.locator(".copy-box input").inputValue();

    const ctx = await browser.newContext({ baseURL: BASE, ...MOBILE });
    const m = await ctx.newPage();
    await m.goto(publicUrl);
    await m.getByLabel("الاسم").fill("زائرة الرابط العام");
    await m.getByLabel("رقم الجوال (واتساب)").fill("0558887766");
    await shot(m, "13-public-form");
    await m.getByRole("button", { name: "سجّل حضورك" }).click();
    await m.waitForURL(/\/r\//);
    await expect(m.getByText("تم تأكيد حضورك")).toBeVisible();
    await shot(m, "14-public-confirmed");
    // نفس الرقم بصيغة مختلفة: لا تكرار ولا كشف للتذكرة
    await m.goto(publicUrl);
    await m.getByLabel("الاسم").fill("شخص آخر");
    await m.getByLabel("رقم الجوال (واتساب)").fill("+966 55 888 7766");
    await m.getByRole("button", { name: "سجّل حضورك" }).click();
    await expect(m.getByText("وسيلة التواصل هذه مسجّلة مسبقًا.")).toBeVisible();
    await expect(m.getByRole("link", { name: "عرض التذكرة" })).toHaveCount(0);
    await m.goto(fullUrl);
    await expect(m.getByRole("heading", { name: "اكتمل العدد" })).toBeVisible();
    await expect(m.getByRole("button", { name: "سجّل حضورك" })).toHaveCount(0);
    await shot(m, "15-public-full");
    await ctx.close();
  });

  test("8. عزل المنظّمين", async () => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const p = await ctx.newPage();
    await login(p, "other@wafda.test");
    for (const t of ["", "/guests", "/send", "/payment", "/staff", "/messages", "/export"]) {
      const r = await p.goto(`/dashboard/events/${eventId}${t}`);
      expect(r?.status(), t).toBe(404);
    }
    const scan = await p.request.post(`/api/checkin/${eventId}`, { data: { op: "scan", value: guestTicket } });
    expect(scan.status()).toBe(404);
    await ctx.close();
  });

  test("9. زيارة كل صفحات المنظّم والأدمن بلا أخطاء وبلا تمرير أفقي على الجوال", async () => {
    const problems: string[] = [];
    async function crawl(email: string, start: string[], linkPrefix: RegExp) {
      const ctx = await browser.newContext({ baseURL: BASE, ...MOBILE, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      const errors: string[] = [];
      p.on("pageerror", (e) => errors.push(e.message));
      p.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push(m.text()));
      await login(p, email);
      const seen = new Set<string>();
      const queue = [...start];
      while (queue.length && seen.size < 120) {
        const url = queue.shift()!;
        if (seen.has(url)) continue;
        seen.add(url);
        errors.length = 0;
        const r = await p.goto(url, { waitUntil: "networkidle" });
        const status = r?.status() ?? 0;
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        const expected404 = /\/send$/.test(url) || /\/checkin\//.test(url);
        if (status >= 500 || (status >= 400 && !expected404)) problems.push(`${email} ${url} → ${status}`);
        if (overflow > 1) problems.push(`${email} ${url} → تمرير أفقي ${overflow}px`);
        if (errors.length) problems.push(`${email} ${url} → ${errors.join(" | ")}`);
        const links = await p.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")!));
        for (const l of links) if (linkPrefix.test(l) && !l.includes("/export") && !l.includes("?")) queue.push(l);
      }
      await ctx.close();
      return seen.size;
    }
    const n1 = await crawl("organizer@wafda.test", ["/dashboard"], /^\/(dashboard|checkin)/);
    const n2 = await crawl("admin@wafda.test", ["/admin"], /^\/admin/);
    const n3 = await crawl("staff@wafda.test", ["/checkin"], /^\/checkin/);
    console.log(`زيارة ${n1} صفحة منظّم، ${n2} صفحة أدمن، ${n3} صفحة استقبال`);
    expect(problems, problems.join("\n")).toEqual([]);
    expect(n1).toBeGreaterThan(30);
  });
});
