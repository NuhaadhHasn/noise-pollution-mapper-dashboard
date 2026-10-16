import { Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Icon } from 'leaflet';
import { useEffect, useState } from 'react';
import type { NoiseReading } from '@/types/NoiseReading';
import { format } from 'date-fns';
import { getCoordinates, getReadingDate } from '@/lib/readings';
import * as localDb from '@/utils/db';
import * as syncManager from '@/utils/syncManager';

// Custom marker icon factory - Pin-shaped marker
function createMarkerIcon(color: string): Icon {
  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Pin shape (teardrop) -->
        <path d="M16 0C7.163 0 0 7.163 0 16C0 26.5 16 42 16 42C16 42 32 26.5 32 16C32 7.163 24.837 0 16 0Z" fill="${color}"/>
        <!-- White border -->
        <path d="M16 0C7.163 0 0 7.163 0 16C0 26.5 16 42 16 42C16 42 32 26.5 32 16C32 7.163 24.837 0 16 0Z" fill="none" stroke="white" stroke-width="2.5"/>
        <!-- Inner white circle for contrast -->
        <circle cx="16" cy="14" r="6" fill="white"/>
        <!-- Colored center dot -->
        <circle cx="16" cy="14" r="4" fill="${color}"/>
      </svg>
    `)}`,
    iconSize: [32, 42],
    iconAnchor: [16, 42], // Point at bottom center
    popupAnchor: [0, -42], // Popup opens above marker
  });
}

// Get marker color by dB level
function getMarkerColor(decibelLevel: number): string {
  if (decibelLevel < 50) return '#4CAF50'; // Green - Quiet
  if (decibelLevel <= 70) return '#FF9800'; // Orange - Moderate
  return '#F44336'; // Red - Loud
}

interface NoiseMarkersProps {
  filters?: {
    dateRange?: { start: Date; end: Date };
    categories?: string[];
    dbRange?: { min: number; max: number };
    userId?: string; // Filter by specific user (Phase 1)
    showAllUsers?: boolean; // Show all users' readings (Phase 2)
  };
  onMarkersLoaded?: (count: number) => void;
  onDataChange?: (data: NoiseReading[]) => void;
}

/**
 * NoiseMarkers - Displays noise readings as markers on the map
 *
 * Features:
 * - Real-time Firestore sync
 * - Color-coded by dB level
 * - Filtering support
 * - Loading and empty states
 */
