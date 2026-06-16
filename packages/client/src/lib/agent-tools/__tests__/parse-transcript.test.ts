import { describe, it, expect } from 'vitest';
import { parseTranscript } from '../parse-transcript';

// ─── Synthetic Academic Summary fixture ───────────────────────────────────────
// All names, EIDs, and course selections are FABRICATED.  This fixture mirrors
// the pdfjs token order observed in a real UT "Academic Summary" PDF export
// (described in the task brief) — NOT actual PII.
//
// Key structure the fixture exercises:
//  - Per-term section headings ("Summer 2023 Courses", etc.)
//  - Transfer courses: grade = letter, Type = "Transfer" → source 'transfer'
//  - Credit-by-exam courses: grade = "CR", Type split "Credit by\nexam" → source 'credit_by_exam'
//  - In-residence courses: grade = letter, Type = "In residence" → source 'in_residence'
//  - Column header line ("Course Title Grade ...") is NOT emitted as a course
//  - Page/document headers are NOT emitted as courses
//  - GPA-summary table footer lines are NOT emitted as courses
//  - Term assignment from section headings (NOT from per-row data)

const ACADEMIC_SUMMARY_FIXTURE = `Academic Summary Unofficial Document Page 1 of 2

The University of Texas at Austin

Academic Summary

Unofficial Document

EID: FAKEID1

Name: FAKEUSER, TESTER

School 1: ENGINEERING (4) First Semester Enrolled: Fall 2023

Major 1: ELECTRICAL AND COMPUTER ENGINEERING

(BSECE)

Last Semester Enrolled: Spring 2025

Date Degree Expected: 0

Classification: JUNIOR

Summer 2023 Courses

Course Title Grade Unique Type Credit Hours Grade Points

M 508M INTERMEDIATE CALCULUS A 0 Transfer 5.0 0.00

Fall 2023 Courses

Course Title Grade Unique Type Credit Hours Grade Points

M 411 LINEAR ALGEBRA B 0 Transfer 4.0 0.00

Summer 2024 Courses

Course Title Grade Unique Type Credit Hours Grade Points

RHE 306 RHETORIC AND WRITING CR 20127
Credit by
exam 3.0 0.00

M 408C DIFF AND INTEGRAL CALCULUS CR 26050
Credit by
exam 4.0 0.00

Fall 2024 Courses

Course Title Grade Unique Type Credit Hours Grade Points

ECE 302 INTRO ELECTRICAL ENGINEERING B+ 18210 In residence 3.0 9.99

ECE 306 INTRODUCTION TO COMPUTING A- 18310 In residence 3.0 11.01

Spring 2025 Courses

Course Title Grade Unique Type Credit Hours Grade Points

CTI 301G INTRO TO ANCIENT GREECE A 31240 In residence 3.0 12.00

Total Hours Transferred: 9 Lower Division Graduate Level

Total Hours Taken: 22 Hours: 16.00 Hours: 0.00

GPA Hours: 9.00 GPA Hours: 0.00

Grade Points: 36.00 Grade Points: 0.00

GPA: 4.0000 GPA: 0.0000

Upper Division Overall

Hours: 6.00 Hours: 22.00

GPA Hours: 6.00 GPA Hours: 15.00

Grade Points: 23.01 Grade Points: 59.01

GPA: 3.8350 GPA: 3.9340`;

// ─── Existing flat-paste format tests ─────────────────────────────────────────

