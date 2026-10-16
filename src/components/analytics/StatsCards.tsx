import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Database, Volume2, TrendingUp, Users } from 'lucide-react';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { DB_CAVEAT } from '@/lib/noiseBands';
import { computeReadingStats } from '@/lib/readingStats';
import { StatsCardsSkeleton } from '@/components/analytics/StatsCardsSkeleton';

export function StatsCards() {
  const { isDarkMode, getCardColor } = useTheme();
  const { readings, loading, error } = useSyncedReadings();

  // ux-1: a skeleton while the readings load; "No data available" only after a
  // load that really found no readings, never while loading or after a failure.
  if (loading) {
    return <StatsCardsSkeleton />;
  }

  if (readings.length === 0) {
    return (
      <div
        className="p-4 sm:p-6 rounded-lg shadow-lg transition-colors"
        style={{ backgroundColor: getCardColor() }}
      >
        <p className={cn('text-sm font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
          {error ? 'Readings could not be loaded' : 'No data available'}
        </p>
        <p className="text-xs mt-1 text-gray-500">
          {error
            ? 'Check your connection, then press Retry.'
            : 'No readings have been uploaded from the mobile app yet.'}
        </p>
      </div>
    );
  }

  // bug-10: missing or non-finite dB is left out, min/max never spread an array
  const stats = computeReadingStats(readings);
  const dbOrDash = (value: number | null) => (value === null ? '—' : value);

  return (
    <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total Readings */}
      <div
        className="p-4 sm:p-6 rounded-lg shadow-lg transition-colors"
        style={{ backgroundColor: getCardColor() }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className={cn('text-xs sm:text-sm font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>Total Readings</h3>
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
          <h3 className={cn('text-xs sm:text-sm font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>Average (arithmetic)</h3>
          <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
        </div>
        <p className={cn(
          'text-2xl sm:text-3xl font-bold transition-colors',
          isDarkMode ? 'text-white' : 'text-gray-900'
        )}>
          {dbOrDash(stats.averageDb)} <span className={cn('text-sm font-normal', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>dB</span>
        </p>
      </div>

      {/* Peak Noise */}
      <div
        className="p-4 sm:p-6 rounded-lg shadow-lg transition-colors"
        style={{ backgroundColor: getCardColor() }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className={cn('text-xs sm:text-sm font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>Peak Noise</h3>
          <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
        </div>
        <p className={cn(
          'text-2xl sm:text-3xl font-bold transition-colors',
          isDarkMode ? 'text-white' : 'text-gray-900'
        )}>
          {dbOrDash(stats.peakDb)} <span className={cn('text-sm font-normal', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>dB</span>
        </p>
      </div>

      {/* Active Contributors */}
      <div
        className="p-4 sm:p-6 rounded-lg shadow-lg transition-colors"
        style={{ backgroundColor: getCardColor() }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className={cn('text-xs sm:text-sm font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>Active Users</h3>
          <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
        </div>
        <p className={cn(
          'text-2xl sm:text-3xl font-bold transition-colors',
          isDarkMode ? 'text-white' : 'text-gray-900'
        )}>
          {stats.contributors.toLocaleString()}
        </p>
      </div>

      {/* Uncalibrated-dB disclosure (ux-3): one line under the stats row */}
      <p
        className={cn(
          'col-span-full text-xs transition-colors',
          isDarkMode ? 'text-gray-400' : 'text-gray-600'
        )}
      >
        {DB_CAVEAT}
      </p>
    </div>
  );
}
