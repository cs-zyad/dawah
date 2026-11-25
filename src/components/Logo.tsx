import { brand } from "@/config/brand";

/** الشعار: زاويتا إطار المسح + علامة التأكيد */
export function LogoMark({ size = 32, color = brand.colors.plum, accent = brand.colors.lime }: { size?: number; color?: string; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="12" fill={color} />
      <path d="M11 20V13a2 2 0 0 1 2-2h7" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
      <path d="M37 28v7a2 2 0 0 1-2 2h-7" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
      <path d="M16.5 24.5l5 5 10-11" fill="none" stroke="#FBF7EF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ size = 32, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="logo" style={{ color: light ? brand.colors.ivory : brand.colors.plum }}>
      <LogoMark size={size} color={light ? brand.colors.lime : brand.colors.plum} accent={light ? brand.colors.plum : brand.colors.lime} />
      <span className="logo-text">
        <b>{brand.nameAr}</b>
        <span className="latin" dir="ltr">{brand.nameEn}</span>
      </span>
    </span>
  );
}
