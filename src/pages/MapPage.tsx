import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapComponent, type FlyToTarget } from '@/components/map/MapContainer';
import { NoiseMarkers } from '@/components/map/NoiseMarkers';
import MarkerClusterGroup from '@/components/map/MarkerClusterGroup';
import { HeatmapLayer } from '@/components/map/HeatmapLayer';
import { MapLegend } from '@/components/map/MapLegend';
import { SyncStatus } from '@/components/map/SyncStatus';
import { useDismissablePanel } from '@/hooks/useDismissablePanel';
import { X } from 'lucide-react';
import { UserFilterToggle } from '@/components/map/UserFilterToggle';
import { DateRangeFilter } from '@/components/map/DateRangeFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Search, Crosshair, Filter, ArrowLeft, Layers, RefreshCw, Loader2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_DATE_PRESET, filterReadings, partitionByBounds, presetSummary, type DatePresetId } from '@/lib/mapFilters';
import { isWithinBounds } from '@/lib/mapBounds';
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
  const { open: showFilters, setOpen: setShowFilters, panelRef, triggerRef } = useDismissablePanel();
  const [searchQuery, setSearchQuery] = useState('');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false); // Phase 1: User filter
  const [datePreset, setDatePreset] = useState<DatePresetId>(DEFAULT_DATE_PRESET); // Phase 3: Date filter (a preset id; the window is computed at filter time)
  const [flyTarget, setFlyTarget] = useState<FlyToTarget | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false); // Force refresh state
  const [confirmFullSyncOpen, setConfirmFullSyncOpen] = useState(false);
  const [fullSyncNotice, setFullSyncNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const { isDarkMode, primaryColor } = useTheme();
  const { readings, loading, forceFullSync } = useSyncedReadings();
  const userId = user?.uid ?? '';

  // One filtered set feeds the markers, the heatmap and the badge, so the three
  // can never disagree (bug-2, bug-9). The deps are the provider's readings array
  // plus primitives, so the memo recomputes only when one of them changes.
  // ux-13: the map is locked to the Sri Lanka box, so a reading outside it can
  // never be reached. Only reachable readings reach the markers, the heatmap and
  // the badge; the rest are counted in a note.
  const { inBounds: filteredReadings, outsideCount } = useMemo(
    () => partitionByBounds(filterReadings(readings, { userId, showAllUsers, preset: datePreset, searchQuery })),
    [readings, userId, showAllUsers, datePreset, searchQuery],
  );
  const isSearching = searchQuery.trim() !== '';

  // The location notice is a passing message: it clears itself after a while.
  useEffect(() => {
    if (!locationNotice) return;
    const timer = window.setTimeout(() => setLocationNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [locationNotice]);

  // "Current location" (ux-6): ask the browser for one position and fly there.
  // Denial, no support and a timeout all end in an inline message, never alert().
  const handleLocate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationNotice('Your browser cannot share its location.');
      return;
    }
    setLocating(true);
    setLocationNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const { latitude, longitude } = position.coords;
        if (!isWithinBounds(latitude, longitude)) {
          setLocationNotice('Your location is outside the map area (Sri Lanka), so the map did not move.');
          return;
        }
        setFlyTarget({ id: Date.now(), lat: latitude, lng: longitude });
      },
      (error) => {
        setLocating(false);
        setLocationNotice(
          error.code === error.PERMISSION_DENIED
            ? 'Location access was denied. Allow it in your browser settings to use this button.'
            : error.code === error.TIMEOUT
              ? 'Finding your location took too long. Please try again.'
              : 'Your location is not available right now.',
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

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
        className={`absolute top-4 right-4 z-20 flex flex-col sm:flex-row sm:flex-wrap items-center justify-end gap-2 sm:gap-3 h-auto sm:min-h-12 ${
          isDarkMode ? 'bg-[#2D2640]/95' : 'bg-white/95'
        } backdrop-blur-sm rounded-lg shadow-lg px-2 sm:px-4 py-2 transition-all duration-300`}
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
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>

          {/* Search - Full width on mobile */}
          <div className="relative flex-1 sm:flex-none min-w-[120px] sm:min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search location..."
              aria-label="Search readings by location name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm w-full sm:w-[180px]"
            />
          </div>
        </div>

        {/* Controls - Right aligned */}
        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1.5 max-w-full border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-700 pt-2 sm:pt-0 sm:pl-3">
          {/* Sync Status: reads and drives the shared ReadingsProvider (bug-4) */}
          <SyncStatus />

          {/* Heatmap Toggle */}
          <Button
            variant={showHeatmap ? "default" : "outline"}
            size="icon"
            onClick={() => setShowHeatmap(!showHeatmap)}
            className="h-8 w-8"
            title="Toggle heatmap"
            aria-label="Heatmap"
            aria-pressed={showHeatmap}
          >
            <Layers className="h-3.5 w-3.5" />
          </Button>

          {/* Filters */}
          <Button
            ref={triggerRef}
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8 w-8"
            title="Filters"
            aria-label="Filters"
            aria-expanded={showFilters}
            aria-controls="map-filters-panel"
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
            aria-label="Current location"
            onClick={handleLocate}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>

        {locationNotice && (
          <p
            role="status"
            className={`w-full text-xs text-center sm:text-right ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}
          >
            {locationNotice}
          </p>
        )}
      </div>

      {/* Marker Count Badge */}
      <div className={`absolute bottom-4 left-4 z-20 px-3 py-1.5 rounded-lg shadow-lg ${
        isDarkMode ? 'bg-[#2D2640] text-white' : 'bg-white text-gray-900'
      }`}>
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" style={{ color: primaryColor }} />
          <span className="font-semibold text-sm">{filteredReadings.length} markers</span>
        </div>
        {outsideCount > 0 && (
          <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {outsideCount === 1
              ? '1 reading outside the map area is not shown'
              : `${outsideCount.toLocaleString()} readings outside the map area are not shown`}
          </p>
        )}
      </div>

      {/* Legend: what the pin colours and the heat layer mean */}
      <MapLegend showHeatmap={showHeatmap} />

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
          <MapComponent flyTo={flyTarget}>
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
            }}>
              {!loading && <NoiseMarkers readings={filteredReadings} />}
            </MarkerClusterGroup>
            <HeatmapLayer readings={filteredReadings} visible={showHeatmap} />
          </MapComponent>
        </ErrorBoundary>
      </div>

      {/* Empty state (ux-2): a real overlay that names the cause. It is never a marker. */}
      {!loading && filteredReadings.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
          <div
            role="status"
            className={`pointer-events-auto max-w-sm rounded-lg shadow-lg p-4 text-center ${
              isDarkMode ? 'bg-[#2D2640] text-white' : 'bg-white text-gray-900'
            }`}
          >
            <p className="font-semibold mb-1">
              {readings.length === 0
                ? 'No readings have been synced yet'
                : 'No readings match the current filters'}
            </p>
            <p className={`text-sm mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {readings.length === 0
                ? 'Readings appear here once the mobile app has uploaded them.'
                : isSearching
                  ? 'Nothing matches the search and the current Data Source and Date Range filters.'
                  : 'Nothing matches the current Data Source and Date Range filters.'}
            </p>
            {readings.length > 0 && (!showAllUsers || datePreset !== DEFAULT_DATE_PRESET || isSearching) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAllUsers(true);
                  setDatePreset(DEFAULT_DATE_PRESET);
                  setSearchQuery('');
                }}
              >
                Show all readings
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Filter Panel: a non-modal dialog (a11y-6). Esc closes it, focus moves in
          when it opens and returns to the Filters button when it closes. */}
      {showFilters && (
        <div
          ref={panelRef}
          id="map-filters-panel"
          role="dialog"
          aria-labelledby="map-filters-title"
          tabIndex={-1}
          className={`absolute top-20 left-4 w-80 z-30 rounded-lg shadow-lg p-4 outline-none ${
            isDarkMode ? 'bg-[#2D2640]' : 'bg-white'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 id="map-filters-title" className="font-semibold">Filters</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowFilters(false)}
              className="h-8 w-8"
              aria-label="Close filters"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          
          {/* User Filter Section */}
          <div role="group" aria-labelledby="map-filter-source-label" className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <p id="map-filter-source-label" className={`text-sm font-medium mb-2 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Data Source
            </p>
            <UserFilterToggle 
              showAllUsers={showAllUsers}
              onFilterChange={setShowAllUsers}
            />
            <p className={`text-xs mt-2 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              {showAllUsers 
                ? 'Showing readings from all users' 
                : 'Showing only your readings'}
            </p>
          </div>
          
          {/* Date Range Filter Section (Phase 3) */}
          <div role="group" aria-labelledby="map-filter-date-label" className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <p id="map-filter-date-label" className={`text-sm font-medium mb-2 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Date Range
            </p>
            <DateRangeFilter value={datePreset} onChange={setDatePreset} />
            <p className={`text-xs mt-2 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              {presetSummary(datePreset)}
            </p>
          </div>

          {/* Force Full Sync Button */}
          <div role="group" aria-labelledby="map-filter-data-label">
            <p id="map-filter-data-label" className={`text-sm font-medium mb-2 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Data Management
            </p>
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
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
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
