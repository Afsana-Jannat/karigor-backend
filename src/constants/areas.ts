// STARTER LIST: the team must complete this (about 40 Dhaka areas) with
// correct Bangla names and aliases. Slugs must never change once data is saved.
export const AREAS = [
  { slug: 'mirpur', en: 'Mirpur', bn: 'মিরপুর', aliases: ['মিরপুর ১০', 'mirpur 10'] },
  { slug: 'mohammadpur', en: 'Mohammadpur', bn: 'মোহাম্মদপুর', aliases: [] },
  { slug: 'agargaon', en: 'Agargaon', bn: 'আগারগাঁও', aliases: [] },
  { slug: 'savar', en: 'Savar', bn: 'সাভার', aliases: [] },
  { slug: 'uttara', en: 'Uttara', bn: 'উত্তরা', aliases: [] },
  { slug: 'dhanmondi', en: 'Dhanmondi', bn: 'ধানমন্ডি', aliases: [] },
] as const;

export type AreaSlug = (typeof AREAS)[number]['slug'];