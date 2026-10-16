import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapComponent } from '@/components/map/MapContainer';
import { NoiseMarkers } from '@/components/map/NoiseMarkers';
import MarkerClusterGroup from '@/components/map/MarkerClusterGroup';
import { HeatmapLayer } from '@/components/map/HeatmapLayer';
import { SyncStatus } from '@/components/map/SyncStatus';
import { UserFilterToggle } from '@/components/map/UserFilterToggle';
import { DateRangeFilter } from '@/components/map/DateRangeFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Search, Crosshair, Filter, ArrowLeft, Layers, RefreshCw } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';
import { filterReadings } from '@/lib/mapFilters';
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function MapPage() {
  const navigate = useNavigate();
  const { user } = useAuth(); // Get current user
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false); // Phase 1: User filter
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null); // Phase 3: Date filter (null = all time)
  const [isRefreshing, setIsRefreshing] = useState(false); // Force refresh state
  const [confirmFullSyncOpen, setConfirmFullSyncOpen] = useState(false);
  const [fullSyncNotice, setFullSyncNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const { isDarkMode, primaryColor } = useTheme();
  const { readings, loading, forceFullSync } = useSyncedReadings();
  const userId = user?.uid ?? '';

  // One filtered set feeds the markers, the heatmap and the badge, so the three
  // can never disagree (bug-2, bug-9). The deps are the provider's readings array
  // plus primitives, so the memo recomputes only when one of them changes.
  const filteredReadings = useMemo(
    () => filterReadings(readings, { userId, showAllUsers, range: dateRange }),
    [readings, userId, showAllUsers, dateRange],
  );

  // "Fetch All Readings": re-download everything through the provider, which
  // swaps the cache only after the download succeeded (bug-5). The provider's
  // readings update in place, so the map refreshes without a page reload.
  const handleForceFullSync = async () => {
    setConfirmFullSyncOpen(false);
    setIsRefreshing(true);
    setFullSyncNotice(null);
    try {
      const result = await forceFullSync();
      setFullSyncNotice({
        kind: 'success',
        text: `Fetched ${result.count.toLocaleString()} readings. The map is up to date.`,
      });
    } catch (error) {
      console.error('Force full sync failed:', error);
      setFullSyncNotice({
        kind: 'error',
        text: 'Could not fetch all readings. The readings already cached are unchanged. Please try again.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="relative w-full overflow-hidden bg-gray-200 dark:bg-gray-900" style={{ height: 'calc(100vh - 7rem)' }}>
      {/* Top Bar - Responsive */}
      <div
        className={`absolute top-4 right-4 z-[300] flex flex-col sm:flex-row items-center gap-2 sm:gap-3 h-auto sm:h-12 ${
          isDarkMode ? 'bg-[#2D2640]/95' : 'bg-white/95'
        } backdrop-blur-sm rounded-lg shadow-lg px-2 sm:px-4 py-2 sm:py-4 transition-all duration-300`}
        style={{ 
          width: 'fit-content',
          maxWidth: 'calc(100vw - 2rem)',
          minWidth: '280px'
        }}
      >
        {/* Top Row: Back Button + Search */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Back Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            className="shrink-0 h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {/* Search - Full width on mobile */}
          <div className="relative flex-1 sm:flex-none min-w-[120px] sm:min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm w-full sm:w-[180px]"
            />
          </div>
        </div>

        {/* Controls - Right aligned */}
        <div className="flex gap-1.5 shrink-0 border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-700 pt-2 sm:pt-0 sm:pl-3">
          {/* Sync Status: reads and drives the shared ReadingsProvider (bug-4) */}
          <SyncStatus />

          {/* Heatmap Toggle */}
          <Button
            variant={showHeatmap ? "default" : "outline"}
            size="icon"
            onClick={() => setShowHeatmap(!showHeatmap)}
            className="h-8 w-8"
            title="Toggle heatmap"
          >
            <Layers className="h-3.5 w-3.5" />
          </Button>

          {/* Filters */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8 w-8"
            title="Filters"
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>

          {/* Current location */}
          <Button
            variant="outline"
            size="icon"
            style={{ color: primaryColor }}
            className="h-8 w-8"
            title="Current location"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Marker Count Badge */}
      <div className={`absolute bottom-4 left-4 z-[400] px-3 py-1.5 rounded-lg shadow-lg ${
        isDarkMode ? 'bg-[#2D2640] text-white' : 'bg-white text-gray-900'
      }`}>
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" style={{ color: primaryColor }} />
          <span className="font-semibold text-sm">{filteredReadings.length} markers</span>
        </div>
      </div>

      {/* Map - Full Screen, No Scrollbars */}
      <div
        className="absolute inset-0 w-full h-full"
        style={{ top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <ErrorBoundary fallback={
          <div className="flex items-center justify-center h-full w-full">
            <div className="text-center p-4">
              <p className="text-red-600 dark:text-red-400 mb-2">Map failed to load</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Reload Page
              </button>
            </div>
          </div>
        }>
          <MapComponent>
            <MarkerClusterGroup options={{
              maxClusterRadius: 40,  // Smaller clusters = faster
              disableClusteringAtZoom: 15,  // Show individual markers earlier
              spiderfyOnMaxZoom: true,
              showCoverageOnHover: false,
              spiderfyDistanceMultiplier: 1.5,  // Tighter spacing
              zoomToBoundsOnClick: true,
              animate: false,
              animateAddingMarkers: false,
              removeOutsideVisibleBounds: true,
              chunkedLoading: true,
              chunkInterval: 100,  // Faster chunks (was 200ms)
              chunkDelay: 0,  // No delay between chunks (was 50ms)
            }}>
              {!loading && <NoiseMarkers readings={filteredReadings} />}
            </MarkerClusterGroup>
            <HeatmapLayer readings={filteredReadings} visible={showHeatmap} />
          </MapComponent>
        </ErrorBoundary>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className={`absolute top-20 left-4 w-80 z-[399] rounded-lg shadow-lg p-4 ${
          isDarkMode ? 'bg-[#2D2640]' : 'bg-white'
        }`}>
          <h3 className="font-semibold mb-4">Filters</h3>
          
          {/* User Filter Section */}
          <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <label className={`text-sm font-medium mb-2 block ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Data Source
            </label>
            <UserFilterToggle 
              showAllUsers={showAllUsers}
              onFilterChange={setShowAllUsers}
            />
            <p className={`text-xs mt-2 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              {showAllUsers 
                ? 'Showing readings from all users' 
                : 'Showing only your readings'}
            </p>
          </div>
          
          {/* Date Range Filter Section (Phase 3) */}
          <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <label className={`text-sm font-medium mb-2 block ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Date Range
            </label>
            <DateRangeFilter
              onDateRangeChange={setDateRange}
            />
            <p className={`text-xs mt-2 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              {dateRange
                ? `From ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}`
                : 'Showing all dates'}
            </p>
          </div>

          {/* Force Full Sync Button */}
          <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <label className={`text-sm font-medium mb-2 block ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Data Management
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmFullSyncOpen(true)}
              disabled={isRefreshing}
              className="w-full"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Fetching...' : 'Fetch All Readings'}
            </Button>
            <p className={`text-xs mt-2 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              Re-download every reading from Firebase. The cache is replaced only after the download succeeds.
            </p>
            {fullSyncNotice && (
              <p
                role={fullSyncNotice.kind === 'error' ? 'alert' : 'status'}
                className={`text-xs mt-2 ${
                  fullSyncNotice.kind === 'error'
                    ? 'text-red-500'
                    : isDarkMode ? 'text-green-400' : 'text-green-700'
                }`}
              >
                {fullSyncNotice.text}
              </p>
            )}
          </div>

          {/* Placeholder for future filters */}
          <div>
            <p className={`text-sm ${
              isDarkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>
              More filters coming soon:
            </p>
            <ul className={`text-xs mt-2 space-y-1 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              <li>• Category</li>
              <li>• Noise level</li>
            </ul>
          </div>
        </div>
      )}

      {/* "Fetch All Readings" confirmation (replaces window.confirm, bug-5) */}
      <Dialog open={confirmFullSyncOpen} onOpenChange={setConfirmFullSyncOpen}>
        <DialogContent className={`max-w-md z-[9999] ${
          isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white'
        }`}>
          <DialogHeader>
            <DialogTitle className={isDarkMode ? 'text-white' : 'text-gray-900'}>
              Fetch all readings?
            </DialogTitle>
            <DialogDescription className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>
              This downloads every reading from Firebase again (one billed read per reading) and can take a few minutes on a slow connection. The readings already cached stay on the map until the download succeeds.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmFullSyncOpen(false)}
              className={isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : ''}
            >
              Cancel
            </Button>
            <Button onClick={handleForceFullSync}>
              Fetch all readings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
