import { useMemo, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { describeTrendChart, summarizeLevels } from '@/lib/chartSummary';
import { bucketLabel, bucketOf, type TimeGranularity } from '@/lib/trendBuckets';
import { ChartSkeleton } from '@/components/analytics/ChartSkeleton';
import { getReadingDate } from '@/lib/readings';

interface TrendDataPoint {
  timestamp: string;
  avgDb: number;
  maxDb: number;
  minDb: number;
}

export function NoiseTrendChart() {
  const { isDarkMode } = useTheme();
  const [granularity, setGranularity] = useState<TimeGranularity>('day');
  const { readings, loading, error } = useSyncedReadings();

  // Group readings by time granularity
  const groupedData = useMemo(() => {
    if (readings.length === 0) return [];

    const groups = new Map<string, { start: number; dbLevels: number[] }>();

    readings.forEach((reading) => {
      const timestamp = getReadingDate(reading);
      // bug-13: a reading with no usable date is left out instead of being
      // bucketed to 1 Jan 1970
      if (!timestamp) {
        return;
      }
      const { key, start } = bucketOf(timestamp, granularity);

      const group = groups.get(key);
      if (group) {
        group.dbLevels.push(reading.decibelLevel);
      } else {
        groups.set(key, { start, dbLevels: [reading.decibelLevel] });
      }
    });

    // Convert to array and calculate stats
    const result: TrendDataPoint[] = Array.from(groups.entries())
      .sort(([, a], [, b]) => a.start - b.start)
      .flatMap(([timestamp, { dbLevels }]) => {
        // bug-10: finite values only, min and max without spreading an array
        const summary = summarizeLevels(dbLevels);
        if (!summary) return [];
        return [
          {
            timestamp,
            avgDb: Math.round(summary.average * 10) / 10,
            maxDb: Math.round(summary.max * 10) / 10,
            minDb: Math.round(summary.min * 10) / 10,
          },
        ];
      });

    return result;
  }, [readings, granularity]);

  // Axis and tooltip label, built from the bucket key text (bug-12), so it never
  // re-parses a wall-clock string in the browser's time zone.
  const formatLabel = (timestamp: string) => bucketLabel(timestamp, granularity);

  if (loading) {
    return <ChartSkeleton showLegend />;
  }

  if (groupedData.length === 0) {
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
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-300" : "text-gray-600")}>
              {error
                ? 'Trends appear once the readings have been downloaded.'
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h3 className={cn("text-base sm:text-lg font-semibold", isDarkMode ? "text-white" : "text-gray-900")}>
          📈 Noise Trend
        </h3>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {(['hour', 'day', 'week', 'month'] as TimeGranularity[]).map((g) => (
            <Button
              key={g}
              size="sm"
              variant={granularity === g ? 'default' : 'outline'}
              className="text-xs px-2 sm:px-3 py-1 h-8"
              onClick={() => setGranularity(g)}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={groupedData}
            accessibilityLayer
            role="img"
            aria-label={describeTrendChart({
              granularity,
              levels: readings.map((reading) => reading.decibelLevel),
              periods: groupedData.length,
              firstPeriod: formatLabel(groupedData[0].timestamp),
              lastPeriod: formatLabel(groupedData[groupedData.length - 1].timestamp),
            })}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke={isDarkMode ? '#4A4458' : '#E0E0E0'} 
            />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatLabel}
              stroke={isDarkMode ? '#9E9E9E' : '#6B6B6B'}
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              domain={[0, 120]} 
              stroke={isDarkMode ? '#9E9E9E' : '#6B6B6B'}
              tick={{ fontSize: 12 }}
              label={{ 
                value: 'dB', 
                angle: -90, 
                position: 'insideLeft',
                fill: isDarkMode ? '#9E9E9E' : '#6B6B6B'
              }}
            />
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
              labelFormatter={(label) => formatLabel(label as string)}
              formatter={(value: number) => [`${value} dB`, '']}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="avgDb" 
              stroke="#6C63FF" 
              strokeWidth={2}
              dot={{ fill: '#6C63FF', strokeWidth: 1 }}
              name="Average"
            />
            <Line 
              type="monotone" 
              dataKey="maxDb" 
              stroke="#F44336" 
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={false}
              name="Maximum"
            />
            <Line 
              type="monotone" 
              dataKey="minDb" 
              stroke="#4CAF50" 
              strokeWidth={2}
              strokeDasharray="2 3"
              dot={false}
              name="Minimum"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className={cn("mt-2 text-xs", isDarkMode ? "text-gray-300" : "text-gray-600")}>
        Days, weeks and hours follow Sri Lanka time (UTC+5:30).
      </p>
    </div>
  );
}
