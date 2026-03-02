import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { NoiseReading } from '@/types/NoiseReading';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  'Both': '#AB47BC',         // Purple badge
  'Unknown': '#9E9E9E',      // Gray badge
};

export function SoundTypeChart() {
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
    return (
      <div className={cn(
        "p-4 sm:p-6 rounded-lg shadow-lg transition-colors",
        isDarkMode ? "bg-[#322E4A]" : "bg-white"
      )}>
        <h3 className={cn("text-base sm:text-lg font-semibold mb-4", isDarkMode ? "text-white" : "text-gray-900")}>
          🥧 Sound Type Distribution
        </h3>
        <div className={cn("h-64 sm:h-80 rounded", isDarkMode ? "bg-gray-700" : "bg-gray-100")} />
      </div>
    );
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
              No data available
            </p>
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              Start recording noise to see distribution
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
              label={({ type, percentage }) => `${type}: ${percentage}%`}
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
      <div className="mt-4 grid grid-cols-2 gap-2">
        {soundTypeData.map((data) => (
          <div
            key={data.type}
            className={cn(
              "flex items-center justify-between p-2 rounded text-xs",
              isDarkMode ? "bg-gray-700/50" : "bg-gray-50"
            )}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: data.color }}
              />
              <span className={cn("font-medium", isDarkMode ? "text-gray-300" : "text-gray-700")}>
                {data.type}
              </span>
            </div>
            <div className="flex items-center gap-2">
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
