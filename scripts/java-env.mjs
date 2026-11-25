// يبحث عن Java 11+ (مطلوب لمحاكي Firestore) ويضيفه للمسار.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export function javaEnv() {
  const env = { ...process.env };
  const candidates = [
    env.JAVA_HOME && path.join(env.JAVA_HOME, "bin"),
    "/opt/homebrew/opt/openjdk@21/bin",
    "/opt/homebrew/opt/openjdk@17/bin",
    "/opt/homebrew/opt/openjdk/bin",
    "/usr/local/opt/openjdk@21/bin",
    "/usr/local/opt/openjdk/bin",
  ].filter(Boolean);
  const works = () => {
    try {
      execSync("java -version", { stdio: "ignore", env });
      return true;
    } catch {
      return false;
    }
  };
  if (!works()) {
    const dir = candidates.find((d) => existsSync(path.join(d, "java")));
    if (dir) env.PATH = `${dir}${path.delimiter}${env.PATH}`;
  }
  if (!works()) {
    console.error("\n✖ محاكي Firestore يحتاج Java 11 أو أحدث.\n  ثبّته: brew install openjdk@21  (ماك)  أو  sudo apt install openjdk-21-jre (لينكس)\n");
    process.exit(1);
  }
  return env;
}