describe('parseTranscript', () => {
  it('should parse valid UT transcript lines', () => {
    const text = `
ECE 302  Intro to Electrical Eng  A  Fall 2025  3
M 408C  Calculus I  B+  Fall 2024  4
    `;
    const result = parseTranscript(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      courseId: 'ECE 302',
      title: 'Intro to Electrical Eng',
      grade: 'A',
      semester: 'Fall 2025',
      creditHours: 3,
      source: 'in_residence',
    });
    expect(result[1]).toEqual({
      courseId: 'M 408C',
      title: 'Calculus I',
      grade: 'B+',
      semester: 'Fall 2024',
      creditHours: 4,
      source: 'in_residence',
    });
  });

  it('should normalize E E to ECE', () => {
    const text = `E E 302 Intro to Electrical Eng A Fall 2025 3`;
    const result = parseTranscript(text);
    expect(result).toHaveLength(1);
    expect(result[0].courseId).toBe('ECE 302');
  });

  it('should handle tab separated input', () => {
    const text = `ECE 302\tIntro to Electrical Eng\tA\tFall 2025\t3`;
    const result = parseTranscript(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      courseId: 'ECE 302',
      title: 'Intro to Electrical Eng',
      grade: 'A',
      semester: 'Fall 2025',
      creditHours: 3,
      source: 'in_residence',
    });
  });

  it('should ignore malformed lines', () => {
    const text = `
This is just some random text
ECE 302 Intro to Electrical Eng A Fall 2025 3
More random text
    `;
    const result = parseTranscript(text);
    expect(result).toHaveLength(1);
    expect(result[0].courseId).toBe('ECE 302');
  });

  it('should return empty array for empty input', () => {
    const result = parseTranscript('');
    expect(result).toHaveLength(0);
  });

  it('should skip pathologically long lines without hanging the regex', () => {
    const longLine = 'A'.repeat(50_000);
    const text = `${longLine}\nECE 302 Intro to Electrical Eng A Fall 2025 3`;
    const start = Date.now();
    const result = parseTranscript(text);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(result).toHaveLength(1);
    expect(result[0].courseId).toBe('ECE 302');
  });

  it('should not catastrophically backtrack on a valid-length line with many spaces (ReDoS guard)', () => {
    // A dept abbreviation followed by 60 spaces then a course number — the old
    // /^([A-Z\s]+?)\s+/ pattern could backtrack catastrophically here because
    // [A-Z\s]+? and \s+ both compete to consume spaces.
    const pathological = 'ECE' + ' '.repeat(60) + '302 Digital Logic A Fall 2025 3';
    const start = Date.now();
    parseTranscript(pathological);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('should parse multi-token department codes correctly after regex fix', () => {
    const lines = [
      'E E 411 Electromagnetic Eng A Fall 2025 3',
      'ECE 302H Intro Honors A Spring 2025 3',
      'M 408C Calculus I B+ Fall 2024 4',
      'C S 314 Data Structures A Spring 2024 3',
    ];
    const result = parseTranscript(lines.join('\n'));
    expect(result).toHaveLength(4);
    expect(result[0].courseId).toBe('ECE 411');
    expect(result[1].courseId).toBe('ECE 302H');
    expect(result[2].courseId).toBe('M 408C');
    expect(result[3].courseId).toBe('C S 314');
  });

  // ─── Academic Summary format tests ──────────────────────────────────────────

  it('[AcademicSummary] parses in-residence courses with correct term from section heading', () => {
    const result = parseTranscript(ACADEMIC_SUMMARY_FIXTURE);

    const ece302 = result.find(c => c.courseId === 'ECE 302');
    expect(ece302).toBeDefined();
    expect(ece302?.grade).toBe('B+');
    expect(ece302?.semester).toBe('Fall 2024');
    expect(ece302?.creditHours).toBe(3);
    expect(ece302?.source).toBe('in_residence');

    const ece306 = result.find(c => c.courseId === 'ECE 306');
    expect(ece306).toBeDefined();
    expect(ece306?.grade).toBe('A-');
    expect(ece306?.semester).toBe('Fall 2024');
    expect(ece306?.source).toBe('in_residence');

    const cti301g = result.find(c => c.courseId === 'CTI 301G');
    expect(cti301g).toBeDefined();
    expect(cti301g?.semester).toBe('Spring 2025');
    expect(cti301g?.source).toBe('in_residence');
  });

  it('[AcademicSummary] maps Transfer type → source "transfer"', () => {
    const result = parseTranscript(ACADEMIC_SUMMARY_FIXTURE);

    const m508m = result.find(c => c.courseId === 'M 508M');
    expect(m508m).toBeDefined();
    expect(m508m?.source).toBe('transfer');
    expect(m508m?.semester).toBe('Summer 2023');
    expect(m508m?.creditHours).toBe(5);

    const m411 = result.find(c => c.courseId === 'M 411');
    expect(m411).toBeDefined();
    expect(m411?.source).toBe('transfer');
    expect(m411?.semester).toBe('Fall 2023');
    expect(m411?.creditHours).toBe(4);
  });

  it('[AcademicSummary] maps Credit-by-exam type → source "credit_by_exam" and correct credit hours', () => {
    const result = parseTranscript(ACADEMIC_SUMMARY_FIXTURE);

    const rhe306 = result.find(c => c.courseId === 'RHE 306');
    expect(rhe306).toBeDefined();
    expect(rhe306?.source).toBe('credit_by_exam');
    expect(rhe306?.grade).toBe('CR');
    expect(rhe306?.semester).toBe('Summer 2024');
    expect(rhe306?.creditHours).toBe(3);

    const m408c = result.find(c => c.courseId === 'M 408C');
    expect(m408c).toBeDefined();
    expect(m408c?.source).toBe('credit_by_exam');
    expect(m408c?.grade).toBe('CR');
    expect(m408c?.semester).toBe('Summer 2024');
    expect(m408c?.creditHours).toBe(4);
  });

  it('[AcademicSummary] does NOT emit column-header line as a course', () => {
    const result = parseTranscript(ACADEMIC_SUMMARY_FIXTURE);
    // "Course", "Title", "Grade" etc. must not appear as course IDs.
    const hasBadRow = result.some(c =>
      c.courseId.startsWith('Course') || c.courseId.startsWith('Title') || c.courseId.startsWith('Grade')
    );
    expect(hasBadRow).toBe(false);
  });

  it('[AcademicSummary] does NOT emit GPA-table footer lines as courses', () => {
    const result = parseTranscript(ACADEMIC_SUMMARY_FIXTURE);
    // Footer lines: "Total Hours Transferred:", "Lower Division", "GPA Hours:", etc.
    const hasBadRow = result.some(c =>
      c.courseId.startsWith('Total') ||
      c.courseId.startsWith('Lower') ||
      c.courseId.startsWith('Upper') ||
      c.courseId.startsWith('GPA') ||
      c.courseId.startsWith('Hours')
    );
    expect(hasBadRow).toBe(false);
  });

  it('[AcademicSummary] does NOT emit document/page header lines as courses', () => {
    const result = parseTranscript(ACADEMIC_SUMMARY_FIXTURE);
    // Doc header lines: "Academic Summary", "The University of Texas", "EID:", "Name:", etc.
    const hasBadRow = result.some(c =>
      c.courseId.startsWith('Academic') ||
      c.courseId.startsWith('The') ||
      c.courseId.startsWith('Name') ||
      c.courseId.startsWith('EID') ||
      c.courseId.startsWith('School') ||
      c.courseId.startsWith('Major')
    );
    expect(hasBadRow).toBe(false);
  });

  it('[AcademicSummary] emits exactly the expected courses (no phantoms)', () => {
    const result = parseTranscript(ACADEMIC_SUMMARY_FIXTURE);
    const courseIds = result.map(c => c.courseId).sort();
    // 7 courses: 2 transfer (M 508M, M 411), 2 credit-by-exam (RHE 306, M 408C),
    // 3 in-residence (ECE 302, ECE 306, CTI 301G).
    expect(courseIds).toEqual(['CTI 301G', 'ECE 302', 'ECE 306', 'M 408C', 'M 411', 'M 508M', 'RHE 306'].sort());
  });

  it('[AcademicSummary] term assignment comes from section heading, not per-row data', () => {
    // Multiple courses under the same heading should all share the same term.
    const result = parseTranscript(ACADEMIC_SUMMARY_FIXTURE);
    const fall2024Courses = result.filter(c => c.semester === 'Fall 2024');
    expect(fall2024Courses.map(c => c.courseId).sort()).toEqual(['ECE 302', 'ECE 306'].sort());
  });

  it('[AcademicSummary] flat-paste format still works when no section headings present', () => {
    // The flat-paste path must not be broken — input without section headings
    // should go through the original parser.
    const flatText = `ECE 302 Intro to Electrical Eng A Fall 2025 3
M 408C Calculus I B+ Spring 2025 4`;
    const result = parseTranscript(flatText);
    expect(result).toHaveLength(2);
    expect(result[0].courseId).toBe('ECE 302');
    expect(result[0].semester).toBe('Fall 2025');
    expect(result[1].courseId).toBe('M 408C');
  });
});

