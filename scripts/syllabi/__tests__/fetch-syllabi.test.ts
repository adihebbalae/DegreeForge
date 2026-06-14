import { describe, it, expect } from 'vitest';
import { toCourseDocsDept, parseArgs, DEFAULT_DEPARTMENT } from '../fetch-syllabi';

describe('toCourseDocsDept', () => {
  it('reverses the app id "ECE" back to CourseDocs "E E"', () => {
    expect(toCourseDocsDept('ECE')).toBe('E E');
    expect(toCourseDocsDept('ece')).toBe('E E');
  });
  it('leaves an already-spaced "E E" unchanged', () => {
    expect(toCourseDocsDept('E E')).toBe('E E');
  });
  it('passes other departments through unchanged', () => {
    expect(toCourseDocsDept('C S')).toBe('C S');
    expect(toCourseDocsDept('M')).toBe('M');
  });
});

describe('parseArgs', () => {
  it('defaults to the E E department when none given', () => {
    expect(parseArgs([]).departments).toEqual([DEFAULT_DEPARTMENT]);
  });

  it('ignores a bare "--" passthrough separator', () => {
    const args = parseArgs(['--', '--course', '302']);
    expect(args.courses).toEqual(['302']);
  });

  it('collects repeated --course and --department flags', () => {
    const args = parseArgs(['--department', 'E E', '--course', '302', '--course', '411']);
    expect(args.departments).toEqual(['E E']);
    expect(args.courses).toEqual(['302', '411']);
  });

  it('parses numeric --max-per-course and --delay-ms with a floor', () => {
    const args = parseArgs(['--max-per-course', '3', '--delay-ms', '500']);
    expect(args.maxPerCourse).toBe(3);
    expect(args.delayMs).toBe(500);
    // floors: at least 1 per course, non-negative delay
    expect(parseArgs(['--max-per-course', '0']).maxPerCourse).toBe(1);
    expect(parseArgs(['--delay-ms', '-5']).delayMs).toBe(0);
  });

  it('sets the dry-run and help flags', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown flag/);
  });
});
