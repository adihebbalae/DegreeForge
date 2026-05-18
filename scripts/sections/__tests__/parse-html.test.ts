import { describe, it, expect } from 'vitest';
import { parseRegistrarHtml, detectNonScheduleHtml } from '../lib/parse-html';
import { parseTermSlug } from '../lib/term-codes';

const FALL_2026 = parseTermSlug('fall-2026');

// ─── Reference HTML — minimal table layout matching registrar's results page ─

const ECE_302_HTML = `
<html>
  <body>
    <table>
      <tr><td colspan="2"><b>ECE 302 INTRO ELECTRICAL ENGINEERING</b></td></tr>
      <tr><td>Unique:</td><td>18310</td></tr>
      <tr><td>Days:</td><td>MW</td></tr>
      <tr><td>Hour:</td><td>9:00 a.m.-10:30 a.m.</td></tr>
      <tr><td>Room:</td><td>EER 1.516</td></tr>
      <tr><td>Hour:</td><td>11:00 a.m.-1:00 p.m.</td></tr>
      <tr><td>Room:</td><td>EER 1.826</td></tr>
      <tr><td>Instruction Mode:</td><td>Face-to-face</td></tr>
      <tr><td>Instructor:</td><td>Shyam Shankar</td></tr>
      <tr><td>Status:</td><td>open</td></tr>

      <tr><td>Unique:</td><td>18315</td></tr>
      <tr><td>Days:</td><td>TTh</td></tr>
      <tr><td>Hour:</td><td>2:00 p.m.-3:30 p.m.</td></tr>
      <tr><td>Room:</td><td>ETC 2.108</td></tr>
      <tr><td>Instruction Mode:</td><td>Face-to-face</td></tr>
      <tr><td>Instructor:</td><td>Ruochen Lu</td></tr>
      <tr><td>Status:</td><td>cancelled</td></tr>
    </table>
  </body>
</html>
`;

const TWO_COURSE_HTML = `
<html><body>
<table>
  <tr><td><b>ECE 411 BASIC CIRCUITS LAB</b></td></tr>
  <tr><td>Unique:</td><td>20100</td></tr>
  <tr><td>Days:</td><td>F</td></tr>
  <tr><td>Hour:</td><td>10:00 a.m.-1:00 p.m.</td></tr>
  <tr><td>Instructor:</td><td>Jane Doe</td></tr>

  <tr><td><b>M 408D DIFFERENTIAL CALCULUS</b></td></tr>
  <tr><td>Unique:</td><td>54000</td></tr>
  <tr><td>Days:</td><td>MWF</td></tr>
  <tr><td>Hour:</td><td>9:00 a.m.-10:00 a.m.</td></tr>
  <tr><td>Instructor:</td><td>John Smith</td></tr>
</table>
</body></html>
`;

const LOGIN_REDIRECT_HTML = `
<html><head><title>UT EID Login</title></head><body>Please log in...</body></html>
`;

const EMPTY_RESULTS_HTML = `
<html><body><h1>No courses match your criteria</h1></body></html>
`;

// ─── detectNonScheduleHtml ───────────────────────────────────────────────────

describe('detectNonScheduleHtml', () => {
  it('flags UT EID login pages', () => {
    expect(detectNonScheduleHtml(LOGIN_REDIRECT_HTML)).toMatch(/login/i);
  });

  it('flags empty result pages (no Unique: labels)', () => {
    expect(detectNonScheduleHtml(EMPTY_RESULTS_HTML)).toMatch(/no "unique:"/i);
  });

  it('passes valid schedule HTML', () => {
    expect(detectNonScheduleHtml(ECE_302_HTML)).toBeNull();
  });
});

// ─── parseRegistrarHtml ──────────────────────────────────────────────────────

describe('parseRegistrarHtml', () => {
  it('parses two sections of ECE 302 with correct fields', () => {
    const out = parseRegistrarHtml(ECE_302_HTML, FALL_2026, 'fixture');
    expect(out.semester).toBe('Fall 2026');
    expect(out.semester_code).toBe('20269');
    expect(Object.keys(out.courses)).toEqual(['ECE 302']);

    const course = out.courses['ECE 302'];
    expect(course.title).toBe('INTRO ELECTRICAL ENGINEERING');
    expect(course.sections).toHaveLength(2);

    const [s1, s2] = course.sections;
    expect(s1.unique).toBe(18310);
    expect(s1.instructor).toBe('Shyam Shankar');
    expect(s1.instruction_mode).toBe('Face-to-face');
    expect(s1.status).toBe('open');
    // Two meeting blocks: MW lecture + (no-day) lab
    expect(s1.meetings.length).toBeGreaterThanOrEqual(2);
    expect(s1.meetings[0]).toMatchObject({ days: 'MW', time: '9:00 a.m.-10:30 a.m.', room: 'EER 1.516' });

    expect(s2.unique).toBe(18315);
    expect(s2.instructor).toBe('Ruochen Lu');
    expect(s2.status).toBe('cancelled');
  });

  it('handles multiple courses in a single page', () => {
    const out = parseRegistrarHtml(TWO_COURSE_HTML, FALL_2026, 'fixture');
    expect(Object.keys(out.courses).sort()).toEqual(['ECE 411', 'M 408D']);
    expect(out.courses['ECE 411'].sections[0].unique).toBe(20100);
    expect(out.courses['M 408D'].sections[0].unique).toBe(54000);
    expect(out.courses['M 408D'].sections[0].instructor).toBe('John Smith');
  });

  it('throws on login-redirect HTML', () => {
    expect(() => parseRegistrarHtml(LOGIN_REDIRECT_HTML, FALL_2026, 'fixture')).toThrow(/login/i);
  });

  it('throws on empty results', () => {
    expect(() => parseRegistrarHtml(EMPTY_RESULTS_HTML, FALL_2026, 'fixture')).toThrow(/no "unique:"/i);
  });

  it('normalizes "E E 302" course-header prefix to "ECE 302"', () => {
    const html = `
      <table>
        <tr><td>E E 302 INTRO EE</td></tr>
        <tr><td>Unique:</td><td>11111</td></tr>
        <tr><td>Days:</td><td>MW</td></tr>
        <tr><td>Hour:</td><td>9:00 a.m.-10:00 a.m.</td></tr>
      </table>`;
    const out = parseRegistrarHtml(html, FALL_2026, 'fixture');
    expect(out.courses['ECE 302']).toBeDefined();
  });
});
