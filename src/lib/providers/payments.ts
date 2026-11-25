import { hmacSha256, safeEqualHex } from "../util";

export interface PaymentWebhookEvent {
  id: string; // معرّف فريد للإشعار من المزوّد
  type: "payment.succeeded" | "payment.failed";
  paymentId: string;
  amount: number; // هللة
  currency: string;
  providerRef?: string;
}

/** واجهة الربط مع مزوّد الدفع. منطق المنتج لا يعرف إلا هذه الواجهة. */
export interface PaymentProvider {
  name: string;
  mode: "mock" | "live";
  checkoutUrl(paymentId: string): string;
  /** يتحقق من التوقيع ويعيد الإشعار، أو null إن كان التوقيع غير صالح. */
  verifyWebhook(rawBody: string, headers: Headers): PaymentWebhookEvent | null;
}

export const SIGNATURE_HEADER = "x-wafda-signature";

export function webhookSecret(): string {
  const s = process.env.PAYMENT_WEBHOOK_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
    throw new Error("PAYMENT_WEBHOOK_SECRET غير مضبوط (16 حرفًا على الأقل)");
  }
  return "dev-only-webhook-secret-change-me";
}

export function signPayload(rawBody: string, secret = webhookSecret()) {
  return hmacSha256(secret, rawBody);
}

/** مزوّد تجريبي: صفحة دفع محلية ترسل إشعارًا موقّعًا بـ HMAC-SHA256 إلى نفس مسار المعالجة الفعلي. */
class MockPaymentProvider implements PaymentProvider {
  name = "دفع تجريبي";
  mode = "mock" as const;
  checkoutUrl(paymentId: string) {
    return `/dev/checkout/${paymentId}`;
  }
  verifyWebhook(rawBody: string, headers: Headers): PaymentWebhookEvent | null {
    const sig = headers.get(SIGNATURE_HEADER) || "";
    if (!/^[0-9a-f]{64}$/.test(sig)) return null;
    if (!safeEqualHex(sig, signPayload(rawBody))) return null;
    try {
      const e = JSON.parse(rawBody);
      if (typeof e.id !== "string" || typeof e.paymentId !== "string" || !Number.isInteger(e.amount) || typeof e.currency !== "string") return null;
      if (e.type !== "payment.succeeded" && e.type !== "payment.failed") return null;
      return e as PaymentWebhookEvent;
    } catch {
      return null;
    }
  }
}

let provider: PaymentProvider = new MockPaymentProvider();
export const getPaymentProvider = () => provider;
export const setPaymentProvider = (p: PaymentProvider) => {
  provider = p;
};
