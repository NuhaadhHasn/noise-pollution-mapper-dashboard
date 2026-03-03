import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Database, Volume2, TrendingUp, Users } from 'lucide-react';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';

export function StatsCards() {
  const { isDarkMode, getCardColor } = useTheme();
  const { readings } = useSyncedReadings();

  // Calculate statistics from synced readings
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

  const stats = {
    totalReadings,
    avgNoiseLevel: Math.round(avgNoiseLevel * 10) / 10,
    maxNoiseLevel: Math.round(maxNoiseLevel * 10) / 10,
    activeContributors,
  };

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
