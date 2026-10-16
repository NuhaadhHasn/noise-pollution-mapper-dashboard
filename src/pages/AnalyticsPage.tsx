import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { MapPin, ExternalLink, Download, FileJson, Printer, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StatsCards } from '@/components/analytics/StatsCards';
import { NoiseTrendChart } from '@/components/analytics/NoiseTrendChart';
import { CategoryChart } from '@/components/analytics/CategoryChart';
import { SoundTypeChart } from '@/components/analytics/SoundTypeChart';
import { DataTable } from '@/components/analytics/DataTable';
import { ChartSkeleton } from '@/components/analytics/ChartSkeleton';
import { exportToCSV, exportToJSON } from '@/utils/exportHelpers';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { useAuth } from '@/contexts/AuthContext';

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();

  // The shared, IndexedDB-cached readings (ReadingsProvider). `loading` covers
  // the first cache read or first download; `error` is the last failed sync.
  const { readings, loading, syncing, error, refresh } = useSyncedReadings();
  // sec-4 (D1-B): every signed-in account may view; only the admin role exports.
  const { role, roleLoading } = useAuth();
  const canExport = role === 'admin';
  const markerCount = readings.length;

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <header className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <div className="flex-1">
            <h2 className={cn(
              'text-xl sm:text-2xl font-bold transition-colors',
              isDarkMode ? 'text-white' : 'text-gray-900'
            )}>
              📈 Analytics
            </h2>
            <p className={cn(
              'text-xs sm:text-sm transition-colors mt-1',
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            )}>
              Comprehensive noise pollution analysis for Sri Lanka
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/dashboard')}
            className="w-full sm:w-auto text-xs sm:text-sm justify-start sm:justify-center"
          >
            <MapPin className="w-3 h-3 sm:mr-1" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </div>
      </header>

      {/* A failed sync is said out loud, with Retry, never shown as "no data" (ux-1) */}
      {error && (
        <div
          role="alert"
          className={cn(
            'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border',
            isDarkMode ? 'bg-red-950/40 border-red-900 text-red-200' : 'bg-red-50 border-red-200 text-red-800'
          )}
        >
          <div>
            <p className="text-sm font-semibold">Could not sync readings</p>
            <p className="text-xs mt-1">
              {readings.length > 0
                ? `Showing the ${readings.length.toLocaleString()} readings already cached in this browser.`
                : 'No readings are cached in this browser yet.'}
              {' '}({error.message})
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
            disabled={syncing}
            className="shrink-0"
          >
            <RefreshCw className={cn('w-3 h-3 mr-1', syncing && 'animate-spin')} />
            Retry
          </Button>
        </div>
      )}

      {/* Stats Cards with Real Data (a skeleton while the readings load) */}
      <StatsCards />

      {/* Marker Count Info */}
      <div
        className={cn(
          "p-4 rounded-lg shadow-lg transition-colors",
          isDarkMode ? "bg-[#322E4A]" : "bg-white"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin
              className="w-4 h-4"
              style={{ color: isDarkMode ? '#6C63FF' : '#6C63FF' }}
            />
            <span className={cn(
              "text-sm font-medium",
              isDarkMode ? "text-gray-300" : "text-gray-700"
            )}>
              {loading
                ? 'Loading readings...'
                : `Analyzing ${markerCount.toLocaleString()} noise readings${syncing ? ' (syncing...)' : ''}`}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/map')}
            className="text-xs sm:text-sm"
          >
            View on Map
            <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </div>

      {/* Analytics Section - REAL CHARTS */}
      <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-6">
        {/* Noise Trend Chart (Full Width) */}
        <NoiseTrendChart />

        {/* Category and Sound Type Charts (Side by Side) */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
          <CategoryChart />
          <SoundTypeChart />
        </div>

        {/* Export Buttons */}
        <div className="mt-6 data-export-section">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h3 className={cn(
              'text-base sm:text-lg font-semibold transition-colors',
              isDarkMode ? 'text-white' : 'text-gray-900'
            )}>
              📊 Data Export
            </h3>
            {!canExport && !roleLoading && (
              <p className={cn('text-xs', isDarkMode ? 'text-gray-400' : 'text-gray-600')}>
                CSV and JSON exports are limited to dashboard administrators.
              </p>
            )}
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToCSV(readings, 'noise_readings')}
                disabled={readings.length === 0 || !canExport}
                className="text-xs sm:text-sm flex-1 sm:flex-none min-w-[120px]"
              >
                <Download className="w-3 h-3 sm:mr-1" />
                <span className="hidden sm:inline">Export CSV</span>
                <span className="sm:hidden">CSV</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToJSON(readings, 'noise_readings')}
                disabled={readings.length === 0 || !canExport}
                className="text-xs sm:text-sm flex-1 sm:flex-none min-w-[120px]"
              >
                <FileJson className="w-3 h-3 sm:mr-1" />
                <span className="hidden sm:inline">Export JSON</span>
                <span className="sm:hidden">JSON</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="text-xs sm:text-sm flex-1 sm:flex-none min-w-[100px] w-full sm:w-auto"
              >
                <Printer className="w-3 h-3" />
                <span className="ml-1">Print</span>
              </Button>
            </div>
          </div>

          {/* Data Table (a skeleton while the readings load, never a false "No data") */}
          {loading ? <ChartSkeleton /> : <DataTable data={readings} />}
        </div>
      </div>
    </div>
  );
}
