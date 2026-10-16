import { useMemo, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { getReadingDate } from '@/lib/readings';

type TimeGranularity = 'hour' | 'day' | 'week' | 'month';

interface TrendDataPoint {
  timestamp: string;
  avgDb: number;
  maxDb: number;
  minDb: number;
}

export function NoiseTrendChart() {
  const { isDarkMode } = useTheme();
  const [granularity, setGranularity] = useState<TimeGranularity>('day');
  const { readings } = useSyncedReadings();

  // Group readings by time granularity
  const groupedData = useMemo(() => {
    if (readings.length === 0) return [];

    const groups = new Map<string, number[]>();

    readings.forEach((reading) => {
      const timestamp = getReadingDate(reading);
      // bug-13: a reading with no usable date is left out instead of being
      // bucketed to 1 Jan 1970
      if (!timestamp) {
        return;
      }
      let key: string;

      switch (granularity) {
        case 'hour': {
          key = format(timestamp, 'yyyy-MM-dd HH:00');
          break;
        }
        case 'week': {
          // ISO week number
          const weekNum = getWeekNumber(timestamp);
          key = `${timestamp.getFullYear()}-W${weekNum}`;
          break;
        }
        case 'month': {
          key = format(timestamp, 'yyyy-MM');
          break;
        }
        case 'day':
        default: {
          key = format(timestamp, 'yyyy-MM-dd');
          break;
        }
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(reading.decibelLevel);
    });

    // Convert to array and calculate stats
    const result: TrendDataPoint[] = Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, dbLevels]) => ({
        timestamp,
        avgDb: Math.round((dbLevels.reduce((sum, db) => sum + db, 0) / dbLevels.length) * 10) / 10,
        maxDb: Math.round(Math.max(...dbLevels) * 10) / 10,
        minDb: Math.round(Math.min(...dbLevels) * 10) / 10,
      }));

    return result;
  }, [readings, granularity]);

  // Helper function to get week number
  function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  // Format display label based on granularity
  const formatLabel = (timestamp: string) => {
    try {
      switch (granularity) {
        case 'hour': {
          return format(new Date(timestamp), 'MMM d, h a');
        }
        case 'week': {
          return `Week ${timestamp.split('-W')[1]}`;
        }
        case 'month': {
          // Handle YYYY-MM format
          const parts = timestamp.split('-');
          if (parts.length === 2) {
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1; // 0-indexed
            const date = new Date(year, month, 1);
            return format(date, 'MMM yyyy');
          }
          return format(new Date(timestamp + '-01'), 'MMM yyyy');
        }
        case 'day':
        default: {
          return format(new Date(timestamp), 'MMM d');
        }
      }
    } catch (error) {
      console.error('Error formatting date:', error, timestamp);
      return timestamp;
    }
  };

  if (groupedData.length === 0) {
    return (
      <div className={cn(
        "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
        isDarkMode ? "bg-[#322E4A]" : "bg-white"
      )}>
        <div className="flex items-center justify-center h-64 sm:h-80">
          <div className="text-center">
            <p className={cn("text-sm font-medium", isDarkMode ? "text-gray-300" : "text-gray-700")}>
              No data available
            </p>
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              Start recording noise to see trends
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
          <LineChart data={groupedData}>
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
              dot={false}
              name="Maximum"
            />
            <Line 
              type="monotone" 
              dataKey="minDb" 
              stroke="#4CAF50" 
              strokeWidth={2}
              dot={false}
              name="Minimum"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
