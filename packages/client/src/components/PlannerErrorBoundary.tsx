/**
 * PlannerErrorBoundary — C1 fix (TASK-060)
 *
 * Wraps the planner subtree so a render throw (e.g. from undefined courseId)
 * degrades to a recoverable fallback instead of blanking the entire app.
 * Class component — React error boundaries require componentDidCatch /
 * getDerivedStateFromError (no hooks equivalent as of React 18).
 */

import React from 'react';

interface State {
  hasError: boolean;
  message: string;
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
