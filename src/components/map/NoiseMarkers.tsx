import { Marker, Popup } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Icon } from 'leaflet';
import type { NoiseReading } from '@/types/NoiseReading';
import { categoryLabel, confidenceLabel } from '@/lib/categories';
import { format } from 'date-fns';
import { getCoordinates, getReadingDate } from '@/lib/readings';

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
  /**
   * The readings to draw, already filtered by the caller (src/lib/mapFilters.ts).
   * This component draws exactly what it is given, so the markers, the heatmap
   * and the marker badge always show the same set (bug-2, bug-9).
   */
  readings: NoiseReading[];
}

/**
 * NoiseMarkers - Displays already-filtered noise readings as markers on the map
 *
 * Purely presentational: it loads nothing, filters nothing, logs nothing and
 * reports nothing to its parent.
 * - Color-coded by dB level
 * - A popup per marker
 * - An empty list renders nothing: MapPage shows the filter-aware empty overlay (ux-2)
 */
export function NoiseMarkers({ readings }: NoiseMarkersProps) {
  // Nothing to draw: MapPage explains why (ux-2). No marker is ever invented.
  if (readings.length === 0) {
    return null;
  }

  return (
    <>
      {readings.map((reading) => {
        // Coordinates and date through the shared helpers (bug-1)
        const coords = getCoordinates(reading);
        if (!coords) {
          return null;
        }
        const { lat, lng } = coords;
        const readingDate = getReadingDate(reading);

        // Category text: the stored soundClass, or 'Unclassified' when absent
        const category = categoryLabel(reading);

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
                      {confidenceLabel(reading, 1)}
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
