import { AREAS, SKILLS } from "../../constants";



type SlugOption = {
  slug: string;
  aliases?: readonly string[];
  name?: string;
  nameBn?: string;
  bn?: string;
};

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function resolveSlug(
  value: string,
  options: readonly SlugOption[],
): string | null {
  const normalizedValue = normalizeText(value);

  const match = options.find((option) => {
    const candidates = [
      option.slug,
      option.name,
      option.nameBn,
      option.bn,
      ...(option.aliases ?? []),
    ];

    return candidates.some(
      (candidate) =>
        candidate !== undefined &&
        normalizeText(candidate) === normalizedValue,
    );
  });

  return match?.slug ?? null;
}

export function normalizeAreaSlug(value: string): string | null {
  return resolveSlug(value, AREAS);
}

export function normalizeSkillSlug(value: string): string | null {
  return resolveSlug(value, SKILLS);
}
