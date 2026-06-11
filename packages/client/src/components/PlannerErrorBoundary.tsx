/**
 * PlannerErrorBoundary — C1 fix (TASK-060)
 * RecoverableErrorBoundary — TASK-061 Workstream A
 *
 * PlannerErrorBoundary: wraps the planner subtree so a render throw degrades
 * to a recoverable fallback instead of blanking the entire app.
 *
 * RecoverableErrorBoundary: generic version for independently-failable subtrees
 * (chat panel, what-if panel, scheduler page) so one panel's throw doesn't take
 * down the whole app. Accepts a `label` prop for the fallback message.
 *
 * Both are class components — React error boundaries require componentDidCatch /
 * getDerivedStateFromError (no hooks equivalent as of React 18).
 */

import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

interface RecoverableErrorBoundaryProps {
  /** Short label shown in the fallback, e.g. "chat panel" */
  label?: string;
  children: React.ReactNode;
}

/**
 * Generic recoverable error boundary for independently-failable subtrees.
 * Shows a compact "Try again" fallback without blocking the rest of the UI.
 */
export class RecoverableErrorBoundary extends React.Component<RecoverableErrorBoundaryProps, State> {
  constructor(props: RecoverableErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const label = (this.props as RecoverableErrorBoundaryProps).label ?? 'panel';
    console.error(`[RecoverableErrorBoundary:${label}] caught render error:`, error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    const label = (this.props as RecoverableErrorBoundaryProps).label ?? 'panel';
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
          <p className="text-sm font-semibold text-destructive">
            The {label} encountered an error.
          </p>
          <p className="text-xs text-muted-foreground max-w-[220px]">
            {this.state.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export class PlannerErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // Log for developer visibility without crashing the app.
    console.error('[PlannerErrorBoundary] caught render error:', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <p className="text-base font-semibold text-destructive">
            Something went wrong rendering the planner.
          </p>
          <p className="text-sm text-muted-foreground max-w-sm">
            {this.state.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
