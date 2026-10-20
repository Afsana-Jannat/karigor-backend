const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

type Option = {
  slug: string;
  en: string;
  bn: string;
  aliases: readonly string[];
};

// Lowercase, Bangla digits to 0-9, punctuation removed, spaces collapsed.
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))
    .replace(/[^\p{L}\p{M}\p{N}\s\u200c\u200d]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// function extractNumbers(text: string): number[] {
//   return (normalizeText(text).match(/\d+/g) ?? []).map(Number);
// }

export function parseAge(text: string): number | null {
  const n = extractNumbers(text)[0];
  return n !== undefined && n >= 16 && n <= 80 ? n : null;
}

export function parseExperience(text: string): number | null {
  const n = extractNumbers(text)[0];
  return n !== undefined && n >= 0 && n <= 60 ? n : null;
}

// One number means min = max. Two numbers mean a range (order does not matter).
export function parseRange(text: string): { rateMin: number; rateMax: number } | null {
  const nums = extractNumbers(text);
  const a = nums[0];
  if (a === undefined) return null;
  const b = nums[1] ?? a;
  const rateMin = Math.min(a, b);
  const rateMax = Math.max(a, b);
  return rateMax <= 1000000 ? { rateMin, rateMax } : null;
}

// function findSlug(term: string, list: readonly Option[]): string | null {
//   const entries = list.map((item) => ({
//     slug: item.slug,
//     names: [item.en, item.bn, ...item.aliases].map(normalizeText).filter(Boolean),
//   }));

//   // 1. exact match on a name or alias
//   for (const e of entries) {
//     if (e.names.includes(term)) return e.slug;
//   }
//   // 2. the typed text contains a known name ("আমি ইলেকট্রিশিয়ানের কাজ করি")
//   for (const e of entries) {
//     if (e.names.some((n) => n.length >= 3 && term.includes(n))) return e.slug;
//   }
//   return null;
// }

// Splits on commas, "and", "ও" and the Bangla full stop, then matches each part.

function findSlug(term: string, list: readonly Option[]): string[] {
  const entries = list.map((item) => ({
    slug: item.slug,
    names: [item.en, item.bn, ...item.aliases].map(normalizeText).filter(Boolean),
  }));

  // 1. exact match on a name or alias
  const exact = entries.find((e) => e.names.includes(term));
  if (exact) return [exact.slug];

  // 2. the text contains one or more known names
  return entries
    .filter((e) => e.names.some((n) => n.length >= 3 && term.includes(n)))
    .map((e) => e.slug);
}



// Splits on commas, "and", "ও", "আর", "এবং" and the Bangla full stop, then matches each part.
export function matchSlugs(text: string, list: readonly Option[]) {
  const parts = text
    .split(/[,;।\n]|\s+and\s+|\s+(?:ও|আর|এবং)\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const slugs = new Set<string>();
  const unmatched: string[] = [];

  for (const part of parts) {
    const term = normalizeText(part);
    if (!term) continue;
    const found = findSlug(term, list);
    if (found.length > 0) {
      for (const slug of found) slugs.add(slug);
    } else {
      unmatched.push(part);
    }
  }

  return { slugs: [...slugs], unmatched };
}

// Returns the single best slug: the one whose longest name appears in the text.
export function findBestSlug(text: string, list: readonly Option[]): string | null {
  const term = normalizeText(text);
  if (!term) return null;

  let best: { slug: string; length: number } | null = null;
  for (const item of list) {
    for (const raw of [item.en, item.bn, ...item.aliases]) {
      const name = normalizeText(raw);
      if (name.length < 3) continue;
      if (term.includes(name) && (!best || name.length > best.length)) {
        best = { slug: item.slug, length: name.length };
      }
    }
  }
  return best?.slug ?? null;
}

function extractNumbers(text: string): number[] {
  const asciiDigits = text.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)));
  // "1,500" and "১,৫০০" are one number: drop thousands separators.
  const joined = asciiDigits.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  return (normalizeText(joined).match(/\d+/g) ?? []).map(Number);
}