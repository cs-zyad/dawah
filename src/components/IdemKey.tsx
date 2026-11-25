import { randomToken } from "@/lib/util";

/** مفتاح منع التكرار: يُولّد في الخادم لكل عرض للنموذج، ويتجدد بعد كل إجراء ناجح (لأن الصفحة يُعاد عرضها). */
export function IdemKey({ name = "idemKey" }: { name?: string }) {
  return <input type="hidden" name={name} value={randomToken(18)} />;
}
