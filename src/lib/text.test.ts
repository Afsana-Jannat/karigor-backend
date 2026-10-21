import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AREAS, SKILLS } from '../constants/index.js';
import {
  findBestSlug,
  matchSlugs,
  normalizeText,
  parseAge,
  parseExperience,
  parseRange,
} from './text.js';

// These tests use the real SKILLS and AREAS lists on purpose. If someone edits an
// alias and a test fails, that change affects voice matching and should be checked.

describe('normalizeText', () => {
  it('turns Bangla digits into 0-9', () => {
    assert.equal(normalizeText('০১২৩৪৫৬৭৮৯'), '0123456789');
  });

  it('lowercases, strips punctuation and collapses spaces', () => {
    assert.equal(normalizeText('  Hello,   WORLD!  '), 'hello world');
  });

  it('keeps Bangla letters and removes the full stop', () => {
    assert.equal(normalizeText('আমার বয়স ৩৫।'), 'আমার বয়স 35');
  });
});

describe('parseAge', () => {
  it('reads Bangla and English digits', () => {
    assert.equal(parseAge('আমার বয়স ৩৫'), 35);
    assert.equal(parseAge('I am 42 years old'), 42);
  });

  it('accepts the limits 16 and 80', () => {
    assert.equal(parseAge('16'), 16);
    assert.equal(parseAge('80'), 80);
  });

  it('rejects ages out of range', () => {
    assert.equal(parseAge('১৫'), null);
    assert.equal(parseAge('১০০'), null);
  });

  it('returns null when there is no digit', () => {
    assert.equal(parseAge('পঁয়ত্রিশ'), null);
  });
});

describe('parseExperience', () => {
  it('reads years', () => {
    assert.equal(parseExperience('৮ বছর'), 8);
    assert.equal(parseExperience('about 5 years'), 5);
  });

  it('accepts 0 and rejects more than 60', () => {
    assert.equal(parseExperience('0'), 0);
    assert.equal(parseExperience('61'), null);
  });

  it('returns null when there is no digit', () => {
    assert.equal(parseExperience('আট বছর'), null);
  });
});

describe('parseRange', () => {
  it('reads a range', () => {
    assert.deepEqual(parseRange('৫০০ থেকে ১৫০০'), { rateMin: 500, rateMax: 1500 });
  });

  it('puts the smaller number first', () => {
    assert.deepEqual(parseRange('1500 to 500'), { rateMin: 500, rateMax: 1500 });
  });

  it('uses one number for both ends', () => {
    assert.deepEqual(parseRange('৮০০'), { rateMin: 800, rateMax: 800 });
  });

  it('treats a comma before three digits as a thousands separator', () => {
    assert.deepEqual(parseRange('1,500'), { rateMin: 1500, rateMax: 1500 });
    assert.deepEqual(parseRange('৫,০০০ থেকে ১৫,০০০'), { rateMin: 5000, rateMax: 15000 });
  });

  it('keeps two numbers separated by a plain comma apart', () => {
    assert.deepEqual(parseRange('500,1500'), { rateMin: 500, rateMax: 1500 });
  });

  it('returns null with no number or above 1,000,000', () => {
    assert.equal(parseRange('কোনো সংখ্যা নেই'), null);
    assert.equal(parseRange('2000000'), null);
  });
});

describe('matchSlugs', () => {
  it('splits on ও and matches skills by name or alias', () => {
    const result = matchSlugs('ইলেকট্রিশিয়ান ও প্লাম্বার', SKILLS);
    assert.deepEqual(result.slugs, ['electrician', 'plumber']);
    assert.deepEqual(result.unmatched, []);
  });

  it('splits on আর, the everyday Bangla and', () => {
    const result = matchSlugs('ইলেকট্রিশিয়ান আর প্লাম্বার', SKILLS);
    assert.deepEqual(result.slugs, ['electrician', 'plumber']);
  });

  it('splits on the English and', () => {
    const result = matchSlugs('electrician and plumber', SKILLS);
    assert.deepEqual(result.slugs, ['electrician', 'plumber']);
  });

  it('matches areas and reports unknown words', () => {
    const result = matchSlugs('মিরপুর, ধানমন্ডি, xyz', AREAS);
    assert.deepEqual(result.slugs, ['mirpur', 'dhanmondi']);
    assert.deepEqual(result.unmatched, ['xyz']);
  });

  it('removes duplicates', () => {
    const result = matchSlugs('electrician, ইলেকট্রিশিয়ান', SKILLS);
    assert.deepEqual(result.slugs, ['electrician']);
  });

  it('finds a skill inside a sentence', () => {
    const result = matchSlugs('আমি ইলেকট্রিশিয়ানের কাজ করি', SKILLS);
    assert.ok(result.slugs.includes('electrician'));
  });

  it('returns nothing for empty text', () => {
    assert.deepEqual(matchSlugs('', SKILLS), { slugs: [], unmatched: [] });
  });
});

describe('findBestSlug', () => {
  it('finds the skill and the area in a Bangla sentence', () => {
    const text = 'জরুরি এসি মিস্ত্রি মিরপুর';
    assert.equal(findBestSlug(text, SKILLS), 'ac_repairer');
    assert.equal(findBestSlug(text, AREAS), 'mirpur');
  });

  it('finds the skill and the area in an English sentence', () => {
    const text = 'I need an electrician in dhanmondi';
    assert.equal(findBestSlug(text, SKILLS), 'electrician');
    assert.equal(findBestSlug(text, AREAS), 'dhanmondi');
  });

  it('returns null for an area that is not in the list', () => {
    const text = 'সাভারে প্লাম্বার লাগবে';
    assert.equal(findBestSlug(text, SKILLS), 'plumber');
    assert.equal(findBestSlug(text, AREAS), null);
  });

  it('returns null for text with nothing to match', () => {
    assert.equal(findBestSlug('hello', SKILLS), null);
    assert.equal(findBestSlug('', AREAS), null);
  });
});