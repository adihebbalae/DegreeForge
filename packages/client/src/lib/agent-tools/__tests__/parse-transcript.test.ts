import { describe, it, expect } from 'vitest';
import { parseTranscript } from '../parse-transcript';

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
});
