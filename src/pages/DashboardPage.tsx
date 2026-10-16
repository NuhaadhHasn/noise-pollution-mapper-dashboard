// noinspection JSUnusedLocalSymbols
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { MapPin, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useMemo } from 'react';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { CardBoundary, ErrorBoundary } from '@/components/ErrorBoundary';
import { MapComponent } from '@/components/map/MapContainer';
import { NoiseMarkers } from '@/components/map/NoiseMarkers';
import MarkerClusterGroup from '@/components/map/MarkerClusterGroup';
import { StatsCards } from '@/components/analytics/StatsCards';
import { NoiseTrendChart } from '@/components/analytics/NoiseTrendChart';
import { CategoryChart } from '@/components/analytics/CategoryChart';
import { SoundTypeChart } from '@/components/analytics/SoundTypeChart';
import { StatsCardsSkeleton } from '@/components/analytics/StatsCardsSkeleton';
import { ChartSkeleton } from '@/components/analytics/ChartSkeleton';
import { MapSkeleton } from '@/components/map/MapSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { EmptyStateActions } from '@/components/EmptyStateActions';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { isDarkMode, getCardColor } = useTheme();
  // Everything on the Overview comes from the shared IndexedDB cache (perf-1).
  // There is no Firestore listener here: opening this page costs no reads
  // beyond the ReadingsProvider's single delta sync, and the skeletons wait
  // for the cache, never for a network round-trip.
  const { readings, loading: isLoading, error, syncing, refresh } = useSyncedReadings();
  const hasData = readings.length > 0;
  // One source for the badge: cached readings that have a usable position.
  const markerCount = useMemo(
    () => readings.filter((reading) => Number.isFinite(reading.latitude) && Number.isFinite(reading.longitude)).length,
    [readings],
  );

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <header className="mb-4 sm:mb-6">
        <h2 className={cn(
          'text-xl sm:text-2xl font-bold transition-colors',
          isDarkMode ? 'text-white' : 'text-gray-900'
        )}>
          Dashboard Overview
        </h2>
        <p className={cn(
          'text-sm sm:text-base transition-colors',
          isDarkMode ? 'text-gray-400' : 'text-gray-600'
        )}>
          Real-time noise pollution monitoring for Sri Lanka
        </p>
      </header>

      {/* The last sync failed but cached readings exist: keep showing them, and say so */}
      {error && hasData && (
        <div
          role="alert"
          className={cn(
            'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg border text-sm',
            isDarkMode ? 'bg-red-950/40 border-red-900 text-red-200' : 'bg-red-50 border-red-200 text-red-800'
          )}
        >
          <span>Could not sync new readings. Showing the readings cached in this browser.</span>
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={syncing}>
            Retry
          </Button>
        </div>
      )}

      {/* Stats Cards with Real Data */}
      {isLoading ? (
        <StatsCardsSkeleton />
      ) : hasData ? (
        <CardBoundary label="Summary statistics">
          <StatsCards />
        </CardBoundary>
      ) : error ? (
        <EmptyState
          variant="error"
          title="Could not load readings"
          description="The readings could not be downloaded. Check your connection and try again."
          action={
            <Button onClick={() => void refresh()} disabled={syncing}>
              Retry
            </Button>
          }
        />
      ) : (
        <EmptyState
          variant="no-data"
          title="No Data Available"
          description="No readings have been uploaded from the mobile app yet."
          action={
            <EmptyStateActions.ViewAnalytics onClick={() => navigate('/analytics')} />
          }
        />
      )}

      {/* Map Section - ACTUAL MAP INTEGRATION */}
      <div className="mt-4 sm:mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className={cn(
            'text-base sm:text-lg font-semibold transition-colors',
            isDarkMode ? 'text-white' : 'text-gray-900'
          )}>
            📍 Noise Map
          </h3>
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-xs sm:text-sm transition-colors px-2 py-1 rounded-md',
              isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
            )}>
              <MapPin className="w-3 h-3 inline mr-1" />
              {markerCount} markers
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/map')}
              className="text-xs sm:text-sm"
            >
              View Full Map
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
        <div
          className="rounded-lg shadow-lg overflow-hidden border-2 transition-colors relative"
          style={{
            backgroundColor: getCardColor(),
            borderColor: isDarkMode ? '#4A4458' : '#E0E0E0'
          }}
        >
          <div className="h-64 sm:h-72 lg:h-80 w-full overflow-hidden">
            {isLoading ? (
              <MapSkeleton showHeader={false} showControls={false} />
            ) : (
              <ErrorBoundary fallback={
                <div
                  className="h-full w-full flex items-center justify-center"
                  style={{
                    background: isDarkMode
                      ? 'linear-gradient(135deg, #1e1932 0%, #2d2640 100%)'
                      : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                  }}
                >
                  <div className="text-center p-4">
                    <div className="text-4xl mb-2">🗺️</div>
                    <p className={cn(
                      'text-sm sm:text-base font-medium transition-colors',
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    )}>
                      Map failed to load
                    </p>
                    <p className={cn(
                      'text-xs sm:text-sm transition-colors mt-1',
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    )}>
                      Click "View Full Map" to try again
                    </p>
                  </div>
                </div>
              }>
                <MapComponent>
                  <MarkerClusterGroup>
                    <NoiseMarkers readings={readings} />
                  </MarkerClusterGroup>
                </MapComponent>
              </ErrorBoundary>
            )}
          </div>
        </div>
      </div>

      {/* Analytics Section - REAL CHARTS */}
      <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-6">
        {isLoading ? (
          <>
            <ChartSkeleton />
            <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
              <ChartSkeleton showLegend />
              <ChartSkeleton />
            </div>
          </>
        ) : hasData ? (
          <>
            {/* Noise Trend Chart (Full Width) */}
            <CardBoundary label="Noise trend chart">
              <NoiseTrendChart />
            </CardBoundary>

            {/* Category and Sound Type Charts (Side by Side) */}
            <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
              <CardBoundary label="Category chart">
                <CategoryChart />
              </CardBoundary>
              <CardBoundary label="Sound type chart">
                <SoundTypeChart />
              </CardBoundary>
            </div>
          </>
        ) : (
          <EmptyState
            variant={error ? 'error' : 'no-data'}
            title={error ? 'Analytics unavailable' : 'No Analytics Data'}
            description={
              error
                ? 'Analytics appear once the readings have been downloaded.'
                : 'Analytics appear here once the mobile app has uploaded readings.'
            }
          />
        )}
      </div>
    </div>
  );
}
