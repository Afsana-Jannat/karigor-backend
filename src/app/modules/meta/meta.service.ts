import { AREAS, SKILLS } from '../../../constants/index.js';

// The lists never change while the server runs, so build them once at startup.
// Aliases are internal matching data, so they are not sent to the frontend.
const options = {
  skills: SKILLS.map(({ slug, en, bn }) => ({ slug, en, bn })),
  areas: AREAS.map(({ slug, en, bn }) => ({ slug, en, bn })),
};

export function getOptions() {
  return options;
}