// @vitest-environment jsdom
/**
 * RequirementCard / RequirementCards — TASK-098
 *
 * Black-box checks:
 *   1. An in-progress bucket renders its remaining[] course IDs.
 *   2. A completed bucket renders a "Complete" indicator, not a "Still need" block.
 *   3. RequirementCards sorts incomplete buckets before completed ones.
 *   4. Sub-requirement chips are rendered when bucket.subRequirements is set.
 *   5. A note-only remaining entry (no courseId) renders the note text.
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Mock analytics and navigate so we don't need the full app context
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import { RequirementCard, RequirementCards } from './RequirementCards';
import type { BucketView } from '@/types';

afterEach(cleanup);

const incompleteEceCore: BucketView = {
  id: 'ece_core',
  label: 'ECE Core',
  category: 'ece_core',
  doneHours: 26,
  totalHours: 32,
  unit: 'hrs',
  complete: false,
  doneCount: 8,
  totalCount: 10,
  countNoun: 'courses',
  remaining: [
    { courseId: 'ECE 351K', title: 'Probability & Random Processes' },
    { courseId: 'ECE 464x', title: 'Senior Design' },
  ],
};

const completeMath: BucketView = {
  id: 'math',
  label: 'Math',
  category: 'math',
  doneHours: 15,
  totalHours: 15,
  unit: 'hrs',
  complete: true,
  remaining: [],
};

const incompleteGenEd: BucketView = {
  id: 'gen_ed',
  label: 'Core Curriculum',
  category: 'gen_ed',
  doneHours: 24,
  totalHours: 27,
  unit: 'hrs',
  complete: false,
  doneCount: 8,
  totalCount: 9,
  countNoun: 'slots',
  subRequirements: [
    { label: 'UGS', status: 'done' },
    { label: 'Gov II', status: 'missing' },
  ],
  remaining: [{ courseId: 'GOV 312L', title: 'American Government II' }],
};

const incompleteFreeElec: BucketView = {
  id: 'free_elec',
  label: 'Free Electives',
  category: 'elective',
  doneHours: 3,
  totalHours: 14,
  unit: 'hrs',
  complete: false,
  remaining: [{ note: '11 hrs of advanced ECE 320+ electives' }],
};

function wrap(el: React.ReactElement) {
  return render(<MemoryRouter>{el}</MemoryRouter>);
}

describe('RequirementCard', () => {
  it('renders remaining courseIds for an incomplete bucket', () => {
    wrap(<RequirementCard bucket={incompleteEceCore} />);
    expect(screen.getByText(/ECE 351K/)).toBeDefined();
    expect(screen.getByText(/ECE 464x/)).toBeDefined();
  });

  it('renders the "Still need:" heading when remaining is non-empty', () => {
    wrap(<RequirementCard bucket={incompleteEceCore} />);
    expect(screen.getByText('Still need:')).toBeDefined();
  });

  it('renders note-only remaining entry without a courseId', () => {
    wrap(<RequirementCard bucket={incompleteFreeElec} />);
    expect(screen.getByText(/11 hrs of advanced ECE 320\+/)).toBeDefined();
  });

  it('completed bucket renders ✓ Complete, not "Still need"', () => {
    wrap(<RequirementCard bucket={completeMath} />);
    expect(screen.getByText(/Complete/)).toBeDefined();
    expect(screen.queryByText('Still need:')).toBeNull();
  });

  it('completed bucket does not render action button for adding courses', () => {
    wrap(<RequirementCard bucket={completeMath} />);
    // Completed card has no "Add to plan" button
    expect(screen.queryByText('Add to plan')).toBeNull();
  });

  it('renders sub-requirement chips when bucket.subRequirements is set', () => {
    wrap(<RequirementCard bucket={incompleteGenEd} />);
    expect(screen.getByText(/UGS/)).toBeDefined();
    expect(screen.getByText(/Gov II/)).toBeDefined();
  });

  it('incomplete card renders an action button', () => {
    wrap(<RequirementCard bucket={incompleteEceCore} />);
    // "Add to plan" is the default action for ECE Core
    expect(screen.getByRole('button', { name: /add to plan/i })).toBeDefined();
  });

  it('renders card test id by bucket id', () => {
    wrap(<RequirementCard bucket={incompleteEceCore} />);
    expect(screen.getByTestId('req-card-ece_core')).toBeDefined();
  });
});

describe('RequirementCards', () => {
  it('renders all buckets', () => {
    const buckets = [incompleteEceCore, completeMath, incompleteGenEd];
    wrap(<RequirementCards buckets={buckets} />);
    expect(screen.getByTestId('req-card-ece_core')).toBeDefined();
    expect(screen.getByTestId('req-card-math')).toBeDefined();
    expect(screen.getByTestId('req-card-gen_ed')).toBeDefined();
  });

  it('incomplete buckets appear before completed buckets in DOM order', () => {
    const buckets = [completeMath, incompleteEceCore, incompleteGenEd];
    const { container } = wrap(<RequirementCards buckets={buckets} />);
    const cards = container.querySelectorAll('[data-testid^="req-card-"]');
    const ids = [...cards].map((c) => c.getAttribute('data-testid'));
    // completeMath should appear AFTER the two incomplete buckets
    const mathIdx = ids.indexOf('req-card-math');
    const eceIdx = ids.indexOf('req-card-ece_core');
    const genEdIdx = ids.indexOf('req-card-gen_ed');
    expect(eceIdx).toBeLessThan(mathIdx);
    expect(genEdIdx).toBeLessThan(mathIdx);
  });
});
