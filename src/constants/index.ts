import { AREAS, type AreaSlug } from './areas.js';
import { SKILLS, type SkillSlug } from './skills.js';

export { AREAS, SKILLS };
export type { AreaSlug, SkillSlug };

export const SKILL_SLUGS: readonly string[] = SKILLS.map((s) => s.slug);
export const AREA_SLUGS: readonly string[] = AREAS.map((a) => a.slug);

export const isSkillSlug = (value: string): value is SkillSlug => SKILL_SLUGS.includes(value);
export const isAreaSlug = (value: string): value is AreaSlug => AREA_SLUGS.includes(value);

// The five onboarding questions the backend accepts (see endpoint 12).
export const ONBOARDING_KEYS = ['age', 'skills', 'experience', 'areas', 'charge'] as const;
export type OnboardingKey = (typeof ONBOARDING_KEYS)[number];