// ─── Real-faithful Academic Summary fixture ───────────────────────────────────
// This fixture replicates the EXACT line structure and interleaving produced by
// pdfjs on the real UT Academic Summary PDF, with only the student name and EID
// replaced by dummy values.  Structure, ordering, blank lines, page-break
// artifacts, and multi-line course-row splits are ALL preserved verbatim.
//
// Real pdfjs behaviour surfaced by this fixture (and hidden by the synthetic one):
//  - Every content line is followed by a blank line.
//  - Long course rows split across 3 lines:
//      line 1: bare course code (e.g. "M 408C")
//      line 2: first title fragment (e.g. "DIFFEREN AND INTEGRAL")
//      line 3: remaining title + grade + unique + type (e.g. "CALCULUS CR 26050")
//    ...followed by "Credit by" then "exam N.N" on separate lines.
//  - Page-break artifacts: page-2 header + repeated column header appear between
//    the "Fall 2025 Courses" heading (page 1) and its first course row (page 2).
//  - UGS 016 is a 0-credit course that must be DROPPED by callers (creditHours=0,
//    in_residence; the parser emits it — callers filter on creditHours > 0).
//
// PII replacement: EID changed to TESTEID1, Name changed to TESTUSER, TESTER.
// All other content is character-for-character identical to the real extraction.
const REAL_FAITHFUL_FIXTURE = `Academic Summary Unofficial Document Page 1 of 2

The University of Texas at Austin

Academic Summary

Unofficial Document

EID: TESTEID1

Name: TESTUSER, TESTER

School 1: ENGINEERING (4) First Semester Enrolled: Fall 2025

Major 1: ELECTRICAL AND COMPUTER ENGINEERING

(BSECE)

Last Semester Enrolled: Spring 2026

Date Degree Expected: 0

Classification: SOPHOMORE

Summer 2024 Courses

Course Title Grade Unique Type Credit Hours Grade Points

M 508M INTERMEDIATE CALCULUS A 0 Transfer 5.0 0.00

Fall 2024 Courses

Course Title Grade Unique Type Credit Hours Grade Points

M 411 LINEAR ALGEBRA B 0 Transfer 4.0 0.00

Summer 2025 Courses

Course Title Grade Unique Type Credit Hours Grade Points

RHE 306 RHETORIC AND WRITING CR 20127

Credit by

exam 3.0 0.00

M 408C

DIFFEREN AND INTEGRAL

CALCULUS CR 26050

Credit by

exam 4.0 0.00

Fall 2025 Courses
Academic Summary Unofficial Document Page 2 of 2

Course Title Grade Unique Type Credit Hours Grade Points

UGS 016

FIRST-YR INTEREST

GROUP-ENGR CR 69135 In residence 0.0 0.00

ECE 302

INTRO ELECTRICAL

ENGINEERING B+ 18210 In residence 3.0 9.99

ECE 306 INTRODUCTION TO COMPUTING A- 18310 In residence 3.0 11.01

CTI 301G INTRO TO ANCIENT GREECE A- 31240 In residence 3.0 11.01

M 427J

DIFF EQNS WITH LINEAR

ALGEBRA A 58755 In residence 4.0 16.00

Spring 2026 Courses

Course Title Grade Unique Type Credit Hours Grade Points

ECE 312H

SOFTWR DSGN/IMPLEMNTATN I:

HON A- 18000 In residence 3.0 11.01

M 325K DISCRETE MATHEMATICS A- 56585 In residence 3.0 11.01

CTI 302

CLASSICS OF SOCL/POLIT

THOUGHT A 30400 In residence 3.0 12.00

ECE 319H INTRO EMBEDDED SYS: HONORS A 18080 In residence 3.0 12.00

Total Hours Transferred: 9 Lower Division Graduate Level

Total Hours Taken: 32 Hours: 25.00 Hours: 0.00

GPA Hours: 18.00 GPA Hours: 0.00

Grade Points: 67.02 Grade Points: 0.00

GPA: 3.7233 GPA: 0.0000

Upper Division Overall

Hours: 7.00 Hours: 32.00

GPA Hours: 7.00 GPA Hours: 25.00

Grade Points: 27.01 Grade Points: 94.03

GPA: 3.8585 GPA: 3.7612`;

