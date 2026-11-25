// يشغّل الاختبارات على محاكي Firestore الرسمي (لا يمس قاعدة حقيقية).
import { spawnSync } from "node:child_process";
import { javaEnv } from "./java-env.mjs";

const env = javaEnv();
delete env.FIREBASE_SERVICE_ACCOUNT;
const args = process.argv.slice(2).join(" ");
const r = spawnSync(
  "npx",
  ["firebase", "emulators:exec", "--only", "firestore", "--project", "demo-wafda", `npx vitest run ${args}`],
  { stdio: "inherit", env },
);
process.exit(r.status ?? 1);
