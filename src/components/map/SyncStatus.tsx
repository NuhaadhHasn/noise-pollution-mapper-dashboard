import { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { AUTO_SYNC_INTERVAL_MS, formatTimeAgo } from '@/utils/syncManager';

// How often the relative time ("2m ago") re-renders. No sync happens here.
const CLOCK_TICK_MS = 30 * 1000;

type DisplayStatus = 'synced' | 'pending' | 'syncing' | 'error';

/**
 * SyncStatus - the ReadingsProvider's real sync state, plus a Sync button.
 *
 * Everything comes from the provider (bug-4). The button runs the provider's
 * refresh(), so markers, heatmap and counts update from the same sync. The
 * provider itself syncs every AUTO_SYNC_INTERVAL_MS and when the tab becomes
 * visible again; this component only displays the result.
 *
 * States:
 * - synced: green check, "Last synced: Just now" (within the auto-sync interval)
 * - pending: grey clock, "Last synced: 3h ago" / "Never"
 * - syncing: blue spinner, "Syncing..."
 * - error: red alert, "Sync failed" + Retry
 */
export function SyncStatus() {
  const { isDarkMode } = useTheme();
  const { readings, syncing, error, lastSync, refresh } = useSyncedReadings();
  const [now, setNow] = useState(() => Date.now());

  // Re-render the relative time without re-syncing.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const status: DisplayStatus = syncing
    ? 'syncing'
    : error
      ? 'error'
      : lastSync !== null && now - lastSync.getTime() < AUTO_SYNC_INTERVAL_MS
        ? 'synced'
        : 'pending';

  // Render icon based on status
  function renderIcon() {
    switch (status) {
      case 'synced':
        return <CheckCircle className={`h-3.5 w-3.5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />;
      case 'syncing':
        return <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />;
      case 'error':
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <Clock className={`h-3.5 w-3.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />;
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
        isDarkMode ? 'bg-[#2D2640]/95' : 'bg-white/95'
      } backdrop-blur-sm shadow-lg`}
    >
      <div className="flex items-center gap-2">
        {renderIcon()}

        <span className={`text-xs font-medium ${
          isDarkMode ? 'text-gray-300' : 'text-gray-700'
        }`}>
          {status === 'syncing' && 'Syncing...'}
          {status === 'error' && 'Sync failed'}
          {(status === 'synced' || status === 'pending') && (
            <>
              Last synced:{' '}
              {/* The ticking time is not re-announced every minute. */}
              <span aria-live="off">{formatTimeAgo(lastSync, now)}</span>
            </>
          )}
        </span>

        {readings.length > 0 && (
          <span className={`text-xs ${
            isDarkMode ? 'text-gray-500' : 'text-gray-400'
          }`}>
            • {readings.length.toLocaleString()} cached (all users)
          </span>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => void refresh()}
        disabled={syncing}
        className={`h-6 px-2 text-xs ${
          status === 'error'
            ? 'border-red-300 text-red-600 hover:bg-red-50'
            : ''
        }`}
        title={status === 'error' ? 'Retry sync' : 'Sync new readings'}
      >
        {status === 'error' ? 'Retry' : 'Sync'}
      </Button>
    </div>
  );
}
