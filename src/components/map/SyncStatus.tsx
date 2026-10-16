import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import * as syncManager from '@/utils/syncManager';

interface SyncStatusProps {
  onSyncComplete?: (result: syncManager.SyncResult) => void;
}

/**
 * SyncStatus - Shows sync state and provides manual sync button
 * 
 * States:
 * - synced: Green checkmark, "Just now"
 * - pending: Gray clock, "X time ago" + Sync button
 * - syncing: Blue spinner, "Syncing..."
 * - error: Red alert, "Retry" button
 */
export function SyncStatus({ onSyncComplete }: SyncStatusProps) {
  const { isDarkMode } = useTheme();
  const [status, setStatus] = useState<syncManager.SyncStatus>('pending');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [totalReadings, setTotalReadings] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load initial sync status
  useEffect(() => {
    loadSyncStatus();
    
    // Auto-sync every hour
    const interval = setInterval(loadSyncStatus, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function loadSyncStatus() {
    try {
      const syncStatus = await syncManager.getSyncStatus();
      setStatus(syncStatus.status);
      setLastSync(syncStatus.lastSync);
      setTotalReadings(syncStatus.totalReadings);
    } catch (err) {
      console.error('Error loading sync status:', err);
      setStatus('error');
    }
  }

  async function handleSync() {
    if (isSyncing) return;
    
    setIsSyncing(true);
    setStatus('syncing');
    
    try {
      const result = await syncManager.syncNewReadings();
      
      setLastSync(result.lastSync);
      setTotalReadings(result.totalReadings);
      setStatus('synced');
      
      if (onSyncComplete) {
        onSyncComplete(result);
      }
    } catch (err) {
      console.error('Sync failed:', err);
      setStatus('error');
    } finally {
      setIsSyncing(false);
    }
  }

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

  // Render text based on status
  function renderText() {
    switch (status) {
      case 'synced':
        return 'Just now';
      case 'syncing':
        return 'Syncing...';
      case 'error':
        return 'Sync failed';
      default:
        return syncManager.formatTimeAgo(lastSync);
    }
  }

  // Show sync button for pending/error states
  const showSyncButton = (status === 'pending' || status === 'error') && !isSyncing;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
      isDarkMode ? 'bg-[#2D2640]/95' : 'bg-white/95'
    } backdrop-blur-sm shadow-lg`}>
      {/* Icon */}
      <div className="flex items-center gap-2">
        {renderIcon()}
        
        {/* Text */}
        <span className={`text-xs font-medium ${
          isDarkMode ? 'text-gray-300' : 'text-gray-700'
        }`}>
          {status === 'synced' || status === 'syncing' ? '' : 'Last synced: '}
          {renderText()}
        </span>
        
        {/* Total readings count */}
        {totalReadings > 0 && (
          <span className={`text-xs ${
            isDarkMode ? 'text-gray-500' : 'text-gray-400'
          }`}>
            • {totalReadings} readings
          </span>
        )}
      </div>
      
      {/* Sync Button */}
      {showSyncButton && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          className={`h-6 px-2 text-xs ${
            status === 'error'
              ? 'border-red-300 text-red-600 hover:bg-red-50'
              : ''
          }`}
          title={status === 'error' ? 'Retry sync' : 'Sync new readings'}
        >
          {status === 'error' ? 'Retry' : 'Sync'}
        </Button>
      )}
      
      {/* Tooltip for synced state */}
      {status === 'synced' && (
        <span className={`text-xs ${
          isDarkMode ? 'text-green-400' : 'text-green-600'
        }`}>
          ✓
        </span>
      )}
    </div>
  );
}
