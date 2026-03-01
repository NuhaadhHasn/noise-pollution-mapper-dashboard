import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapComponent } from '@/components/map/MapContainer';
import { NoiseMarkers } from '@/components/map/NoiseMarkers';
import MarkerClusterGroup from '@/components/map/MarkerClusterGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Search, Crosshair, Filter, ArrowLeft } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function MapPage() {
  const navigate = useNavigate();
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [markerCount, setMarkerCount] = useState(0);
  const { isDarkMode, primaryColor } = useTheme();

  return (
    <div className="relative w-full overflow-hidden bg-gray-200 dark:bg-gray-900" style={{ height: 'calc(100vh - 7rem)' }}>
      {/* Top Bar - Compact width */}
      <div
        className={`absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 h-12 ${
          isDarkMode ? 'bg-[#2D2640]/95' : 'bg-white/95'
        } backdrop-blur-sm rounded-lg shadow-lg px-4`}
        style={{ width: 'fit-content', maxWidth: 'calc(100vw - 2rem)' }}
      >
        {/* Back Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/dashboard')}
          className="shrink-0 h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Search - Fixed width */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 text-sm"
            style={{ width: '200px' }}
          />
        </div>

        {/* Controls */}
        <div className="flex gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8 w-8"
            title="Filters"
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
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
      <div className={`absolute bottom-4 left-4 z-[1000] px-3 py-1.5 rounded-lg shadow-lg ${
        isDarkMode ? 'bg-[#2D2640] text-white' : 'bg-white text-gray-900'
      }`}>
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" style={{ color: primaryColor }} />
          <span className="font-semibold text-sm">{markerCount} markers</span>
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
            <MarkerClusterGroup>
              <NoiseMarkers onMarkersLoaded={setMarkerCount} />
            </MarkerClusterGroup>
          </MapComponent>
        </ErrorBoundary>
      </div>

      {/* Filter Panel (for Phase 2.3) */}
      {showFilters && (
        <div className={`absolute top-20 left-4 w-80 z-[999] rounded-lg shadow-lg p-4 ${
          isDarkMode ? 'bg-[#2D2640]' : 'bg-white'
        }`}>
          <h3 className="font-semibold mb-4">Filters</h3>
          <p className="text-sm text-gray-500">
            Filter by date, category, and noise level - Phase 2.3
          </p>
        </div>
      )}
    </div>
  );
}
