import { describe, it, expect } from 'vitest';
import { proposePlanEdit } from '../propose-plan-edit';
import { FIXTURE_CTX } from './fixture';

describe('proposePlanEdit', () => {
  it('returns a proposal for a valid add operation', () => {
    const result = proposePlanEdit(FIXTURE_CTX, {
      operations: [{ op: 'add', courseId: 'ECE 312', semesterId: 'Fall 2026' }],
      reasoning: 'ECE 312 fits well here.',
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.type).toBe('plan_edit_proposal');
    expect((content.proposal as Record<string, unknown>).reasoning).toBe('ECE 312 fits well here.');
  });

  it('returns a proposal for a valid move operation', () => {
    const result = proposePlanEdit(FIXTURE_CTX, {
      operations: [{ op: 'move', courseId: 'ECE 302', fromSemesterId: 'Spring 2026', toSemesterId: 'Fall 2026' }],
      reasoning: 'Moving to spread load.',
    });
    expect(result.isError).toBeFalsy();
  });

  it('returns error if operations is empty', () => {
    const result = proposePlanEdit(FIXTURE_CTX, {
      operations: [],
      reasoning: 'No ops.',
    });
    expect(result.isError).toBe(true);
  });

  it('returns error if reasoning is missing', () => {
    const result = proposePlanEdit(FIXTURE_CTX, {
      operations: [{ op: 'add', courseId: 'ECE 312', semesterId: 'Fall 2026' }],
      reasoning: '',
    });
    expect(result.isError).toBe(true);
  });

  it('returns error for invalid op type', () => {
    const result = proposePlanEdit(FIXTURE_CTX, {
      operations: [{ op: 'zap', courseId: 'ECE 312', semesterId: 'Fall 2026' }],
      reasoning: 'bad op',
    });
    expect(result.isError).toBe(true);
  });
});
