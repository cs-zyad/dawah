import { chromium } from "@playwright/test";
const B = "http://localhost:3000";
const OUT = process.argv[2];
const browser = await chromium.launch();
async function session(email, viewport) {
  const ctx = await browser.newContext({ viewport, locale: "ar-SA" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("PAGEERR " + e.message.slice(0, 200)));
  if (email) {
    await page.goto(B + "/login");
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', "Wafda@2026");
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click('button[type=submit]')]);
  }
  return { ctx, page, errors };
}
async function visit(s, path, shot) {
  s.errors.length = 0;
  const r = await s.page.goto(B + path, { waitUntil: "networkidle" });
  const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (shot) await s.page.screenshot({ path: `${OUT}/${shot}.png`, fullPage: true });
  console.log(`${r.status()} ${overflow > 1 ? "OVERFLOW+" + overflow : "ok"} ${path} ${s.errors.length ? "ERR: " + s.errors.join(" | ") : ""}`);
}
const mobile = { width: 375, height: 812 };
const org = await session("organizer@wafda.test", mobile);
await visit(org, "/dashboard", "m-dashboard");
const ids = await org.page.$$eval('a[href^="/dashboard/events/"]', (as) => [...new Set(as.map((a) => a.getAttribute("href").split("/")[3]))]);
console.log("events", ids);
for (const id of ids) for (const t of ["", "/guests", "/send", "/waitlist", "/template", "/payment", "/staff", "/details", "/messages"]) await visit(org, `/dashboard/events/${id}${t}`, id === ids[0] ? `m-ev${t.replace("/", "-") || "-overview"}` : null);
for (const p of ["/dashboard/events/new", "/dashboard/credit", "/dashboard/designs", "/dashboard/designs/new", "/dashboard/support", "/dashboard/support/new", "/checkin"]) await visit(org, p, "m" + p.replaceAll("/", "-"));
const d = await org.page.goto(B + "/dashboard/designs"); const dl = await org.page.$$eval('a[href^="/dashboard/designs/"]', (as) => as.map((a) => a.getAttribute("href")).filter((h) => !h.endsWith("new")));
for (const h of dl) await visit(org, h);
const sl = await (async () => { await org.page.goto(B + "/dashboard/support"); return org.page.$$eval('a[href^="/dashboard/support/"]', (as) => as.map((a) => a.getAttribute("href")).filter((h) => !h.endsWith("new"))); })();
for (const h of sl) await visit(org, h);
const ad = await session("admin@wafda.test", mobile);
for (const p of ["/admin", "/admin/users", "/admin/events", "/admin/templates", "/admin/designs", "/admin/support", "/admin/settings", "/admin/payments", "/admin/messages", "/admin/audit"]) await visit(ad, p, "m" + p.replaceAll("/", "-"));
await ad.page.goto(B + "/admin/designs"); for (const h of await ad.page.$$eval('a[href^="/admin/designs/"]', (as) => as.map((a) => a.getAttribute("href")))) await visit(ad, h, "m-admin-design");
await ad.page.goto(B + "/admin/support"); for (const h of await ad.page.$$eval('a[href^="/admin/support/"]', (as) => as.map((a) => a.getAttribute("href")))) await visit(ad, h);
const st = await session("staff@wafda.test", mobile);
await visit(st, "/checkin", "m-staff-checkin");
await visit(st, `/checkin/${ids[ids.length - 1]}`);
await visit(st, "/dashboard");
const desk = await session("organizer@wafda.test", { width: 1280, height: 900 });
await visit(desk, "/dashboard", "d-dashboard");
await visit(desk, `/dashboard/events/${ids[ids.length-1]}`, "d-overview");
await visit(desk, `/dashboard/events/${ids[ids.length-1]}/guests`, "d-guests");
await visit(desk, `/dashboard/events/${ids[ids.length-1]}/template`, "d-template");
await browser.close();
