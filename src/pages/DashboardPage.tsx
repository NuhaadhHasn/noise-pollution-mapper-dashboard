// noinspection JSUnusedLocalSymbols
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { isDarkMode, getCardColor } = useTheme();

  return (
    <div className="space-y-6">
      <header className="mb-6">
        <h2 className={cn(
          'text-2xl font-bold transition-colors',
          isDarkMode ? 'text-white' : 'text-gray-900'
        )}>
          Dashboard Overview
        </h2>
        <p className={cn(
          'transition-colors',
          isDarkMode ? 'text-gray-400' : 'text-gray-600'
        )}>
          Real-time noise pollution monitoring for Sri Lanka
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Stats Cards */}
        <div
          className="p-6 rounded-lg shadow-lg transition-colors"
          style={{ backgroundColor: getCardColor() }}
        >
          <h3 className="text-sm font-medium text-gray-500">Total Readings</h3>
          <p className={cn(
            'text-3xl font-bold transition-colors',
            isDarkMode ? 'text-white' : 'text-gray-900'
          )}>
            1,234
          </p>
        </div>

        <div
          className="p-6 rounded-lg shadow-lg transition-colors"
          style={{ backgroundColor: getCardColor() }}
        >
          <h3 className="text-sm font-medium text-gray-500">Avg Noise Level</h3>
          <p className={cn(
            'text-3xl font-bold transition-colors',
            isDarkMode ? 'text-white' : 'text-gray-900'
          )}>
            65.2 dB
          </p>
        </div>

        <div
          className="p-6 rounded-lg shadow-lg transition-colors"
          style={{ backgroundColor: getCardColor() }}
        >
          <h3 className="text-sm font-medium text-gray-500">Peak Noise</h3>
          <p className={cn(
            'text-3xl font-bold transition-colors',
            isDarkMode ? 'text-white' : 'text-gray-900'
          )}>
            98 dB
          </p>
        </div>

        <div
          className="p-6 rounded-lg shadow-lg transition-colors"
          style={{ backgroundColor: getCardColor() }}
        >
          <h3 className="text-sm font-medium text-gray-500">Active Users</h3>
          <p className={cn(
            'text-3xl font-bold transition-colors',
            isDarkMode ? 'text-white' : 'text-gray-900'
          )}>
            47
          </p>
        </div>
      </div>

      {/* Map Placeholder */}
      <div
        className="mt-6 rounded-lg shadow-lg h-96 flex items-center justify-center transition-colors"
        style={{ backgroundColor: getCardColor() }}
      >
        <p className={cn(
          'transition-colors',
          isDarkMode ? 'text-gray-400' : 'text-gray-600'
        )}>
          📍 Interactive Map (Leaflet.js) - Coming in Phase 2.2
        </p>
      </div>

      {/* Analytics Placeholder */}
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <div
          className="p-6 rounded-lg shadow-lg h-64 flex items-center justify-center transition-colors"
          style={{ backgroundColor: getCardColor() }}
        >
          <p className={cn(
            'transition-colors',
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          )}>
            📈 Noise Trend Chart - Phase 2.3
          </p>
        </div>
        <div
          className="p-6 rounded-lg shadow-lg h-64 flex items-center justify-center transition-colors"
          style={{ backgroundColor: getCardColor() }}
        >
          <p className={cn(
            'transition-colors',
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          )}>
            📊 By Category Chart - Phase 2.3
          </p>
        </div>
        <div
          className="p-6 rounded-lg shadow-lg h-64 flex items-center justify-center transition-colors"
          style={{ backgroundColor: getCardColor() }}
        >
          <p className={cn(
            'transition-colors',
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          )}>
            🥧 Sound Type Distribution - Phase 2.3
          </p>
        </div>
      </div>
    </div>
  );
}
