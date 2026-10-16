import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { describeCategoryChart } from '@/lib/chartSummary';
import { categoryInfo, categoryOf, UNCLASSIFIED } from '@/lib/categories';
import { ChartSkeleton } from '@/components/analytics/ChartSkeleton';

interface CategoryData {
  category: string;
  avgDb: number;
  count: number;
  color: string;
}

// Bar colours and icons come from the shared taxonomy (src/lib/categories.ts).

export function CategoryChart() {
  const { isDarkMode } = useTheme();
  const { readings, loading, error } = useSyncedReadings();

  // Group by category and calculate average dB
  const categoryData = useMemo(() => {
    if (readings.length === 0) return [];

    const groups = new Map<string, { totalDb: number; count: number }>();

    readings.forEach((reading) => {
      // Canonical category: 'Speech-Pollution' / 'Speech-Ambient' (manual reports)
      // fold into 'Speech'; a reading with no soundClass is 'Unclassified' and is
      // never merged into the real 'Other' (data-3).
      const category = categoryOf(reading);
      // D2: readings with no soundClass are not charted (the app's own analytics
      // skips them too, analytics_screen.dart:232-234). The caption below counts them.
      if (category === UNCLASSIFIED) return;
      // bug-10: a missing or non-finite dB is left out, never counted as 0
      if (!Number.isFinite(reading.decibelLevel)) return;
      if (!groups.has(category)) {
        groups.set(category, { totalDb: 0, count: 0 });
      }
      const group = groups.get(category)!;
      group.totalDb += reading.decibelLevel;
      group.count += 1;
    });

    const result: CategoryData[] = Array.from(groups.entries())
      .map(([category, data]) => ({
        category,
        avgDb: Math.round((data.totalDb / data.count) * 10) / 10,
        count: data.count,
        color: categoryInfo(category).color,
      }))
      .sort((a, b) => b.avgDb - a.avgDb); // Sort by average dB (descending)

    return result;
  }, [readings]);

  // Readings the app left unclassified are not charted (D2). The caption says
  // how many were left out; at audit time that was 2,683 of 3,374 in production.
  const unclassifiedCount = useMemo(
    () => readings.filter((reading) => categoryOf(reading) === UNCLASSIFIED).length,
    [readings]
  );
  const unclassifiedCaption =
    unclassifiedCount > 0
      ? `${unclassifiedCount.toLocaleString('en-US')} of ${readings.length.toLocaleString('en-US')} readings are unclassified and not shown`
      : null;

  if (loading) {
    return <ChartSkeleton showLegend />;
  }

  if (categoryData.length === 0) {
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
                ? 'Categories appear once the readings have been downloaded.'
                : unclassifiedCount > 0
                  ? 'None of the readings has a sound category yet.'
                  : 'No readings have been uploaded from the mobile app yet.'}
            </p>
            {!error && unclassifiedCaption && (
              <p className={cn("text-xs mt-2", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                {unclassifiedCaption}
              </p>
            )}
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
        📊 By Category
      </h3>

      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={categoryData}
            layout="vertical"
            margin={{ left: 20, right: 30, top: 20, bottom: 60 }}
            accessibilityLayer
            role="img"
            aria-label={describeCategoryChart(categoryData)}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke={isDarkMode ? '#4A4458' : '#E0E0E0'} 
              horizontal={false}
            />
            <XAxis 
              type="number"
              domain={[0, 120]} 
              stroke={isDarkMode ? '#9E9E9E' : '#6B6B6B'}
              tick={{ fontSize: 12, fill: isDarkMode ? '#9E9E9E' : '#6B6B6B' }}
              label={{ 
                value: 'Average dB', 
                position: 'bottom',
                offset: 0,
                fill: isDarkMode ? '#9E9E9E' : '#6B6B6B',
              }}
            />
            <YAxis 
              type="category"
              dataKey="category"
              stroke={isDarkMode ? '#9E9E9E' : '#6B6B6B'}
              tick={{ fontSize: 11, fill: isDarkMode ? '#9E9E9E' : '#6B6B6B' }}
              width={120}
              tickFormatter={(category) => {
                const icon = categoryInfo(category).icon;
                return `${icon} ${category}`;
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
              cursor={{ fill: 'transparent' }}
              formatter={(value: number, name: string) => {
                if (name === 'avgDb') {
                  return [`${value} dB`, 'Average Noise'];
                }
                return [value, 'Readings'];
              }}
              labelFormatter={(label) => {
                const icon = categoryInfo(label as string).icon;
                return `${icon} ${label}`;
              }}
            />
            {/* Hidden legend - we use custom legend below instead */}
            <Legend 
              wrapperStyle={{ 
                display: 'none',
              }}
            />
            <Bar dataKey="avgDb" name="Average dB" radius={[0, 4, 4, 0]} activeBar={false}>
              {categoryData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color}
                  style={{ transition: 'opacity 0.2s' }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend with count */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {categoryData.map((data) => (
          <div
            key={data.category}
            className={cn(
              "flex items-center gap-2 p-2 rounded text-xs",
              isDarkMode ? "bg-gray-700/50" : "bg-gray-50"
            )}
          >
            <div
              className="w-3 h-3 rounded shrink-0"
              style={{ backgroundColor: data.color }}
            />
            <span className={cn("font-medium truncate flex-1", isDarkMode ? "text-gray-300" : "text-gray-700")}>
              {data.category}
            </span>
            <span className={cn("text-xs shrink-0", isDarkMode ? "text-gray-300" : "text-gray-600")}>
              ({data.count})
            </span>
          </div>
        ))}
      </div>

      {unclassifiedCaption && (
        <p className={cn("mt-3 text-xs", isDarkMode ? "text-gray-400" : "text-gray-600")}>
          {unclassifiedCaption}
        </p>
      )}
    </div>
  );
}
