// @vitest-environment jsdom
/**
 * DegreeRadial — TASK-098
 *
 * Black-box checks:
 *   1. Renders an SVG role="img" with an aria-label summarizing completion.
 *   2. Center text shows the percentage and done/total numbers.
 *   3. Renders without crash when all buckets are complete (pct=100).
 *   4. Renders without crash when given empty buckets (0 hrs).
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { DegreeRadial } from './DegreeRadial';
import type { BucketView } from '@/types';

afterEach(cleanup);

const SAMPLE_BUCKETS: BucketView[] = [
  {
    id: 'ece_core',
    label: 'ECE Core',
    category: 'ece_core',
    doneHours: 26,
    totalHours: 32,
    unit: 'hrs',
    complete: false,
    remaining: [{ courseId: 'ECE 351K' }],
  },
  {
    id: 'math',
    label: 'Math',
    category: 'math',
    doneHours: 15,
    totalHours: 15,
    unit: 'hrs',
    complete: true,
    remaining: [],
  },
  {
    id: 'physics',
    label: 'Physics',
    category: 'math',
    doneHours: 8,
    totalHours: 8,
    unit: 'hrs',
    complete: true,
    remaining: [],
  },
  {
    id: 'tech',
    label: 'Technical Component',
    category: 'tech_core',
    doneHours: 17,
    totalHours: 29,
    unit: 'hrs',
    complete: false,
    remaining: [{ note: '2 tech electives from approved pool' }],
  },
  {
    id: 'gen_ed',
    label: 'Core Curriculum',
    category: 'gen_ed',
    doneHours: 24,
    totalHours: 27,
    unit: 'hrs',
    complete: false,
    remaining: [{ courseId: 'GOV 312L' }],
  },
  {
    id: 'free_elec',
    label: 'Free Electives',
    category: 'elective',
    doneHours: 3,
    totalHours: 14,
    unit: 'hrs',
    complete: false,
    remaining: [{ note: '11 hrs of advanced ECE 320+ electives' }],
  },
];

describe('DegreeRadial', () => {
  it('renders an SVG with role="img"', () => {
    render(
      <DegreeRadial
        buckets={SAMPLE_BUCKETS}
        pct={78}
        done={93}
        total={125}
        gradTerm="Spring 2028"
        hrsToGo={32}
      />
    );
    const svg = screen.getByRole('img');
    expect(svg).toBeDefined();
  });

  it('aria-label includes percentage and completion numbers', () => {
    render(
      <DegreeRadial
        buckets={SAMPLE_BUCKETS}
        pct={78}
        done={93}
        total={125}
        gradTerm="Spring 2028"
        hrsToGo={32}
      />
    );
    const svg = screen.getByRole('img');
    const label = svg.getAttribute('aria-label') ?? '';
    expect(label).toContain('78%');
    expect(label).toContain('93');
    expect(label).toContain('125');
  });

  it('renders "on track" text when gradTerm is provided', () => {
    const { container } = render(
      <DegreeRadial
        buckets={SAMPLE_BUCKETS}
        pct={78}
        done={93}
        total={125}
        gradTerm="Spring 2028"
        hrsToGo={32}
      />
    );
    expect(container.textContent).toContain('on track');
  });

  it('renders without crash at pct=100 (all complete)', () => {
    const completeBuckets: BucketView[] = SAMPLE_BUCKETS.map((b) => ({
      ...b,
      doneHours: b.totalHours,
      complete: true,
      remaining: [],
    }));
    render(
      <DegreeRadial
        buckets={completeBuckets}
        pct={100}
        done={125}
        total={125}
        hrsToGo={0}
      />
    );
    expect(screen.getByRole('img')).toBeDefined();
  });

  it('renders without crash when given empty buckets', () => {
    render(
      <DegreeRadial
        buckets={[]}
        pct={0}
        done={0}
        total={125}
        hrsToGo={125}
      />
    );
    expect(screen.getByRole('img')).toBeDefined();
  });

  it('clamps pct above 100 to 100', () => {
    const { container } = render(
      <DegreeRadial
        buckets={SAMPLE_BUCKETS}
        pct={120}
        done={150}
        total={125}
        hrsToGo={0}
      />
    );
    // Should not throw and should show 100%
    expect(container.textContent).toContain('100%');
  });
});
