import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Shows a message instead of a blank page when anything below it throws while rendering. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    // Vercel's runtime logs don't see the browser, so the console is where details go for now.
    console.error('Unhandled error', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <main role="alert">
          <h1>Something went wrong</h1>
          <p>The page hit an error it couldn't recover from. Your saved data is safe.</p>
          <p>
            <code>{this.state.error.message}</code>
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload the page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
