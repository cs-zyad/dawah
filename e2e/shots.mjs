import { chromium } from "@playwright/test";
const [,, OUT, ...paths] = process.argv;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 })).newPage();
for (const [i, path] of paths.entries()) { await p.goto("http://localhost:3000" + path, { waitUntil: "networkidle" }); await p.screenshot({ path: `${OUT}/g${i}.png`, fullPage: true }); }
await b.close();
