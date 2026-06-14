import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeCourseId,
  semesterSortKey,
  docIdFromHref,
  detectNonResultsHtml,
  parseResultRows,
  mostRecentSyllabiByCourse,
  extractGrading,
  extractTopics,
  extractTextbooks,
  extractDescriptionExcerpt,
  extractSyllabusFields,
} from '../lib/parse-syllabi';

const FIX = path.resolve(__dirname, 'fixtures');
const RESULTS_HTML = fs.readFileSync(path.join(FIX, 'coursedocs-results.html'), 'utf-8');
const TABULAR_TEXT = fs.readFileSync(path.join(FIX, 'syllabus-text.txt'), 'utf-8');
const INLINE_TEXT = fs.readFileSync(path.join(FIX, 'syllabus-inline-grading.txt'), 'utf-8');

describe('normalizeCourseId', () => {
  it('maps "E E 302" to "ECE 302"', () => {
    expect(normalizeCourseId('E E 302')).toBe('ECE 302');
  });
  it('maps "E E 302H" to "ECE 302H"', () => {
    expect(normalizeCourseId('E E 302H')).toBe('ECE 302H');
  });
  it('passes other departments through unchanged', () => {
    expect(normalizeCourseId('C S 314')).toBe('C S 314');
    expect(normalizeCourseId('M 408C')).toBe('M 408C');
  });
  it('collapses double-spaced course tokens', () => {
    expect(normalizeCourseId('E E  302')).toBe('ECE 302');
  });
});

describe('semesterSortKey', () => {
  it('orders later terms higher', () => {
    expect(semesterSortKey('2022 Spring')).toBeGreaterThan(semesterSortKey('2021 Fall'));
  });
  it('orders seasons within a year Spring < Summer < Fall', () => {
    expect(semesterSortKey('2022 Fall')).toBeGreaterThan(semesterSortKey('2022 Summer'));
    expect(semesterSortKey('2022 Summer')).toBeGreaterThan(semesterSortKey('2022 Spring'));
  });
  it('returns 0 for an unrecognized label', () => {
    expect(semesterSortKey('garbage')).toBe(0);
  });
});

describe('docIdFromHref', () => {
  it('extracts the numeric id from a download href', () => {
    expect(docIdFromHref('/apps/student/coursedocs/courses/nlogon/download/11811905/')).toBe('11811905');
  });
  it('returns null when no download id present', () => {
    expect(docIdFromHref('/apps/student/coursedocs/nlogon/')).toBeNull();
  });
});

describe('detectNonResultsHtml', () => {
  it('returns null for a valid results page', () => {
    expect(detectNonResultsHtml(RESULTS_HTML)).toBeNull();
  });
  it('flags a login redirect', () => {
    expect(detectNonResultsHtml('<html><body>UT EID login required</body></html>')).toMatch(/login/i);
  });
  it('flags a page with no results table', () => {
    expect(detectNonResultsHtml('<html><body>No matches</body></html>')).toMatch(/results_table|layout/i);
  });
});

describe('parseResultRows', () => {
  const rows = parseResultRows(RESULTS_HTML);

  it('parses every data row', () => {
    expect(rows).toHaveLength(4);
  });

  it('normalizes the course id and keeps the raw token', () => {
    expect(rows[0].course).toBe('ECE 302');
    expect(rows[0].rawCourse).toBe('E E 302');
  });

  it('captures term, unique, title, and instructor', () => {
    expect(rows[0]).toMatchObject({
      term: '2022 Spring',
      unique: '17075',
      title: 'Introduction to Electrical Engineering.',
      instructor: 'Jack Lee',
    });
  });

  it('joins multiple <br>-separated instructors', () => {
    const ee411 = rows.find((r) => r.course === 'ECE 411' && r.term === '2020 Fall');
    expect(ee411?.instructor).toBe('Earl Swartzlander, Jane Doe');
  });

  it('extracts the syllabus docId and absolute pdfUrl', () => {
    expect(rows[0].docId).toBe('11811905');
    expect(rows[0].pdfUrl).toBe(
      'https://utdirect.utexas.edu/apps/student/coursedocs/courses/nlogon/download/11811905/'
    );
  });

  it('leaves pdfUrl null for a row without a syllabus link', () => {
    const noSyl = rows.find((r) => r.term === '2019 Spring');
    expect(noSyl?.pdfUrl).toBeNull();
    expect(noSyl?.docId).toBeNull();
  });
});

