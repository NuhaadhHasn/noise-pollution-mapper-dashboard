import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Bug } from 'lucide-react';

interface FallbackRenderProps {
  error: Error;
  /** Clear the error and render the children again. */
  reset: () => void;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Render the fallback from the caught error. Takes precedence over `fallback`. */
  fallbackRender?: (props: FallbackRenderProps) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallbackRender && this.state.error) {
        return this.props.fallbackRender({ error: this.state.error, reset: this.handleReset });
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 p-6 text-center">
            <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            
            <h3 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">
              Oops! Something went wrong
            </h3>
            
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">
              We encountered an error while loading this section.
            </p>
            
            {this.state.error && (
              <div className="mb-4 p-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-left">
                <p className="text-xs font-mono text-red-800 dark:text-red-200 break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                <RefreshCcw className="w-4 h-4" />
                Reload Page
              </button>
              
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm font-medium"
              >
                <Bug className="w-4 h-4" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface CardBoundaryProps {
  /** Names the card in the fallback, for example "Category chart". */
  label: string;
  children: ReactNode;
}

/**
 * sec-1: a per-card boundary. A card that throws while rendering (for example
 * on a malformed reading) is replaced by this compact notice, and the rest of
 * the page keeps working. "Try again" renders the card once more.
 */
export function CardBoundary({ label, children }: CardBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackRender={({ reset }) => (
        <div
          role="alert"
          className="p-4 sm:p-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-900 dark:text-red-100">
                {label} could not be displayed
              </p>
              <p className="text-xs mt-1 text-red-800 dark:text-red-200">
                Some of the data could not be shown here. The rest of the page still works.
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-300 dark:border-red-700 text-xs font-medium text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
              >
                <RefreshCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Try again
              </button>
            </div>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
