import { AlertTriangle, RefreshCcw, Home, Bug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface GlobalErrorPageProps {
  error?: Error;
  errorInfo?: string;
  onReset?: () => void;
}

export function GlobalErrorPage({ error, errorInfo, onReset }: GlobalErrorPageProps) {
  const navigate = useNavigate();

  const handleReload = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-lg w-full rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 p-8">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 mb-6">
          <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100 mb-3">
          Oops! Something went wrong
        </h1>

        {/* Description */}
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          We encountered an unexpected error. Don't worry, our team has been notified
          and we're working to fix it.
        </p>

        {/* Error Details */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-3">
              <Bug className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Error Details:
                </p>
                <p className="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
                  {error.message}
                </p>
                {errorInfo && (
                  <p className="text-xs font-mono text-gray-500 dark:text-gray-500 mt-2 break-all">
                    {errorInfo}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleGoHome}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            <Home className="w-4 h-4" />
            Go Home
          </button>

          <button
            onClick={onReset || handleReload}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            <RefreshCcw className="w-4 h-4" />
            {onReset ? 'Try Again' : 'Reload Page'}
          </button>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            If the problem persists, please try clearing your browser cache or
            contact support.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Noise Pollution Mapper Dashboard • Academic Project (CIS6035)
          </p>
        </div>
      </div>
    </div>
  );
}

export default GlobalErrorPage;
