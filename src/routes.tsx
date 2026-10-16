import { lazy, Suspense, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Skeleton } from '@/components/ui/skeleton';

// Route-level code splitting (perf-5). Each page is its own chunk, so recharts
// loads only for /dashboard and /analytics and Leaflet only for /dashboard and
// /map. Do not turn these back into static imports: a static import of any page
// pulls that page's whole dependency tree into the entry chunk again.
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const MapPage = lazy(() => import('@/pages/MapPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));

/** Shown in place of a page while its chunk downloads. */
function PageSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6"
    >
      <span className="sr-only">Loading page</span>
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** One Suspense boundary per page, so a page chunk never suspends the whole app. */
function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

function AppRoutes() {
  const { getBackgroundColor } = useTheme();

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{ backgroundColor: getBackgroundColor() }}
    >
      <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={
            <PageSuspense>
              <LoginPage />
            </PageSuspense>
          }
        />

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <PageSuspense>
                <DashboardPage />
              </PageSuspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/map"
          element={
            <ProtectedRoute>
              <PageSuspense>
                <MapPage />
              </PageSuspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <PageSuspense>
                <AnalyticsPage />
              </PageSuspense>
            </ProtectedRoute>
          }
        />

        {/* Default redirect to dashboard (will check auth) */}
        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />
      </Routes>
    </div>
  );
}

export default AppRoutes;
