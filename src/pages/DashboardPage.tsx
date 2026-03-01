// noinspection JSUnusedLocalSymbols
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Database, Volume2, TrendingUp, Users, MapPin, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MapComponent } from '@/components/map/MapContainer';
import { NoiseMarkers } from '@/components/map/NoiseMarkers';
import MarkerClusterGroup from '@/components/map/MarkerClusterGroup';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { isDarkMode, getCardColor } = useTheme();
  const [markerCount, setMarkerCount] = useState(0);

  // Fetch marker count from Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'noise_readings'), (snapshot) => {
      setMarkerCount(snapshot.size);
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

      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Stats Cards */}
        <div
          className="p-4 sm:p-6 rounded-lg shadow-lg transition-colors"
          style={{ backgroundColor: getCardColor() }}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs sm:text-sm font-medium text-gray-500">Total Readings</h3>
            <Database className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <p className={cn(
            'text-2xl sm:text-3xl font-bold transition-colors',
            isDarkMode ? 'text-white' : 'text-gray-900'
          )}>
            {markerCount.toLocaleString()}
          </p>
        </div>

        <div
          className="p-4 sm:p-6 rounded-lg shadow-lg transition-colors"
          style={{ backgroundColor: getCardColor() }}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs sm:text-sm font-medium text-gray-500">Avg Noise Level</h3>
            <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <p className={cn(
            'text-2xl sm:text-3xl font-bold transition-colors',
            isDarkMode ? 'text-white' : 'text-gray-900'
          )}>
            65.2 dB
          </p>
        </div>

        <div
          className="p-4 sm:p-6 rounded-lg shadow-lg transition-colors"
          style={{ backgroundColor: getCardColor() }}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs sm:text-sm font-medium text-gray-500">Peak Noise</h3>
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <p className={cn(
            'text-2xl sm:text-3xl font-bold transition-colors',
            isDarkMode ? 'text-white' : 'text-gray-900'
          )}>
            98 dB
          </p>
        </div>

        <div
          className="p-4 sm:p-6 rounded-lg shadow-lg transition-colors"
          style={{ backgroundColor: getCardColor() }}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs sm:text-sm font-medium text-gray-500">Active Users</h3>
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <p className={cn(
            'text-2xl sm:text-3xl font-bold transition-colors',
            isDarkMode ? 'text-white' : 'text-gray-900'
          )}>
            47
          </p>
        </div>
      </div>

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
          <div className="h-64 sm:h-80 lg:h-96 w-full overflow-auto">
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
          </div>
        </div>
      </div>

      {/* Analytics Section */}
      <div className="mt-4 sm:mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className={cn(
            'text-base sm:text-lg font-semibold transition-colors',
            isDarkMode ? 'text-white' : 'text-gray-900'
          )}>
            📈 Analytics Dashboard
          </h3>
          <span className={cn(
            'text-xs sm:text-sm transition-colors',
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          )}>
            Phase 2.3 - Coming Soon
          </span>
        </div>
        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3">
          <div
            className="p-4 sm:p-6 rounded-lg shadow-lg h-48 sm:h-64 flex flex-col items-center justify-center transition-colors border-2 border-dashed"
            style={{
              backgroundColor: getCardColor(),
              borderColor: isDarkMode ? '#4A4458' : '#E0E0E0'
            }}
          >
            <div className="text-3xl mb-2">📈</div>
            <p className={cn(
              'text-xs sm:text-sm font-medium text-center transition-colors',
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            )}>
              Noise Trend Chart
            </p>
            <p className={cn(
              'text-xs text-center transition-colors mt-1',
              isDarkMode ? 'text-gray-500' : 'text-gray-500'
            )}>
              Daily/Weekly/Monthly trends
            </p>
          </div>
          <div
            className="p-4 sm:p-6 rounded-lg shadow-lg h-48 sm:h-64 flex flex-col items-center justify-center transition-colors border-2 border-dashed"
            style={{
              backgroundColor: getCardColor(),
              borderColor: isDarkMode ? '#4A4458' : '#E0E0E0'
            }}
          >
            <div className="text-3xl mb-2">📊</div>
            <p className={cn(
              'text-xs sm:text-sm font-medium text-center transition-colors',
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            )}>
              By Category
            </p>
            <p className={cn(
              'text-xs text-center transition-colors mt-1',
              isDarkMode ? 'text-gray-500' : 'text-gray-500'
            )}>
              Average dB per sound type
            </p>
          </div>
          <div
            className="p-4 sm:p-6 rounded-lg shadow-lg h-48 sm:h-64 flex flex-col items-center justify-center transition-colors border-2 border-dashed"
            style={{
              backgroundColor: getCardColor(),
              borderColor: isDarkMode ? '#4A4458' : '#E0E0E0'
            }}
          >
            <div className="text-3xl mb-2">🥧</div>
            <p className={cn(
              'text-xs sm:text-sm font-medium text-center transition-colors',
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            )}>
              Sound Type Distribution
            </p>
            <p className={cn(
              'text-xs text-center transition-colors mt-1',
              isDarkMode ? 'text-gray-500' : 'text-gray-500'
            )}>
              Pollution vs Ambient ratio
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
