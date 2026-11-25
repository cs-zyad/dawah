import { spawn, spawnSync } from "node:child_process";

const PORT = "3100";
const env = {
  ...process.env,
  GCLOUD_PROJECT: "demo-wafda-e2e",
  NEXT_DIST_DIR: ".next-e2e",
  DEMO_MODE: "true",
  APP_URL: `http://localhost:${PORT}`,
  PAYMENT_WEBHOOK_SECRET: "e2e-webhook-secret-123456",
  E2E_BASE_URL: `http://localhost:${PORT}`,
};
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (!process.argv.includes("--no-build")) run("npx", ["next", "build"]);
run("node", ["scripts/seed.mjs"]);
const server = spawn("npx", ["next", "start", "-p", PORT], { stdio: ["ignore", "inherit", "inherit"], env });
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`http://localhost:${PORT}/login`);
    if (res.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}
const t = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2).filter((a) => a !== "--no-build")], { stdio: "inherit", env });
server.kill("SIGTERM");
process.exit(t.status ?? 1);
