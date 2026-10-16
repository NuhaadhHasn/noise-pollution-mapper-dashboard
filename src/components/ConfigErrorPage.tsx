import { Settings } from 'lucide-react';

interface ConfigErrorPageProps {
  /** Names of the missing environment variables. Names only, never values (build-3). */
  missing: readonly string[];
}

/**
 * Shown by main.tsx instead of the app when the Firebase web config is
 * incomplete (build-3). Like GlobalErrorPage it renders OUTSIDE every provider
 * and the router, so it uses no context and no router hooks.
 */
export function ConfigErrorPage({ missing }: ConfigErrorPageProps) {
  const many = missing.length !== 1;
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <main className="max-w-lg w-full rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 p-8">
        <div className="mx-auto w-20 h-20 flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 mb-6">
          <Settings className="w-10 h-10 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100 mb-3">
          The dashboard is not configured
        </h1>

        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          This build is missing {many ? 'Firebase settings' : 'a Firebase setting'}, so it cannot connect
          to the database.
        </p>

        <div className="mb-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Missing or empty:</p>
          <ul className="space-y-1">
            {missing.map((name) => (
              <li key={name} className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                {name}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Set {many ? 'them' : 'it'} in the <code className="font-mono">.env</code> file (copy{' '}
          <code className="font-mono">.env.example</code> and fill in the values from the Firebase
          console), or in the host&apos;s environment variables, then restart the dev server or rebuild
          and redeploy. These values are read when the app is built, so changing them on a running
          deployment has no effect until the next build.
        </p>
      </main>
    </div>
  );
}

export default ConfigErrorPage;
