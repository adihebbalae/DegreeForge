// @vitest-environment jsdom
/**
 * Unit tests for PlannerErrorBoundary and RecoverableErrorBoundary.
 * Verifies that captureException is called when a render error is caught,
 * and is NOT called when no error occurs.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { PlannerErrorBoundary, RecoverableErrorBoundary } from './PlannerErrorBoundary';

// Mock @/lib/analytics so captureException is observable without a real PostHog client.
const mockCaptureException = vi.fn();
vi.mock('@/lib/analytics', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// A component that throws on render to trigger the error boundary.
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('test explosion');
  return <div>ok</div>;
}

// Suppress expected React error output in test logs.
const originalConsoleError = console.error;
beforeEach(() => {
  mockCaptureException.mockClear();
  console.error = vi.fn();
  return () => {
    console.error = originalConsoleError;
  };
});

describe('PlannerErrorBoundary', () => {
  it('calls captureException with the error and boundary name when a render error is caught', () => {
    render(
      <PlannerErrorBoundary>
        <Bomb shouldThrow={true} />
      </PlannerErrorBoundary>
    );

    expect(mockCaptureException).toHaveBeenCalledOnce();
    const [caughtError, extra] = mockCaptureException.mock.calls[0];
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe('test explosion');
    expect(extra.boundary).toBe('PlannerErrorBoundary');
  });

  it('does NOT call captureException when there is no error', () => {
    render(
      <PlannerErrorBoundary>
        <Bomb shouldThrow={false} />
      </PlannerErrorBoundary>
    );

    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

describe('RecoverableErrorBoundary', () => {
  it('calls captureException with error + boundary label when a render error is caught', () => {
    render(
      <RecoverableErrorBoundary label="chat panel">
        <Bomb shouldThrow={true} />
      </RecoverableErrorBoundary>
    );

    expect(mockCaptureException).toHaveBeenCalledOnce();
    const [caughtError, extra] = mockCaptureException.mock.calls[0];
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe('test explosion');
    expect(extra.boundary).toBe('RecoverableErrorBoundary:chat panel');
  });

  it('does NOT call captureException when there is no error', () => {
    render(
      <RecoverableErrorBoundary label="chat panel">
        <Bomb shouldThrow={false} />
      </RecoverableErrorBoundary>
    );

    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
