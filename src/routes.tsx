import { Routes, Route, Navigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import MapPage from '@/pages/MapPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import ProtectedRoute from '@/components/ProtectedRoute';

function AppRoutes() {
  const { getBackgroundColor } = useTheme();

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{ backgroundColor: getBackgroundColor() }}
    >
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/map"
          element={
            <ProtectedRoute>
              <MapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <AnalyticsPage />
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
