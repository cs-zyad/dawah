import { db, C } from "../db";
import type { Settings } from "../types";
import { audit } from "./audit";

/** قيم تجريبية مقترحة — ليست أسعارًا نهائية (مُعلّمة demo: true). */
export const DEFAULT_SETTINGS: Settings = {
  pricing: {
    demo: true,
    packages: [
      { places: 50, price: 9900 },
      { places: 100, price: 17900 },
      { places: 250, price: 39900 },
      { places: 500, price: 69900 },
      { places: 1000, price: 119900 },
    ],
    extraPlacePrice: 200,
    messagePrice: { whatsapp: 25, email: 5 },
    confirmationOpCost: { whatsapp: 25, email: 5 },
  },
  policies: {
    insufficientCredit: "block",
    maxAttempts: 3,
    retryBaseSeconds: 60,
    waitlistOfferHours: 48,
    ticketResendMinMinutes: 10,
    staffInviteDays: 7,
  },
  updatedAt: 0,
};

export async function getSettings(): Promise<Settings> {
  const snap = await db().collection(C.settings).doc("global").get();
  const d = (snap.data() || {}) as Partial<Settings>;
  return {
    pricing: { ...DEFAULT_SETTINGS.pricing, ...(d.pricing || {}) },
    policies: { ...DEFAULT_SETTINGS.policies, ...(d.policies || {}) },
    updatedAt: d.updatedAt || 0,
  };
}

export async function updateSettings(actorId: string, patch: { pricing?: Partial<Settings["pricing"]>; policies?: Partial<Settings["policies"]> }) {
  const current = await getSettings();
  const next: Settings = {
    pricing: { ...current.pricing, ...(patch.pricing || {}) },
    policies: { ...current.policies, ...(patch.policies || {}) },
    updatedAt: Date.now(),
  };
  await db().collection(C.settings).doc("global").set(next);
  await audit(actorId, "settings.update", "settings/global", { before: current, after: next });
  return next;
}

/** حساب سعر الباقة: أصغر باقة تغطي العدد، وإن تجاوز أكبر باقة تُضاف أماكن بسعر المكان الإضافي. */
export function quotePackage(placesNeeded: number, s: Settings) {
  const pk = [...s.pricing.packages].sort((a, b) => a.places - b.places);
  const needed = Math.max(1, Math.ceil(placesNeeded));
  const fit = pk.find((p) => p.places >= needed);
  if (fit) return { places: fit.places, price: fit.price, packagePlaces: fit.places, extraPlaces: 0, label: `باقة ${fit.places} مكان` };
  const largest = pk[pk.length - 1];
  const extra = needed - largest.places;
  return {
    places: needed,
    price: largest.price + extra * s.pricing.extraPlacePrice,
    packagePlaces: largest.places,
    extraPlaces: extra,
    label: `باقة ${largest.places} مكان + ${extra} مكان إضافي`,
  };
}
