// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CourseDetailDialog from './CourseDetailDialog';
import { UiProvider } from '@/context/UiContext';
import type { TechCores } from '@/types';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// The dialog pulls data hooks for sections, profile, prereqs. None of that is
// under test here; we only exercise the FR6 "You may also like" wiring, so the
// recommender (getRelatedCourses) runs for real against this small fixture.

const TECH_CORES_FIXTURE: TechCores = {
  electronics_integrated_circuits: {
    name: 'Electronics and Integrated Circuits',
    graduate_track: 'Integrated Circuits and Systems (ICS)',
    category: 'EE',
    required_math: 'M 427L',
    required_courses: {
      core: [{ id: 'ECE 325', title: 'Electromagnetic Engineering' }],
    },
    elective_count: { general: 3, ecb: 2 },
    elective_pool: ['ECE 339', 'ECE 438'],
  },
};

vi.mock('@/context/DataContext', () => ({
  useFallSections: () => [],
  useUserProfile: () => null,
  useTechCoresRecord: () => TECH_CORES_FIXTURE,
  useSyllabi: () => null,
}));

vi.mock('@/hooks/usePrereqGraph', () => ({
  usePrereqGraph: () => ({
    getPrereqs: () => [],
    getCoreqs: () => [],
    getDownstream: () => [],
  }),
}));

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  catalog: null,
  gradeDistributions: {},
  prereqNodes: {},
};

afterEach(cleanup);

function renderWithUi(ui: React.ReactElement) {
  return render(<UiProvider>{ui}</UiProvider>);
}

describe('CourseDetailDialog — "You may also like" (FR6)', () => {
  it('renders the related-courses section with co-members of the same tech core', () => {
    renderWithUi(<CourseDetailDialog {...baseProps} courseId="ECE 438" />);

    const heading = screen.getByText('You may also like');
    expect(heading).toBeTruthy();

    // ECE 325 (core) and ECE 339 (pool) are co-members of Electronics & ICs.
    expect(screen.getByRole('button', { name: /ECE 325/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ECE 339/ })).toBeTruthy();
    // Reason is shown.
    expect(screen.getAllByText(/Also in Electronics and Integrated Circuits/).length).toBeGreaterThan(0);
  });

  it('omits the section entirely when there are no recommendations', () => {
    // BIO 101 shares no prefix with anything in the fixture, so neither the
    // core-membership pass nor the same-prefix fallback finds anything → [].
    renderWithUi(<CourseDetailDialog {...baseProps} courseId="BIO 101" />);
    expect(screen.queryByText('You may also like')).toBeNull();
  });

  it('clicking a recommendation re-targets the dialog at that course', () => {
    renderWithUi(<CourseDetailDialog {...baseProps} courseId="ECE 438" />);

    // The header id badge reflects the active course.
    const dialog = screen.getByRole('dialog');
    const headerBadge = within(dialog).getByText('ECE 438', {
      selector: 'div',
    });
    expect(headerBadge).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /ECE 325/ }));

    // Now the dialog is showing ECE 325; the header id badge updates and its
    // related list (excluding itself) now offers ECE 438.
    expect(within(dialog).getByText('ECE 325', { selector: 'div' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ECE 438/ })).toBeTruthy();
  });
});
