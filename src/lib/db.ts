import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export class ConfigError extends Error {}

type G = typeof globalThis & { __wafdaDb?: Firestore };

/**
 * يقرأ بيانات حساب الخدمة من FIREBASE_SERVICE_ACCOUNT (JSON مباشر أو base64)،
 * أو يتصل بالمحاكي إن وُجد FIRESTORE_EMULATOR_HOST.
 */
export function parseServiceAccount(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  const text = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
  const sa = JSON.parse(text);
  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new ConfigError("ملف حساب الخدمة ناقص: يجب أن يحتوي project_id وclient_email وprivate_key.");
  }
  return sa;
}

export function firebaseConfigStatus(): { ok: boolean; mode: "emulator" | "service_account" | "missing"; message: string } {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return { ok: true, mode: "emulator", message: `محاكي Firestore على ${process.env.FIRESTORE_EMULATOR_HOST}` };
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    return {
      ok: false,
      mode: "missing",
      message:
        "لم يُضبط Firebase: أضف المتغير FIREBASE_SERVICE_ACCOUNT بمحتوى ملف حساب الخدمة (JSON أو base64)، أو شغّل المحاكي محليًا عبر npm run dev:local.",
    };
  }
  try {
    parseServiceAccount(raw);
    return { ok: true, mode: "service_account", message: "حساب خدمة Firebase مضبوط" };
  } catch (e) {
    return { ok: false, mode: "missing", message: `قيمة FIREBASE_SERVICE_ACCOUNT غير صالحة: ${(e as Error).message}` };
  }
}

export function db(): Firestore {
  const g = globalThis as G;
  if (g.__wafdaDb) return g.__wafdaDb;
  let app: App;
  const existing = getApps().find((a) => a.name === "wafda");
  if (existing) {
    app = existing;
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    // المحاكي لا يحتاج بيانات اعتماد؛ نمنع البحث عن خادم بيانات Google Cloud
    process.env.METADATA_SERVER_DETECTION ??= "none";
    app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-wafda" }, "wafda");
  } else {
    const status = firebaseConfigStatus();
    if (!status.ok) throw new ConfigError(status.message);
    const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT!);
    app = initializeApp(
      {
        credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
        projectId: sa.project_id,
      },
      "wafda",
    );
  }
  const firestore = getFirestore(app);
  firestore.settings({ ignoreUndefinedProperties: true });
  g.__wafdaDb = firestore;
  return firestore;
}

/** أسماء المجموعات في مكان واحد */
export const C = {
  users: "users",
  sessions: "sessions",
  uniques: "uniques",
  events: "events",
  invitations: "invitations",
  registrations: "registrations",
  tickets: "tickets",
  eventStaff: "eventStaff",
  setupTokens: "setupTokens",
  messages: "messages",
  batches: "batches",
  ledger: "ledger",
  payments: "payments",
  webhookEvents: "webhookEvents",
  reminders: "reminders",
  templates: "templates",
  designRequests: "designRequests",
  designMessages: "designMessages",
  supportTickets: "supportTickets",
  supportReplies: "supportReplies",
  audit: "auditLog",
  rateLimits: "rateLimits",
  settings: "settings",
  devInbox: "devInbox",
  meta: "meta",
} as const;

/**
 * معاملة Firestore بعدد محاولات أعلى من الافتراضي (5) لتحمّل التزاحم على وثيقة الفعالية
 * عند التسجيلات المتزامنة. تذكير: كل القراءات يجب أن تسبق كل الكتابات داخل المعاملة.
 */
export function runTx<T>(fn: (tx: FirebaseFirestore.Transaction) => Promise<T>): Promise<T> {
  return db().runTransaction(fn, { maxAttempts: 40 });
}
