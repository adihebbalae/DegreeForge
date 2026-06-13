import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseRegistrarHtml, detectNonScheduleHtml } from '../lib/parse-html';
import { parseTermSlug } from '../lib/term-codes';

const FALL_2026 = parseTermSlug('fall-2026');

// ─── Reference HTML — real rwd-table results layout ──────────────────────────
// Updated to match the actual registrar page structure where:
//  - Course headers are <td class="course_header"><h2>ECE  302 TITLE</h2></td>
//  - Unique numbers are <a title="Unique number">18310</a>
//  - Days/Hour/Room use data-th attributes and <span> children per meeting slot

const ECE_302_HTML = `
<html>
  <body>
    <table class="rwd-table results">
      <thead>
        <tr>
          <th>Unique</th><th>Day</th><th>Hour</th><th>Room</th>
          <th>Instruction Mode</th><th>Instructor</th><th>Status</th><th></th><th>Core</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="course_header" colspan="8"><h2>ECE  302 INTRO ELECTRICAL ENGINEERING</h2></td>
        </tr>
        <tr>
          <td data-th="Unique"><a href="/apps/registrar/course_schedule/20269/18310/" title="Unique number">18310</a></td>
          <td data-th="Days"> <span>MW</span><br> <span class="second-row">W</span><br> </td>
          <td data-th="Hour"> <span>9:00 a.m.-10:30 a.m.</span><br> <span class="second-row">11:00 a.m.-1:00 p.m.</span><br> </td>
          <td data-th="Room"> <span>EER 1.516</span><br> <span class="second-row">EER 1.826</span><br> </td>
          <td data-th="Instruction Mode">Face-to-face</td>
          <td data-th="Instructor"> <span>Shyam Shankar</span><br> </td>
          <td data-th="Status">open</td>
          <td data-th="Add"></td>
          <td data-th="Core"><div class="core_block"><ul class="core"><li class="" title=""></li></ul></div></td>
        </tr>
        <tr>
          <td data-th="Unique"><a href="/apps/registrar/course_schedule/20269/18315/" title="Unique number">18315</a></td>
          <td data-th="Days"> <span>TTh</span><br> </td>
          <td data-th="Hour"> <span>2:00 p.m.-3:30 p.m.</span><br> </td>
          <td data-th="Room"> <span>ETC 2.108</span><br> </td>
          <td data-th="Instruction Mode">Face-to-face</td>
          <td data-th="Instructor"> <span>Ruochen Lu</span><br> </td>
          <td data-th="Status">cancelled</td>
          <td data-th="Add"></td>
          <td data-th="Core"><div class="core_block"><ul class="core"><li class="" title=""></li></ul></div></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>
`;

const TWO_COURSE_HTML = `
<html><body>
<table class="rwd-table results">
  <thead><tr><th>Unique</th><th>Day</th><th>Hour</th><th>Room</th><th>Instruction Mode</th><th>Instructor</th><th>Status</th><th></th><th>Core</th></tr></thead>
  <tbody>
    <tr><td class="course_header" colspan="8"><h2>ECE  411 BASIC CIRCUITS LAB</h2></td></tr>
    <tr>
      <td data-th="Unique"><a href="/apps/registrar/course_schedule/20269/20100/" title="Unique number">20100</a></td>
      <td data-th="Days"> <span>F</span><br> </td>
      <td data-th="Hour"> <span>10:00 a.m.-1:00 p.m.</span><br> </td>
      <td data-th="Room"></td>
      <td data-th="Instruction Mode">Face-to-face</td>
      <td data-th="Instructor"> <span>Jane Doe</span><br> </td>
      <td data-th="Status">open</td>
      <td data-th="Add"></td>
      <td data-th="Core"><div class="core_block"><ul class="core"><li class="" title=""></li></ul></div></td>
    </tr>
    <tr><td class="course_header" colspan="8"><h2>M  408D DIFFERENTIAL CALCULUS</h2></td></tr>
    <tr>
      <td data-th="Unique"><a href="/apps/registrar/course_schedule/20269/54000/" title="Unique number">54000</a></td>
      <td data-th="Days"> <span>MWF</span><br> </td>
      <td data-th="Hour"> <span>9:00 a.m.-10:00 a.m.</span><br> </td>
      <td data-th="Room"> <span>RLM 5.104</span><br> </td>
      <td data-th="Instruction Mode">Face-to-face</td>
      <td data-th="Instructor"> <span>John Smith</span><br> </td>
      <td data-th="Status">open</td>
      <td data-th="Add"></td>
      <td data-th="Core"><div class="core_block"><ul class="core"><li class="" title=""></li></ul></div></td>
    </tr>
  </tbody>
</table>
</body></html>
`;

