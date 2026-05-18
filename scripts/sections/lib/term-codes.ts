/**
 * UT semester-code conventions:
 *   <YYYY><season-digit>
 *     spring → 2
 *     summer → 6
 *     fall   → 9
 *
 * Examples:
 *   fall-2026   → 20269
 *   spring-2027 → 20272
 *   summer-2027 → 20276
 */

export type Season = 'spring' | 'summer' | 'fall';

const SEASON_DIGIT: Record<Season, string> = {
  spring: '2',
  summer: '6',
  fall: '9',
};

const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
};

export interface ParsedTerm {
  /** kebab-case slug, e.g. "fall-2026" */
  slug: string;
  /** Human-friendly label, e.g. "Fall 2026" */
  label: string;
  /** UT registrar semester code, e.g. "20269" */
  code: string;
  /** Numeric calendar year */
  year: number;
  /** "spring" | "summer" | "fall" */
  season: Season;
}

/**
 * Parse a kebab-case term slug into its constituent parts and UT semester
 * code. Throws on malformed input — the CLI relies on this to fail fast
 * before doing any I/O.
 */
export function parseTermSlug(raw: string): ParsedTerm {
  const slug = raw.trim().toLowerCase();
  const match = /^(spring|summer|fall)-(\d{4})$/.exec(slug);
  if (!match) {
    throw new Error(
      `Invalid term slug "${raw}". Expected "<season>-<year>" where season is spring|summer|fall ` +
        `and year is a 4-digit calendar year (e.g. "fall-2026").`
    );
  }

  const season = match[1] as Season;
  const year = Number(match[2]);
  const code = `${year}${SEASON_DIGIT[season]}`;
  const label = `${SEASON_LABEL[season]} ${year}`;

  return { slug, label, code, year, season };
}
