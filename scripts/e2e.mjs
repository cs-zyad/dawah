// اختبار الرحلة كاملة في متصفح حقيقي (Playwright) على بناء إنتاجي + محاكي Firestore مستقل.
import { spawnSync } from "node:child_process";
import { javaEnv } from "./java-env.mjs";

const env = javaEnv();
delete env.FIREBASE_SERVICE_ACCOUNT;
const r = spawnSync(
  "npx",
  ["firebase", "emulators:exec", "--config", "firebase.e2e.json", "--only", "firestore", "--project", "demo-wafda-e2e", `node scripts/e2e-inner.mjs ${process.argv.slice(2).join(" ")}`],
  { stdio: "inherit", env },
);
process.exit(r.status ?? 1);