// Spaced two-token dept codes — the TASK-067 regression. A header like
// "C S 314 DATA STRUCTURES" must parse to course id "C S 314", not silently
// yield 0 courses (which happened when the regex captured dept="C" then failed
// the number match on "S 314").
const SPACED_DEPT_HTML = `
<html><body>
<table class="rwd-table results">
  <thead><tr><th>Unique</th><th>Day</th><th>Hour</th><th>Room</th><th>Instruction Mode</th><th>Instructor</th><th>Status</th><th></th><th>Core</th></tr></thead>
  <tbody>
    <tr><td class="course_header" colspan="8"><h2>C S 314 DATA STRUCTURES</h2></td></tr>
    <tr>
      <td data-th="Unique"><a href="/apps/registrar/course_schedule/20269/50000/" title="Unique number">50000</a></td>
      <td data-th="Days"> <span>MWF</span><br> </td>
      <td data-th="Hour"> <span>10:00 a.m.-11:00 a.m.</span><br> </td>
      <td data-th="Room"> <span>GDC 2.216</span><br> </td>
      <td data-th="Instruction Mode">Face-to-face</td>
      <td data-th="Instructor"> <span>Alison Norman</span><br> </td>
      <td data-th="Status">open</td>
      <td data-th="Add"></td>
      <td data-th="Core"><div class="core_block"><ul class="core"><li class="" title=""></li></ul></div></td>
    </tr>
    <tr><td class="course_header" colspan="8"><h2>T D 301 INTRO TO THEATRE</h2></td></tr>
    <tr>
      <td data-th="Unique"><a href="/apps/registrar/course_schedule/20269/61000/" title="Unique number">61000</a></td>
      <td data-th="Days"> <span>TTH</span><br> </td>
      <td data-th="Hour"> <span>1:00 p.m.-2:30 p.m.</span><br> </td>
      <td data-th="Room"> <span>WIN 1.134</span><br> </td>
      <td data-th="Instruction Mode">Face-to-face</td>
      <td data-th="Instructor"> <span>Jane Roe</span><br> </td>
      <td data-th="Status">open</td>
      <td data-th="Add"></td>
      <td data-th="Core"><div class="core_block"><ul class="core"><li class="C2" title="">Visual and Performing Arts</li></ul></div></td>
    </tr>
    <tr><td class="course_header" colspan="8"><h2>F A 320K ART AND SOCIETY</h2></td></tr>
    <tr>
      <td data-th="Unique"><a href="/apps/registrar/course_schedule/20269/62000/" title="Unique number">62000</a></td>
      <td data-th="Days"> <span>MW</span><br> </td>
      <td data-th="Hour"> <span>3:00 p.m.-4:30 p.m.</span><br> </td>
      <td data-th="Room"> <span>DFA 2.204</span><br> </td>
      <td data-th="Instruction Mode">Face-to-face</td>
      <td data-th="Instructor"> <span>John Doe</span><br> </td>
      <td data-th="Status">open</td>
      <td data-th="Add"></td>
      <td data-th="Core"><div class="core_block"><ul class="core"><li class="" title=""></li></ul></div></td>
    </tr>
  </tbody>
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

  it('flags pages with no Unique-number links (empty form or no results)', () => {
    expect(detectNonScheduleHtml(EMPTY_RESULTS_HTML)).not.toBeNull();
  });

  it('passes valid schedule HTML (has title="Unique number" links)', () => {
    expect(detectNonScheduleHtml(ECE_302_HTML)).toBeNull();
  });

  it('returns null for real trimmed fixture (has Unique number links)', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures', 'ece-U-trimmed.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    expect(detectNonScheduleHtml(html)).toBeNull();
  });

  it('returns non-null for empty-search-form fixture (no Unique number links)', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures', 'empty-search-form.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    expect(detectNonScheduleHtml(html)).not.toBeNull();
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
    // Two meeting blocks: MW lecture + W lab
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
    expect(() => parseRegistrarHtml(EMPTY_RESULTS_HTML, FALL_2026, 'fixture')).toThrow();
  });

  it('normalizes "E E" course-header prefix to "ECE"', () => {
    const html = `
      <html><body>
      <table class="rwd-table results">
        <thead><tr><th>Unique</th><th>Day</th><th>Hour</th><th>Room</th><th>Instruction Mode</th><th>Instructor</th><th>Status</th><th></th><th>Core</th></tr></thead>
        <tbody>
          <tr><td class="course_header" colspan="8"><h2>E E 302 INTRO EE</h2></td></tr>
          <tr>
            <td data-th="Unique"><a href="/apps/registrar/course_schedule/20269/11111/" title="Unique number">11111</a></td>
            <td data-th="Days"> <span>MW</span><br> </td>
            <td data-th="Hour"> <span>9:00 a.m.-10:00 a.m.</span><br> </td>
            <td data-th="Room"></td>
            <td data-th="Instruction Mode">Face-to-face</td>
            <td data-th="Instructor"> <span>Test Instructor</span><br> </td>
            <td data-th="Status">open</td>
            <td data-th="Add"></td>
            <td data-th="Core"><div class="core_block"><ul class="core"><li></li></ul></div></td>
          </tr>
        </tbody>
      </table>
      </body></html>`;
    const out = parseRegistrarHtml(html, FALL_2026, 'fixture');
    expect(out.courses['ECE 302']).toBeDefined();
  });

  // ─── Spaced multi-token dept codes (TASK-067 regression) ──────────────────

  it('parses spaced two-token dept codes (C S, T D, F A) — not 0 courses', () => {
    const out = parseRegistrarHtml(SPACED_DEPT_HTML, FALL_2026, 'fixture');
    // Before the fix this returned {} (regex captured dept="C", failed on "S 314").
    expect(Object.keys(out.courses).sort()).toEqual(['C S 314', 'F A 320K', 'T D 301']);
  });

  it('parses C S 314 with correct id, title, and section', () => {
    const out = parseRegistrarHtml(SPACED_DEPT_HTML, FALL_2026, 'fixture');
    const cs = out.courses['C S 314'];
    expect(cs).toBeDefined();
    expect(cs.course).toBe('C S 314');
    expect(cs.title).toBe('DATA STRUCTURES');
    expect(cs.sections).toHaveLength(1);
    expect(cs.sections[0].unique).toBe(50000);
    expect(cs.sections[0].instructor).toBe('Alison Norman');
  });

  it('parses T D 301 with core credit preserved', () => {
    const out = parseRegistrarHtml(SPACED_DEPT_HTML, FALL_2026, 'fixture');
    const td = out.courses['T D 301'];
    expect(td).toBeDefined();
    expect(td.course).toBe('T D 301');
    expect(td.title).toBe('INTRO TO THEATRE');
    expect(td.sections[0].unique).toBe(61000);
    expect(td.sections[0].core).toBe('Visual and Performing Arts');
  });

  it('does not confuse a spaced dept code with a single-token one', () => {
    const out = parseRegistrarHtml(SPACED_DEPT_HTML, FALL_2026, 'fixture');
    // F A 320K — the "K" suffix must stay on the number, dept stays "F A"
    expect(out.courses['F A 320K']).toBeDefined();
    expect(out.courses['F A 320K'].course).toBe('F A 320K');
  });

  // ─── Real fixture tests ───────────────────────────────────────────────────

  it('parses real trimmed ece-U fixture — correct course IDs and unique numbers', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures', 'ece-U-trimmed.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const out = parseRegistrarHtml(html, FALL_2026, 'fixture');

    // Three courses expected: ECE 422C, ECE 333T, ECE 125S
    expect(Object.keys(out.courses).sort()).toEqual(['ECE 125S', 'ECE 333T', 'ECE 422C']);

    // ECE 422C has two sections
    expect(out.courses['ECE 422C'].sections).toHaveLength(2);
    expect(out.courses['ECE 422C'].sections[0].unique).toBe(18685);
    expect(out.courses['ECE 422C'].sections[1].unique).toBe(18690);

    // First section has two meeting slots (TTH lecture + TH lab)
    const sec = out.courses['ECE 422C'].sections[0];
    expect(sec.meetings).toHaveLength(2);
    expect(sec.meetings[0]).toMatchObject({ days: 'TTH', time: '12:30 p.m.-2:00 p.m.', room: 'EER 1.516' });
    expect(sec.meetings[1]).toMatchObject({ days: 'TH', time: '11:00 a.m.-12:30 p.m.', room: 'EER 0.818' });

    // Instructor is upper-case (as on real page)
    expect(sec.instructor).toBe('THOMAZ, EDISON JR');

    // Status
    expect(sec.status).toBe('waitlisted');
  });

  it('parses real trimmed fixture — ECE 333T has core credit', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures', 'ece-U-trimmed.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const out = parseRegistrarHtml(html, FALL_2026, 'fixture');

    const sec333t = out.courses['ECE 333T'].sections[0];
    expect(sec333t.unique).toBe(18720);
    expect(sec333t.core).toBe('Communication');
    expect(sec333t.instruction_mode).toBe('Face-to-face');
  });

  it('parses real trimmed fixture — ECE 125S correspondence section has no meetings', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures', 'ece-U-trimmed.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    const out = parseRegistrarHtml(html, FALL_2026, 'fixture');

    const sec125s = out.courses['ECE 125S'].sections[0];
    expect(sec125s.unique).toBe(18715);
    expect(sec125s.meetings).toHaveLength(0);
    expect(sec125s.instruction_mode).toBe('Correspondence');
  });
});
