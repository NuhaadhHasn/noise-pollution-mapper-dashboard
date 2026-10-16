import { useMemo, useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { ChartSkeleton } from '@/components/analytics/ChartSkeleton';

interface SoundTypeData {
  type: string;
  count: number;
  percentage: number;
  color: string;
}

// Sound type colors (matching Flutter app badges)
const SOUND_TYPE_COLORS: Record<string, string> = {
  'Pollution': '#F44336',    // Red badge
  'Ambient': '#4CAF50',      // Green badge
  'Unknown': '#9E9E9E',      // Gray badge
};

export function SoundTypeChart() {
  const { isDarkMode } = useTheme();
  const { readings, loading, error } = useSyncedReadings();
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile based on window width
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Group by sound type
  const soundTypeData = useMemo(() => {
    if (readings.length === 0) return [];

    const groups = new Map<string, number>();

    readings.forEach((reading) => {
      const type = reading.soundType || 'Unknown';
      groups.set(type, (groups.get(type) || 0) + 1);
    });

    const total = readings.length;
    const result: SoundTypeData[] = Array.from(groups.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: Math.round((count / total) * 100),
        color: SOUND_TYPE_COLORS[type] || '#9E9E9E',
      }))
      .sort((a, b) => b.count - a.count); // Sort by count (descending)

    return result;
  }, [readings]);

  if (loading) {
    return <ChartSkeleton showLegend />;
  }

  if (soundTypeData.length === 0) {
    return (
      <div className={cn(
        "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
        isDarkMode ? "bg-[#322E4A]" : "bg-white"
      )}>
        <div className="flex items-center justify-center h-64 sm:h-80">
          <div className="text-center">
            <p className={cn("text-sm font-medium", isDarkMode ? "text-gray-300" : "text-gray-700")}>
              {error ? 'Readings could not be loaded' : 'No data available'}
            </p>
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              {error
                ? 'Sound types appear once the readings have been downloaded.'
                : 'No readings have been uploaded from the mobile app yet.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
      isDarkMode ? "bg-[#322E4A]" : "bg-white"
    )}>
      <h3 className={cn("text-base sm:text-lg font-semibold mb-4", isDarkMode ? "text-white" : "text-gray-900")}>
        🥧 Sound Type Distribution
      </h3>

      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={soundTypeData}
              cx="50%"
              cy="50%"
              labelLine={false}
              // Hide labels on mobile, show on desktop
              label={isMobile ? () => null : ({ type, percentage }) => `${type}: ${percentage}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="count"
              nameKey="type"
            >
              {soundTypeData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: isDarkMode ? '#2D2640' : '#FFFFFF',
                border: `1px solid ${isDarkMode ? '#4A4458' : '#E0E0E0'}`,
                borderRadius: '8px',
                color: isDarkMode ? '#FFFFFF' : '#1E1932',
              }}
              labelStyle={{
                color: isDarkMode ? '#FFFFFF' : '#1E1932',
                fontWeight: '600',
              }}
              itemStyle={{
                color: isDarkMode ? '#E0E0E0' : '#6B6B6B',
              }}
              formatter={(value: number, name: string) => {
                const data = soundTypeData.find((d) => d.type === name);
                return [`${value} readings (${data?.percentage}%)`, 'Sound Type'];
              }}
            />
            {/* Hidden legend - we use custom legend below instead */}
            <Legend 
              wrapperStyle={{ 
                display: 'none',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed legend */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {soundTypeData.map((data) => (
          <div
            key={data.type}
            className={cn(
              "flex items-center justify-between p-2 rounded text-xs",
              isDarkMode ? "bg-gray-700/50" : "bg-gray-50"
            )}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                className="w-3 h-3 rounded shrink-0"
                style={{ backgroundColor: data.color }}
              />
              <span className={cn("font-medium truncate", isDarkMode ? "text-gray-300" : "text-gray-700")}>
                {data.type}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn("text-xs", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                {data.count}
              </span>
              <span className={cn("text-xs font-semibold", isDarkMode ? "text-gray-300" : "text-gray-700")}>
                {data.percentage}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
