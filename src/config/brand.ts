// كل ما يخص اسم المنصة وهويتها في مكان واحد. غيّر الاسم من هنا فقط.
export const brand = {
  nameAr: "وفدة",
  nameEn: "WAFDA",
  fullName: "وفدة | WAFDA",
  tagline: "دعوة واضحة. حضور منظّم.",
  supportEmail: "support@wafda.test",
  colors: {
    plum: "#28182C",
    lime: "#DDF480",
    ivory: "#FBF7EF",
    lilac: "#E8DEED",
    muted: "#65586B",
  },
} as const;

export type Brand = typeof brand;
