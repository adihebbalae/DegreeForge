import { describe, it, expect } from 'vitest';
import { parseCourseId, isValidCourseId } from './sanitize-course-list';

describe('parseCourseId', () => {
  it('parses a plain code into prefix / number / empty suffix', () => {
    expect(parseCourseId('ECE 302')).toEqual({ prefix: 'ECE', number: 302, suffix: '' });
  });

  it('parses a suffixed code (honors / lab / variant letters)', () => {
    expect(parseCourseId('M 427J')).toEqual({ prefix: 'M', number: 427, suffix: 'J' });
    expect(parseCourseId('CTI 301G')).toEqual({ prefix: 'CTI', number: 301, suffix: 'G' });
    expect(parseCourseId('ECE 464K')).toEqual({ prefix: 'ECE', number: 464, suffix: 'K' });
  });

  it('takes the LEADING digit run as the number (matches the old split+parseInt)', () => {
    expect(parseCourseId('ECE 302H')?.number).toBe(302);
  });

  it('returns null for non-strings', () => {
    expect(parseCourseId(null)).toBeNull();
    expect(parseCourseId(undefined)).toBeNull();
    expect(parseCourseId(302)).toBeNull();
  });

  it('returns null for malformed / non-course tokens', () => {
    expect(parseCourseId('')).toBeNull();
    expect(parseCourseId('ECE302')).toBeNull(); // no space
    expect(parseCourseId('ECE')).toBeNull(); // no number
    expect(parseCourseId('lowercase 302')).toBeNull(); // not uppercase prefix
    expect(parseCourseId('JUNK')).toBeNull();
  });

  it('accepts exactly the tokens isValidCourseId accepts (number-led suffix)', () => {
    for (const id of ['ECE 302', 'M 427J', 'CTI 301G', 'PHY 303L']) {
      expect(isValidCourseId(id)).toBe(true);
      expect(parseCourseId(id)).not.toBeNull();
    }
  });
});