describe('parseTranscript — real-faithful Academic Summary fixture', () => {
  it('[RealFaithful] emits all 12 non-zero-credit completed courses', () => {
    const result = parseTranscript(REAL_FAITHFUL_FIXTURE);
    // UGS 016 has creditHours = 0 — callers filter it; parser may emit it.
    // We assert on the 12 non-zero-credit courses.
    const nonZero = result.filter(c => c.creditHours > 0);
    const courseIds = nonZero.map(c => c.courseId).sort();
    expect(courseIds).toEqual([
      'CTI 301G', 'CTI 302',
      'ECE 302', 'ECE 306', 'ECE 312H', 'ECE 319H',
      'M 325K', 'M 408C', 'M 411', 'M 427J', 'M 508M',
      'RHE 306',
    ].sort());
  });

  it('[RealFaithful] transfer courses have correct source and credit hours', () => {
    const result = parseTranscript(REAL_FAITHFUL_FIXTURE);
    const m508m = result.find(c => c.courseId === 'M 508M');
    expect(m508m).toBeDefined();
    expect(m508m?.source).toBe('transfer');
    expect(m508m?.semester).toBe('Summer 2024');
    expect(m508m?.creditHours).toBe(5);

    const m411 = result.find(c => c.courseId === 'M 411');
    expect(m411).toBeDefined();
    expect(m411?.source).toBe('transfer');
    expect(m411?.semester).toBe('Fall 2024');
    expect(m411?.creditHours).toBe(4);
  });

  it('[RealFaithful] RHE 306 is credit_by_exam (not in_residence) with grade CR', () => {
    const result = parseTranscript(REAL_FAITHFUL_FIXTURE);
    const rhe306 = result.find(c => c.courseId === 'RHE 306');
    expect(rhe306).toBeDefined();
    expect(rhe306?.source).toBe('credit_by_exam');
    expect(rhe306?.grade).toBe('CR');
    expect(rhe306?.creditHours).toBe(3);
    expect(rhe306?.semester).toBe('Summer 2025');
  });

  it('[RealFaithful] M 408C (3-line split + credit-by-exam) is captured correctly', () => {
    const result = parseTranscript(REAL_FAITHFUL_FIXTURE);
    const m408c = result.find(c => c.courseId === 'M 408C');
    expect(m408c).toBeDefined();
    expect(m408c?.source).toBe('credit_by_exam');
    expect(m408c?.grade).toBe('CR');
    expect(m408c?.creditHours).toBe(4);
    expect(m408c?.semester).toBe('Summer 2025');
  });

  it('[RealFaithful] ECE 302 (3-line split) is captured with correct grade and source', () => {
    const result = parseTranscript(REAL_FAITHFUL_FIXTURE);
    const ece302 = result.find(c => c.courseId === 'ECE 302');
    expect(ece302).toBeDefined();
    expect(ece302?.grade).toBe('B+');
    expect(ece302?.source).toBe('in_residence');
    expect(ece302?.creditHours).toBe(3);
    expect(ece302?.semester).toBe('Fall 2025');
  });

  it('[RealFaithful] M 427J (3-line split) is captured correctly', () => {
    const result = parseTranscript(REAL_FAITHFUL_FIXTURE);
    const m427j = result.find(c => c.courseId === 'M 427J');
    expect(m427j).toBeDefined();
    expect(m427j?.grade).toBe('A');
    expect(m427j?.source).toBe('in_residence');
    expect(m427j?.creditHours).toBe(4);
    expect(m427j?.semester).toBe('Fall 2025');
  });

  it('[RealFaithful] ECE 312H (3-line split) is captured correctly', () => {
    const result = parseTranscript(REAL_FAITHFUL_FIXTURE);
    const ece312h = result.find(c => c.courseId === 'ECE 312H');
    expect(ece312h).toBeDefined();
    expect(ece312h?.grade).toBe('A-');
    expect(ece312h?.source).toBe('in_residence');
    expect(ece312h?.creditHours).toBe(3);
    expect(ece312h?.semester).toBe('Spring 2026');
  });

  it('[RealFaithful] CTI 302 (3-line split) is captured correctly', () => {
    const result = parseTranscript(REAL_FAITHFUL_FIXTURE);
    const cti302 = result.find(c => c.courseId === 'CTI 302');
    expect(cti302).toBeDefined();
    expect(cti302?.grade).toBe('A');
    expect(cti302?.source).toBe('in_residence');
    expect(cti302?.creditHours).toBe(3);
    expect(cti302?.semester).toBe('Spring 2026');
  });

  it('[RealFaithful] page-break artifact does not disrupt Fall 2025 term assignment', () => {
    // "Fall 2025 Courses" heading is on page 1; the actual Fall 2025 courses
    // appear on page 2 after the page-break header + repeated column header.
    // All Fall 2025 courses must still carry semester = "Fall 2025".
    const result = parseTranscript(REAL_FAITHFUL_FIXTURE);
    const fall2025 = result.filter(c => c.semester === 'Fall 2025');
    const ids = fall2025.map(c => c.courseId).sort();
    // UGS 016 is 0-credit; include it in the term check (it may or may not be emitted).
    // Core assertion: the 4 non-zero-credit Fall 2025 courses all carry correct term.
    expect(ids).toContain('ECE 302');
    expect(ids).toContain('ECE 306');
    expect(ids).toContain('CTI 301G');
    expect(ids).toContain('M 427J');
  });

  it('[RealFaithful] UGS 016 (0-credit) is not in the non-zero set', () => {
    const result = parseTranscript(REAL_FAITHFUL_FIXTURE);
    const nonZero = result.filter(c => c.creditHours > 0);
    expect(nonZero.find(c => c.courseId === 'UGS 016')).toBeUndefined();
  });
});
