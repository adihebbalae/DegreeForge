import { describe, it, expect } from 'vitest';
import { parseIdaAudit } from './parse-ida';

// Representative IDA fixture — covers all required cases.
const IDA_FIXTURE = `
ELECTRICAL AND COMPUTER ENGINEERING CORE
+ NEEDS: 0.0  EARNED: 33.0

ECE 302  Intro to Electrical Engineering  A  FA 2023  3.0
E E 319K  Intro to Embedded Systems  B+  SP 2024  3.0
PHY 303L  Engineering Physics II  CR  Fall 2024  3.0
>> ECE 460N  Computer Architecture  IP  SP 2026  3.0
REQUIREMENT TOTAL: 33.0

MATHEMATICS
EARNED: 17.0

M 408C  Differential and Integral Calculus  A-  FA 2022  4.0
M 408D  Sequences Series and Multivariable Calc  B  SP 2023  4.0
C S 363M  Introduction to Software Engineering  A  FA 2024  3.0

SECTION: FREE ELECTIVES
COMPLETE

${'X'.repeat(350)}

`;

describe('parseIdaAudit', () => {
  it('parses a completed course with a letter grade', () => {
    const results = parseIdaAudit(IDA_FIXTURE);
    const ece302 = results.find(c => c.courseId === 'ECE 302');
    expect(ece302).toBeDefined();
    expect(ece302?.grade).toBe('A');
    expect(ece302?.creditHours).toBe(3);
    expect(ece302?.semester).toBe('Fall 2023');
  });

  it('normalises E E to ECE', () => {
    const results = parseIdaAudit(IDA_FIXTURE);
    const course = results.find(c => c.courseId === 'ECE 319K');
    expect(course).toBeDefined();
    expect(course?.courseId).toBe('ECE 319K');
    expect(course?.grade).toBe('B+');
    expect(course?.semester).toBe('Spring 2024');
  });

  it('preserves CR grade for credit-only courses', () => {
    const results = parseIdaAudit(IDA_FIXTURE);
    const phy = results.find(c => c.courseId === 'PHY 303L');
    expect(phy).toBeDefined();
    expect(phy?.grade).toBe('CR');
  });

  it('marks in-progress courses with grade IP', () => {
    const results = parseIdaAudit(IDA_FIXTURE);
    const inProg = results.find(c => c.courseId === 'ECE 460N');
    expect(inProg).toBeDefined();
    expect(inProg?.grade).toBe('IP');
    expect(inProg?.semester).toBe('Spring 2026');
  });

  it('normalises FA abbreviation to Fall YYYY', () => {
    const results = parseIdaAudit(IDA_FIXTURE);
    const m408c = results.find(c => c.courseId === 'M 408C');
    expect(m408c).toBeDefined();
    expect(m408c?.semester).toBe('Fall 2022');
  });

  it('normalises SP abbreviation to Spring YYYY', () => {
    const results = parseIdaAudit(IDA_FIXTURE);
    const m408d = results.find(c => c.courseId === 'M 408D');
    expect(m408d).toBeDefined();
    expect(m408d?.semester).toBe('Spring 2023');
  });

  it('parses a multi-word department prefix without dropping the leading token', () => {
    // Launch-critical: old regex matched "S 363M" (dropping the "C"). The dept
    // must be captured whole as "C S".
    const results = parseIdaAudit(IDA_FIXTURE);
    const cs = results.find(c => c.courseId === 'C S 363M');
    expect(cs).toBeDefined();
    expect(cs?.courseId).toBe('C S 363M');
    expect(cs?.grade).toBe('A');
    expect(cs?.semester).toBe('Fall 2024');
    // The leading "C" must NOT have been dropped into a bogus "S 363M" entry.
    expect(results.find(c => c.courseId === 'S 363M')).toBeUndefined();
  });

  it('skips requirement header lines', () => {
    const results = parseIdaAudit(IDA_FIXTURE);
    // Header lines should contribute no ParsedCourse entries.
    // We verify by checking there are exactly the 7 course lines present
    // (ECE 302, ECE 319K, PHY 303L, ECE 460N, M 408C, M 408D, C S 363M).
    expect(results).toHaveLength(7);
  });

  it('skips lines longer than 300 chars', () => {
    const longLine = 'ECE 999 ' + 'X'.repeat(310);
    const results = parseIdaAudit(longLine);
    expect(results).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(parseIdaAudit('')).toHaveLength(0);
  });

  it('does not hang on pathologically long lines (ReDoS guard)', () => {
    const adversarial = 'A'.repeat(50_000) + '\nECE 302 Test A FA 2025 3.0';
    const start = Date.now();
    const results = parseIdaAudit(adversarial);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(results).toHaveLength(1);
    expect(results[0].courseId).toBe('ECE 302');
  });

  // ─── ReDoS hardening: HEADER_RE bounded whitespace ──────────────────────────
  it('returns [] quickly for a line of many spaces (HEADER_RE ReDoS guard)', () => {
    // A line of 280 spaces followed by no keyword — old unbounded \s* could
    // catastrophically backtrack through the long alternation.
    const manySpaces = ' '.repeat(280);
    const start = Date.now();
    const results = parseIdaAudit(manySpaces);
    expect(Date.now() - start).toBeLessThan(200);
    expect(results).toHaveLength(0);
  });

  it('returns [] quickly for repeated uppercase prefix with no course number (COURSE_CODE_RE guard)', () => {
    // "A A A A ..." with no 3-digit number — old nested (?:[A-Z]{1,4}\s+)+ could
    // backtrack quadratically on this input (tried as course-code, failed, retried).
    const repeatedPrefix = ('A '.repeat(100)).trim();
    const start = Date.now();
    const results = parseIdaAudit(repeatedPrefix);
    expect(Date.now() - start).toBeLessThan(200);
    expect(results).toHaveLength(0);
  });
});