export function NoiseMarkers({ filters, onMarkersLoaded, onDataChange }: NoiseMarkersProps) {
  const [readings, setReadings] = useState<NoiseReading[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const map = useMap();

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        // Step 1: Load from IndexedDB cache (instant, 0 Firebase reads)
        const cachedReadings = await localDb.getAllReadings();
        
        if (isMounted) {
          setReadings(cachedReadings);
          setIsLoading(false);
          
          if (onMarkersLoaded) {
            onMarkersLoaded(cachedReadings.length);
          }
          
          if (onDataChange && cachedReadings.length > 0) {
            onDataChange(cachedReadings);
          }
        }

        // Step 2: Background sync - fetch only NEW readings since last sync
        const syncResult = await syncManager.syncNewReadings();
        
        if (isMounted && syncResult.newCount > 0) {
          // Reload all readings from IndexedDB (includes new ones)
          const updatedReadings = await localDb.getAllReadings();
          setReadings(updatedReadings);
          
          if (onMarkersLoaded) {
            onMarkersLoaded(updatedReadings.length);
          }
          
          if (onDataChange) {
            onDataChange(updatedReadings);
          }
        }
      } catch (error) {
        console.error('Error loading readings:', error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [onMarkersLoaded, onDataChange]);

  // Apply filters and validate data
  const filteredReadings = readings.filter(reading => {
    // Validate location: flat, finite, in-range latitude/longitude (shared
    // helper). Never log the reading here: it carries GPS and the author
    // label, and this runs on every render (priv-5, convention 2.13).
    if (!getCoordinates(reading)) {
      return false;
    }

    // Validate decibel level
    if (typeof reading.decibelLevel !== 'number') {
      return false;
    }
    
    // Apply dB filter
    if (filters?.dbRange) {
      if (reading.decibelLevel < filters.dbRange.min ||
          reading.decibelLevel > filters.dbRange.max) {
        return false;
      }
    }
    
    // Apply category filter (check both soundCategory and soundClass)
    if (filters?.categories && filters.categories.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const category = (reading as any).soundCategory || (reading as any).soundClass;
      if (!filters.categories.includes(category)) {
        return false;
      }
    }
    
    // Apply date filter. The server `timestamp` decides; the client-clock
    // `createdAt` is used only when `timestamp` is missing (bug-8).
    if (filters?.dateRange) {
      const readingDate = getReadingDate(reading);
      if (!readingDate || readingDate < filters.dateRange.start ||
          readingDate > filters.dateRange.end) {
        return false;
      }
    }

    // Apply user filter (Phase 1: User-Based Restrictions)
    if (filters?.userId && !filters?.showAllUsers) {
      // Filter by specific user's readings
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const read = reading as any;
      if (read.userId !== filters.userId) {
        return false;
      }
    }

    return true;
  });

  // Notify parent of marker count
  useEffect(() => {
    if (onMarkersLoaded) {
      onMarkersLoaded(filteredReadings.length);
    }
  }, [filteredReadings.length, onMarkersLoaded]);

  // Show loading state
  if (isLoading) {
    return null; // Map will show loading indicator
  }

  // Show empty state message (as a popup at map center)
  if (filteredReadings.length === 0) {
    return (
      <Marker
        position={map.getCenter() as LatLngExpression}
        icon={createMarkerIcon('#9E9E9E')}
      >
        <Popup>
          <div className="text-center p-2">
            <p className="font-semibold mb-1">No noise readings yet</p>
            <p className="text-sm text-gray-600">
              Be the first to contribute data using our mobile app!
            </p>
          </div>
        </Popup>
      </Marker>
    );
  }

  return (
    <>
      {filteredReadings.map((reading) => {
        // Coordinates and date through the shared helpers (bug-1)
        const coords = getCoordinates(reading);
        if (!coords) {
          return null;
        }
        const { lat, lng } = coords;
        const readingDate = getReadingDate(reading);

        // Get category (check both soundCategory and soundClass)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const category = (reading as any).soundCategory || (reading as any).soundClass || 'Unknown';

        return (
          <Marker
            key={reading.id}
            position={[lat, lng] as LatLngExpression}
            icon={createMarkerIcon(getMarkerColor(reading.decibelLevel))}
          >
            <Popup>
              <div className="min-w-[200px]">
                <h3 className="font-semibold text-base mb-2">
                  {reading.locationName || 'Unknown Location'}
                </h3>

                <div className="space-y-2">
                  {/* Noise Level */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Noise Level:</span>
                    <span
                      className="px-2 py-1 rounded text-xs font-semibold text-white"
                      style={{ backgroundColor: getMarkerColor(reading.decibelLevel) }}
                    >
                      {reading.decibelLevel.toFixed(1)} dB
                    </span>
                  </div>

                  {/* Sound Category */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Category:</span>
                    <span className="text-sm font-medium">{category}</span>
                  </div>

                  {/* Sound Type */}
                  {reading.soundType && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Type:</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        reading.soundType === 'Pollution'
                          ? 'bg-red-100 text-red-800'
                          : reading.soundType === 'Ambient'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {reading.soundType}
                      </span>
                    </div>
                  )}

                  {/* Confidence */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Confidence:</span>
                    <span className="text-sm font-medium">
                      {((reading.confidence || 0) * 100).toFixed(1)}%
                    </span>
                  </div>

                  {/* Timestamp */}
                  <div className="text-xs text-gray-500 mt-3 pt-2 border-t">
                    {readingDate
                      ? format(readingDate, 'MMM d, yyyy h:mm a')
                      : 'No timestamp'}
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
