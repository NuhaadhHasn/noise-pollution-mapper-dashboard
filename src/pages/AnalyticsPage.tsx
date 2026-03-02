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

export default function AnalyticsPage() {
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className={cn(
              'text-xl sm:text-2xl font-bold transition-colors',
              isDarkMode ? 'text-white' : 'text-gray-900'
            )}>
              📈 Analytics Dashboard
            </h2>
            <p className={cn(
              'text-sm sm:text-base transition-colors',
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            )}>
              Comprehensive noise pollution analysis for Sri Lanka
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/dashboard')}
            className="text-xs sm:text-sm"
          >
            <MapPin className="w-3 h-3 mr-1" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      {/* Stats Cards with Real Data */}
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
              Analyzing {markerCount.toLocaleString()} noise readings
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
      </div>
    </div>
  );
}
