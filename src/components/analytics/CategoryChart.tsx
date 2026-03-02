import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { NoiseReading } from '@/types/NoiseReading';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

interface CategoryData {
  category: string;
  avgDb: number;
  count: number;
  color: string;
}

// 17 sound categories with colors (matching Flutter app's yamnet_class_mapping.dart)
const CATEGORY_COLORS: Record<string, string> = {
  // Pollution Categories (9)
  'Traffic': '#FF5252',
  'Tuk-tuk': '#FF7043',
  'Construction': '#FFA726',
  'Industrial': '#FF6E40',
  'Sirens': '#EF5350',
  'Machinery': '#FF6E40',
  'Alarm': '#F44336',
  'Transport': '#E53935',
  'Sports': '#FF4081',
  // Ambient Categories (7)
  'Music': '#42A5F5',
  'Nature': '#66BB6A',
  'Animals': '#8BC34A',
  'Domestic': '#9CCC65',
  'Body Sounds': '#7CB342',
  'Weather': '#4FC3F7',
  'Office': '#BA68C8',
  // Both/Other (1)
  'Speech': '#AB47BC',
  'Religious': '#7E57C2',
  'Market': '#FF7043',
  'Other': '#9E9E9E',
};

// Category icons (matching Flutter app)
const CATEGORY_ICONS: Record<string, string> = {
  'Traffic': '🚗',
  'Tuk-tuk': '🛺',
  'Construction': '🏗️',
  'Industrial': '🏭',
  'Sirens': '🚨',
  'Machinery': '⚙️',
  'Alarm': '🔔',
  'Transport': '🚂',
  'Sports': '⚽',
  'Music': '🎵',
  'Nature': '🌿',
  'Animals': '🐾',
  'Domestic': '🏠',
  'Body Sounds': '👤',
  'Weather': '🌦️',
  'Office': '💼',
  'Speech': '💬',
  'Religious': '🔔',
  'Market': '🏪',
  'Other': '❓',
};

export function CategoryChart() {
  const { isDarkMode } = useTheme();
  const [readings, setReadings] = useState<NoiseReading[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch readings from Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'noise_readings'),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as NoiseReading[];
        setReadings(data);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching readings:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Group by category and calculate average dB
  const categoryData = useMemo(() => {
    if (readings.length === 0) return [];

    const groups = new Map<string, { totalDb: number; count: number }>();

    readings.forEach((reading) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const read = reading as any;
      // Flutter app uses 'soundClass', web app might use 'soundCategory' - check both
      const category = read.soundClass || read.soundCategory || 'Other';
      if (!groups.has(category)) {
        groups.set(category, { totalDb: 0, count: 0 });
      }
      const group = groups.get(category)!;
      group.totalDb += reading.decibelLevel || 0;
      group.count += 1;
    });

    const result: CategoryData[] = Array.from(groups.entries())
      .map(([category, data]) => ({
        category,
        avgDb: Math.round((data.totalDb / data.count) * 10) / 10,
        count: data.count,
        color: CATEGORY_COLORS[category] || '#9E9E9E',
      }))
      .sort((a, b) => b.avgDb - a.avgDb); // Sort by average dB (descending)

    return result;
  }, [readings]);

  if (loading) {
    return (
      <div className={cn(
        "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
        isDarkMode ? "bg-[#322E4A]" : "bg-white"
      )}>
        <h3 className={cn("text-base sm:text-lg font-semibold mb-4", isDarkMode ? "text-white" : "text-gray-900")}>
          📊 By Category
        </h3>
        <div className={cn("h-64 sm:h-80 rounded", isDarkMode ? "bg-gray-700" : "bg-gray-100")} />
      </div>
    );
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
              No data available
            </p>
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              Start recording noise to see categories
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
        📊 By Category
      </h3>

      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={categoryData} layout="vertical" margin={{ left: 20, right: 30, top: 20, bottom: 60 }}>
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
                const icon = CATEGORY_ICONS[category] || '❓';
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
                const icon = CATEGORY_ICONS[label as string] || '❓';
                return `${icon} ${label}`;
              }}
            />
            {/* Hidden legend - we use custom legend below instead */}
            <Legend 
              wrapperStyle={{ 
                display: 'none',
              }}
            />
            <Bar dataKey="avgDb" name="Average dB" radius={[0, 4, 4, 0]} activeBar={null}>
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
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {categoryData.map((data) => (
          <div
            key={data.category}
            className={cn(
              "flex items-center gap-2 p-2 rounded text-xs",
              isDarkMode ? "bg-gray-700/50" : "bg-gray-50"
            )}
          >
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: data.color }}
            />
            <span className={cn("font-medium", isDarkMode ? "text-gray-300" : "text-gray-700")}>
              {data.category}
            </span>
            <span className={cn("text-xs", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              ({data.count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
