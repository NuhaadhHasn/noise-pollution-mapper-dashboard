import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { MapPin, ExternalLink, Download, FileJson, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { StatsCards } from '@/components/analytics/StatsCards';
import { NoiseTrendChart } from '@/components/analytics/NoiseTrendChart';
import { CategoryChart } from '@/components/analytics/CategoryChart';
import { SoundTypeChart } from '@/components/analytics/SoundTypeChart';
import { DataTable } from '@/components/analytics/DataTable';
import { exportToCSV, exportToJSON } from '@/utils/exportHelpers';
import type { NoiseReading } from '@/types/NoiseReading';
import { fetchAllUsers, type UserInfo } from '@/services/userService';

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [markerCount, setMarkerCount] = useState(0);
  const [readings, setReadings] = useState<NoiseReading[]>([]);
  const [userMap, setUserMap] = useState<Map<string, UserInfo>>(new Map());

  // Fetch data from Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'noise_readings'), (snapshot) => {
      setMarkerCount(snapshot.size);
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as NoiseReading[];
      setReadings(data);
    });
    return () => unsubscribe();
  }, []);

  // Fetch users for email lookup
  useEffect(() => {
    fetchAllUsers().then((map) => {
      setUserMap(map);
    });
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

        {/* Export Buttons */}
        <div className="mt-6 data-export-section">
          <div className="flex items-center justify-between mb-4">
            <h3 className={cn(
              'text-base sm:text-lg font-semibold transition-colors',
              isDarkMode ? 'text-white' : 'text-gray-900'
            )}>
              📊 Data Export
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToCSV(readings, userMap, 'noise_readings')}
                disabled={readings.length === 0}
                className="text-xs sm:text-sm"
              >
                <Download className="w-3 h-3 mr-1" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToJSON(readings, 'noise_readings')}
                disabled={readings.length === 0}
                className="text-xs sm:text-sm"
              >
                <FileJson className="w-3 h-3 mr-1" />
                Export JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="text-xs sm:text-sm"
              >
                <Printer className="w-3 h-3 mr-1" />
                Print
              </Button>
            </div>
          </div>

          {/* Data Table */}
          <DataTable data={readings} userMap={userMap} />
        </div>
      </div>
    </div>
  );
}
