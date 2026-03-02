import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { NoiseReading } from '@/types/NoiseReading';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Database, Volume2, TrendingUp, Users } from 'lucide-react';

interface StatsData {
  totalReadings: number;
  avgNoiseLevel: number;
  maxNoiseLevel: number;
  activeContributors: number;
}

export function StatsCards() {
  const { isDarkMode, getCardColor } = useTheme();
  const [stats, setStats] = useState<StatsData>({
    totalReadings: 0,
    avgNoiseLevel: 0,
    maxNoiseLevel: 0,
    activeContributors: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'noise_readings'),
      (snapshot) => {
        const readings: NoiseReading[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as NoiseReading[];

        // Calculate statistics
        const totalReadings = readings.length;
        const decibelLevels = readings.map((r) => r.decibelLevel).filter((db) => db !== undefined);
        
        const avgNoiseLevel = decibelLevels.length > 0
          ? decibelLevels.reduce((sum, db) => sum + db, 0) / decibelLevels.length
          : 0;
        
        const maxNoiseLevel = decibelLevels.length > 0
          ? Math.max(...decibelLevels)
          : 0;

        // Count unique contributors (userIds)
        const uniqueUsers = new Set(readings.map((r) => r.userId).filter((id) => id !== undefined));
        const activeContributors = uniqueUsers.size;

        setStats({
          totalReadings,
          avgNoiseLevel: Math.round(avgNoiseLevel * 10) / 10,
          maxNoiseLevel: Math.round(maxNoiseLevel * 10) / 10,
          activeContributors,
        });
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching stats:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
              isDarkMode ? "bg-[#322E4A]" : "bg-white"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={cn("h-4 w-24 rounded", isDarkMode ? "bg-gray-700" : "bg-gray-200")} />
              <div className={cn("h-5 w-5 rounded", isDarkMode ? "bg-gray-700" : "bg-gray-200")} />
            </div>
            <div className={cn("h-8 w-16 rounded", isDarkMode ? "bg-gray-700" : "bg-gray-200")} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total Readings */}
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
          {stats.totalReadings.toLocaleString()}
        </p>
      </div>

      {/* Average Noise Level */}
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
          {stats.avgNoiseLevel} <span className="text-sm font-normal text-gray-500">dB</span>
        </p>
      </div>

      {/* Peak Noise */}
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
          {stats.maxNoiseLevel} <span className="text-sm font-normal text-gray-500">dB</span>
        </p>
      </div>

      {/* Active Contributors */}
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
          {stats.activeContributors.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
