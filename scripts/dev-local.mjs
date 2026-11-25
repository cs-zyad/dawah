// التطوير المحلي بلا حساب Firebase: يشغّل محاكي Firestore الرسمي مع حفظ البيانات بين التشغيلات،
// ثم يعبّئ البيانات التجريبية مرة واحدة، ثم يشغّل خادم Next.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { javaEnv } from "./java-env.mjs";

const env = javaEnv();
delete env.FIREBASE_SERVICE_ACCOUNT;
env.DEMO_MODE ??= "true";
env.GCLOUD_PROJECT = "demo-wafda";
const port = env.PORT || "3000";
env.APP_URL ??= `http://localhost:${port}`;
mkdirSync(".emulator-data", { recursive: true });
const inner = `node scripts/seed.mjs --if-empty && npx next dev -p ${port}${process.argv.includes("--lan") ? " -H 0.0.0.0" : ""}`;
const child = spawn(
  "npx",
  ["firebase", "emulators:exec", "--only", "firestore", "--project", "demo-wafda", "--import", ".emulator-data", "--export-on-exit", ".emulator-data", inner],
  { stdio: "inherit", env },
);
const stop = () => child.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (c) => process.exit(c ?? 0));