describe('mostRecentSyllabiByCourse', () => {
  const byCourse = mostRecentSyllabiByCourse(parseResultRows(RESULTS_HTML));

  it('omits courses with no syllabus rows but keeps those with one', () => {
    expect(byCourse.has('ECE 302')).toBe(true);
    expect(byCourse.has('ECE 411')).toBe(true);
  });

  it('returns the most-recent syllabus first', () => {
    expect(byCourse.get('ECE 302')?.[0].term).toBe('2022 Spring');
  });

  it('drops the no-syllabus EE 411 row, leaving only the 2020 Fall one', () => {
    const ee411 = byCourse.get('ECE 411');
    expect(ee411).toHaveLength(1);
    expect(ee411?.[0].term).toBe('2020 Fall');
  });
});

describe('extractGrading', () => {
  it('parses a tabular/offset grading block into component/percent pairs', () => {
    const grading = extractGrading(TABULAR_TEXT);
    expect(grading).toEqual(
      expect.arrayContaining([
        { component: 'Homework', pct: 20 },
        { component: 'Quizzes', pct: 10 },
        { component: 'Final Exam', pct: 30 },
      ])
    );
    // Every percentage is within bounds.
    for (const g of grading) {
      expect(g.pct).toBeGreaterThanOrEqual(1);
      expect(g.pct).toBeLessThanOrEqual(100);
    }
  });

  it('parses an inline-prose grading sentence', () => {
    const grading = extractGrading(INLINE_TEXT);
    const home = grading.find((g) => /homework/i.test(g.component));
    expect(home?.pct).toBe(10);
    expect(grading.some((g) => /final/i.test(g.component) && g.pct === 35)).toBe(true);
  });

  it('returns [] when there is no grading section', () => {
    expect(extractGrading('Just some prose with no percentages at all.')).toEqual([]);
  });
});

describe('extractTopics', () => {
  it('captures schedule lines after a Course Outline header', () => {
    const topics = extractTopics(TABULAR_TEXT);
    // Runs of whitespace are normalized to two spaces.
    expect(topics).toContain('Week 1  Introduction and basic concepts');
    expect(topics.length).toBeGreaterThanOrEqual(3);
    // Boilerplate after the schedule is filtered out.
    expect(topics.some((t) => /academic integrity/i.test(t))).toBe(false);
  });

  it('captures schedule lines after a Lecture Schedule header', () => {
    const topics = extractTopics(INLINE_TEXT);
    expect(topics.some((t) => /Operational Amplifiers/i.test(t))).toBe(true);
  });

  it('returns [] when there is no schedule section', () => {
    expect(extractTopics('No outline here, just policies.')).toEqual([]);
  });
});

describe('extractTextbooks', () => {
  it('captures real citations and rejects policy prose', () => {
    const books = extractTextbooks(TABULAR_TEXT);
    expect(books.some((b) => /Ulaby/i.test(b))).toBe(true);
    expect(books.some((b) => /Sadiku/i.test(b))).toBe(true);
    // The homework-policy sentence (comma + year-like) must NOT be a textbook.
    expect(books.some((b) => /discussion of homework/i.test(b))).toBe(false);
  });

  it('captures an inline "Textbook:" citation', () => {
    const books = extractTextbooks(INLINE_TEXT);
    expect(books.some((b) => /Alexander and M\. N\. O\. Sadiku/i.test(b))).toBe(true);
  });

  it('returns [] when there is no textbook section', () => {
    expect(extractTextbooks('No readings listed for this course.')).toEqual([]);
  });
});

describe('extractDescriptionExcerpt', () => {
  it('pulls a prose description, skipping logistics lines', () => {
    const desc = extractDescriptionExcerpt(TABULAR_TEXT);
    expect(desc).toMatch(/fundamental concepts of electrical engineering/i);
    expect(desc).not.toMatch(/@utexas/);
    expect(desc).not.toMatch(/office hours/i);
  });

  it('truncates with an ellipsis when over the cap', () => {
    const long = `This course covers ${'topic '.repeat(200)}in detail.`;
    const desc = extractDescriptionExcerpt(long, 100);
    expect(desc.length).toBeLessThanOrEqual(101);
    expect(desc.endsWith('…')).toBe(true);
  });

  it('returns "" when no prose paragraph exists', () => {
    expect(extractDescriptionExcerpt('Unique: 17075\nLectures: MW 9:00am')).toBe('');
  });
});

describe('extractSyllabusFields', () => {
  it('returns all four field groups together', () => {
    const fields = extractSyllabusFields(TABULAR_TEXT);
    expect(fields.grading.length).toBeGreaterThan(0);
    expect(fields.topics.length).toBeGreaterThan(0);
    expect(fields.textbooks.length).toBeGreaterThan(0);
    expect(typeof fields.descriptionExcerpt).toBe('string');
  });
});
