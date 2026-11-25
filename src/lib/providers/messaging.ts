import { db, C } from "../db";
import type { Channel, MessageDoc } from "../types";

export interface SendResult {
  ok: boolean;
  permanent?: boolean; // فشل نهائي لا يُعاد
  error?: string;
  providerId?: string;
}

/** واجهة الربط مع أي مزوّد رسائل. منطق المنتج لا يعرف إلا هذه الواجهة. */
export interface MessageProvider {
  channel: Channel;
  name: string;
  mode: "mock" | "live";
  send(m: MessageDoc): Promise<SendResult>;
}

/**
 * مزوّد تجريبي: يضع الرسائل في صندوق الرسائل التجريبي (/dev/inbox).
 * محاكاة الحالات:
 *  - رقم ينتهي بـ 0000 أو بريد يحتوي fail  => فشل نهائي
 *  - رقم ينتهي بـ 1111 أو بريد يحتوي flaky => فشل مؤقت في المحاولة الأولى ثم نجاح
 */
export function simulateOutcome(channel: Channel, to: string, priorAttempts: number): SendResult | null {
  const permanent = channel === "whatsapp" ? to.endsWith("0000") : to.includes("fail");
  const flaky = channel === "whatsapp" ? to.endsWith("1111") : to.includes("flaky");
  if (permanent) return { ok: false, permanent: true, error: "رقم/بريد غير صالح لدى المزوّد (محاكاة فشل نهائي)" };
  if (flaky && priorAttempts === 0) return { ok: false, permanent: false, error: "انقطاع مؤقت لدى المزوّد (محاكاة)" };
  return null;
}

class MockProvider implements MessageProvider {
  mode = "mock" as const;
  constructor(
    public channel: Channel,
    public name: string,
  ) {}
  async send(m: MessageDoc): Promise<SendResult> {
    const sim = simulateOutcome(this.channel, m.to, m.attempts);
    if (sim) return sim;
    const ref = db().collection(C.devInbox).doc(m.id);
    await ref.set({
      id: m.id,
      channel: m.channel,
      to: m.to,
      subject: m.subject,
      body: m.body,
      kind: m.kind,
      template: m.template,
      eventId: m.eventId,
      createdAt: Date.now(),
    });
    return { ok: true, providerId: `mock_${m.id}` };
  }
}

const providers: Record<Channel, MessageProvider> = {
  whatsapp: new MockProvider("whatsapp", "واتساب (تجريبي)"),
  email: new MockProvider("email", "البريد (تجريبي)"),
};

export function getMessageProvider(channel: Channel): MessageProvider {
  return providers[channel];
}

/** للاختبارات أو عند ربط مزوّد فعلي */
export function setMessageProvider(p: MessageProvider) {
  providers[p.channel] = p;
}

export function messagingProviderStatus() {
  return (Object.keys(providers) as Channel[]).map((c) => ({ channel: c, name: providers[c].name, mode: providers[c].mode }));
}
