// noinspection JSUnusedLocalSymbols
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { MapPin, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
  const [markerCount, setMarkerCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  // Fetch marker count from Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'noise_readings'), (snapshot) => {
      setMarkerCount(snapshot.size);
      setHasData(snapshot.size > 0);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

      {/* Stats Cards with Real Data */}
      {isLoading ? (
        <StatsCardsSkeleton />
      ) : hasData ? (
        <StatsCards />
      ) : (
        <EmptyState
          variant="no-data"
          title="No Data Available"
          description="Start recording noise levels with the mobile app to see data here."
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
                      isDarkMode ? 'text-gray-500' : 'text-gray-500'
                    )}>
                      Click "View Full Map" to try again
                    </p>
                  </div>
                </div>
              }>
                <MapComponent>
                  <MarkerClusterGroup>
                    <NoiseMarkers onMarkersLoaded={setMarkerCount} />
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
            <NoiseTrendChart />

            {/* Category and Sound Type Charts (Side by Side) */}
            <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
              <CategoryChart />
              <SoundTypeChart />
            </div>
          </>
        ) : (
          <EmptyState
            variant="no-data"
            title="No Analytics Data"
            description="Analytics will appear here once you have recorded noise readings."
          />
        )}
      </div>
    </div>
  );
}
