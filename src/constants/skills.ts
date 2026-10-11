// STARTER LIST: the team must complete this (about 20 skills) with correct
// Bangla names and aliases. Slugs must never change once data is saved.
export const SKILLS = [
  {
    slug: 'ac_repair',
    en: 'AC Repair',
    bn: 'এসি মেরামত',
    aliases: ['এসি ঠিক করা', 'এয়ার কন্ডিশনার', 'ac servicing'],
  },
  {
    slug: 'house_wiring',
    en: 'House Wiring',
    bn: 'হাউজ ওয়্যারিং',
    aliases: ['ওয়্যারিং', 'বিদ্যুৎ লাইন'],
  },
  {
    slug: 'db_box',
    en: 'DB Box',
    bn: 'ডিবি বক্স',
    aliases: ['ডিবি', 'distribution box'],
  },
  {
    slug: 'plumbing',
    en: 'Plumbing',
    bn: 'প্লাম্বিং',
    aliases: ['পাইপ', 'ট্যাপ', 'পানির লাইন'],
  },
] as const;

export type SkillSlug = (typeof SKILLS)[number]['slug'];