/**
 * Targeted search aliases for courses whose catalog titles don't match natural
 * student queries (e.g. "LAB FOR PHY 302K/303K/317K" → "engineering physics lab").
 *
 * Structure: courseId → array of lowercase alias phrases.
 * These are folded into the CommandPalette match alongside code + title so a
 * query hitting any alias surfaces the course. Case-insensitive substring
 * match — same style as the rest of the search.
 *
 * Keep this list small and targeted (5 courses). A general synonym engine
 * would be over-built for the problem.
 */
export const COURSE_ALIASES: Record<string, string[]> = {
  'PHY 105M': [
    'engineering physics i lab',
    'engineering physics 1 lab',
    'engineering physics lab',
    'eng phys 1 lab',
    'physics 1 lab',
    'physics lab',
    'ep1 lab',
  ],
  'PHY 105N': [
    'engineering physics ii lab',
    'engineering physics 2 lab',
    'engineering physics lab',
    'eng phys 2 lab',
    'physics 2 lab',
    'physics lab',
    'ep2 lab',
  ],
  'PHY 303K': [
    'engineering physics i',
    'engineering physics 1',
    'eng phys 1',
  ],
  'PHY 303L': [
    'engineering physics ii',
    'engineering physics 2',
    'eng phys 2',
  ],
  'PHY 303E': [
    'engineering physics iii',
    'electromagnetism quantum semiconductor',
  ],
};

/**
 * Returns true if the query matches any alias for the given course ID.
 * Match is case-insensitive substring (same style as code/title matching).
 */
export function matchesAlias(courseId: string, query: string): boolean {
  const aliases = COURSE_ALIASES[courseId];
  if (!aliases) return false;
  return aliases.some((alias) => alias.includes(query));
}
