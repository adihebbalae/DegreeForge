/**
 * prereq-cnf.ts  — TASK-057
 *
 * Explicit CNF (Conjunctive Normal Form) prereq groups for courses whose
 * flat edge list in prerequisite-graph.json represents a genuine AND-stack
 * rather than a pure OR-pool.
 *
 * Data model: `all_of` = array of groups; each group has `one_of` = array of
 * course IDs. A course is satisfiable iff EVERY group has at least one member
 * satisfied (after canonicalization / equivalence expansion).
 *
 * Authoring scope (TASK-057):
 *   - ECE core AND-stacks that appear in real plans: 313/313H, 325, 331, 333T,
 *     411/411H, 438, and the intro-computing OR-trio gateways (312/312H, 316,
 *     319H/319K, 460N).
 *   - Everything NOT listed here falls back to the default-OR safety net
 *     (satisfied if any one prereq edge is met), which is correct for the
 *     OR-pool majority of multi-edge courses.
 *
 * Full catalog CNF reparse is deferred to TASK-058.
 */

import type { PrereqCNF } from '../types';

/**
 * Explicit CNF prereq groups for known AND-stack courses.
 *
 * Key = target course ID.
 * Value = array of groups (`all_of`); each group must have at least one member
 * satisfied for the course to be valid.
 *
 * Notes on equivalence: group members use the "representative" course ID from
 * the equivalence group (e.g. "ECE 306" covers ECE 306H and BME 306 via the
 * EQUIVALENCE_MAP). The engine canonicalizes both sides before checking.
 */
export const PREREQ_CNF: PrereqCNF = {
  // ── ECE 313 / 313H — Probability & Statistics ─────────────────────────────
  // Needs: (ECE 302 OR ECE 302H) AND M 427J AND M 340L
  'ECE 313': [
    { one_of: ['ECE 302', 'ECE 302H'] },
    { one_of: ['M 427J'] },
    { one_of: ['M 340L'] },
  ],
  'ECE 313H': [
    { one_of: ['ECE 302', 'ECE 302H'] },
    { one_of: ['M 427J'] },
    { one_of: ['M 340L'] },
  ],

  // ── ECE 411 / 411H — Electromagnetic Engineering ──────────────────────────
  // Needs: (ECE 302 OR ECE 302H) AND M 427J AND PHY 303L
  'ECE 411': [
    { one_of: ['ECE 302', 'ECE 302H'] },
    { one_of: ['M 427J'] },
    { one_of: ['PHY 303L'] },
  ],
  'ECE 411H': [
    { one_of: ['ECE 302', 'ECE 302H'] },
    { one_of: ['M 427J'] },
    { one_of: ['PHY 303L'] },
  ],

  // ── ECE 325 — Electronic Circuits ─────────────────────────────────────────
  // Needs: ECE 411 AND (M 427J OR M 427L) AND PHY 303L
  // PHY 105N and PHY 103N are lab/discussion coreqs for PHY 303L, not separate reqs
  'ECE 325': [
    { one_of: ['ECE 411'] },
    { one_of: ['M 427J', 'M 427L'] },
    { one_of: ['PHY 303L'] },
  ],

  // ── ECE 331 — Engineering Communication ───────────────────────────────────
  // Needs: M 408D AND PHY 303L
  'ECE 331': [
    { one_of: ['M 408D'] },
    { one_of: ['PHY 303L'] },
  ],

  // ── ECE 333T / BME 333T — Technical Communication ─────────────────────────
  // Needs: RHE 306 (rhetoric writing req) AND (ECE 319K OR ECE 319H)
  'ECE 333T': [
    { one_of: ['RHE 306'] },
    { one_of: ['ECE 319K', 'ECE 319H'] },
  ],

  // ── ECE 438 — Senior Design I ──────────────────────────────────────────────
  // Needs: ECE 411 AND (ECE 333T OR BME 333T)
  // BME 311 listed in edges appears to be a cross-list of ECE equivalent circuit course;
  // treated as an equivalent prereq for the circuits requirement satisfied by ECE 411
  'ECE 438': [
    { one_of: ['ECE 411'] },
    { one_of: ['ECE 333T', 'BME 333T'] },
  ],

  // ── ECE 312 / 312H — Software Design and Implementation ───────────────────
  // Needs: (ECE 306 OR ECE 306H OR BME 306 OR ECE 319H OR ECE 319K) — pure OR-pool
  // (Default-OR would handle this correctly, but explicit group avoids confusion)
  'ECE 312': [
    { one_of: ['ECE 306', 'ECE 306H', 'BME 306', 'ECE 319H', 'ECE 319K'] },
  ],
  'ECE 312H': [
    { one_of: ['ECE 306', 'ECE 306H', 'BME 306', 'ECE 319H'] },
  ],

  // ── ECE 319H / 319K — Introduction to Embedded Systems ────────────────────
  // Needs: any one of ECE 306 / ECE 306H / BME 306 — pure OR-pool (same course, 3 labels)
  'ECE 319K': [
    { one_of: ['ECE 306', 'ECE 306H', 'BME 306'] },
  ],
  'ECE 319H': [
    { one_of: ['ECE 306', 'ECE 306H', 'BME 306'] },
  ],

  // ── ECE 316 — Microprocessor Systems Design ────────────────────────────────
  // Needs: any intro-computing background — ECE 306 family OR C S 429
  'ECE 316': [
    { one_of: ['ECE 306', 'ECE 306H', 'BME 306', 'C S 429'] },
  ],

  // ── ECE 460N — Computer Architecture ──────────────────────────────────────
  // Needs: any one of the intro-computing family (ECE 306 / 312 / 319 variants or C S 312)
  'ECE 460N': [
    { one_of: ['C S 312', 'ECE 306', 'ECE 306H', 'ECE 312', 'ECE 312H', 'ECE 319K', 'ECE 319H'] },
  ],
};
