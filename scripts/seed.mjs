// يشغّل سكربت البيانات التجريبية (TypeScript) عبر tsx.
import { spawnSync } from "node:child_process";
const r = spawnSync("npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/seed.ts", ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
