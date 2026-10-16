import { useCallback, useEffect, useMemo, useState } from 'react';
import { Popup } from 'react-leaflet';
import { useLeafletContext } from '@react-leaflet/core';
import L, { Icon } from 'leaflet';
import type { NoiseReading } from '@/types/NoiseReading';
import { categoryLabel, confidenceLabel } from '@/lib/categories';
import { format } from 'date-fns';
import { getCoordinates, getReadingDate } from '@/lib/readings';
import { NOISE_BANDS, noiseBand } from '@/lib/noiseBands';

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

// One pin per noise band, built once at module load (perf-3). Before this every
// marker allocated its own Icon plus a base64 SVG on every render, and
// react-leaflet called setIcon on every marker because each Icon was a new
// object. Colours come from the shared band module (convention 2.11).
const BAND_ICONS = {
  low: createMarkerIcon(NOISE_BANDS.low.color),
  moderate: createMarkerIcon(NOISE_BANDS.moderate.color),
  high: createMarkerIcon(NOISE_BANDS.high.color),
};

interface NoiseMarkersProps {
  /**
   * The readings to draw, already filtered by the caller (src/lib/mapFilters.ts).
   * This component draws exactly what it is given, so the markers, the heatmap
   * and the marker badge always show the same set (bug-2, bug-9).
   */
  readings: NoiseReading[];
}

// Adds markers in slices of this size, one macrotask apart (perf-4).
const CHUNK_SIZE = 500;

function isMarkerCluster(container: unknown): container is L.MarkerClusterGroup {
  return typeof (container as L.MarkerClusterGroup | undefined)?.addLayers === 'function';
}

interface ReadingPopupProps {
  reading: NoiseReading;
  onClose: () => void;
}

/** The one popup, rendered by React and attached to the map at the pin's position. */
function ReadingPopup({ reading, onClose }: ReadingPopupProps) {
  const coords = getCoordinates(reading);
  const lat = coords?.lat;
  const lng = coords?.lng;
  // A stable position keeps react-leaflet from closing and re-opening the popup on every render.
  const position = useMemo<L.LatLngTuple | null>(
    () => (lat === undefined || lng === undefined ? null : [lat, lng]),
    [lat, lng],
  );
  // Fires when the user closes the popup (X button or a map click).
  const eventHandlers = useMemo(() => ({ remove: onClose }), [onClose]);

  if (!position) {
    return null;
  }

  const readingDate = getReadingDate(reading);
  const category = categoryLabel(reading);
  const band = noiseBand(reading.decibelLevel);

  return (
    <Popup position={position} offset={[0, -42]} eventHandlers={eventHandlers}>
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
              style={{ backgroundColor: band.color }}
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
  );
}

/**
 * NoiseMarkers - Displays already-filtered noise readings as markers on the map
 *
 * Purely presentational: it loads nothing, filters nothing, logs nothing and
 * reports nothing to its parent.
 * - Color-coded by dB level (one cached pin per noise band)
 * - Markers are built in plain Leaflet and bulk-added to the surrounding
 *   MarkerClusterGroup in chunks (perf-4); React renders no per-marker tree
 * - ONE React-rendered popup for the selected reading. Reading fields are
 *   attacker-writable, so they only ever reach the DOM through JSX
 *   (master convention 2.12): no bindPopup(string), no innerHTML
 * - An empty list renders nothing: MapPage shows the filter-aware empty overlay (ux-2)
 */
export function NoiseMarkers({ readings }: NoiseMarkersProps) {
  // Inside <MarkerClusterGroup> the layer container IS the cluster group.
  const { layerContainer } = useLeafletContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Build every marker once per `readings` change and add them in chunks, so a
  // 3,000-marker commit never blocks the main thread in one piece. The chunk
  // loop is ours, not markercluster's chunkedLoading: that loop cannot be
  // cancelled, so a filter change mid-load would re-add stale markers.
  useEffect(() => {
    if (!isMarkerCluster(layerContainer)) {
      return;
    }
    const cluster = layerContainer;

    const markers: L.Marker[] = [];
    for (const reading of readings) {
      const coords = getCoordinates(reading);
      if (!coords) {
        continue;
      }
      const marker = L.marker([coords.lat, coords.lng], {
        icon: BAND_ICONS[noiseBand(reading.decibelLevel).id],
      });
      marker.on('click', () => setSelectedId(reading.id));
      markers.push(marker);
    }

    let offset = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function addNextChunk() {
      cluster.addLayers(markers.slice(offset, offset + CHUNK_SIZE));
      offset += CHUNK_SIZE;
      if (offset < markers.length) {
        timer = setTimeout(addNextChunk, 0);
      }
    }
    addNextChunk();

    return () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      cluster.clearLayers();
    };
  }, [readings, layerContainer]);

  // The open popup follows the reading by id, so a Sync that replaces the
  // readings array keeps it open, and a filter that removes the reading closes it.
  const selected = useMemo(
    () => (selectedId === null ? null : (readings.find((reading) => reading.id === selectedId) ?? null)),
    [readings, selectedId],
  );
  const selectedKey = selected ? selected.id : null;
  const closeSelected = useCallback(() => {
    setSelectedId((current) => (current === selectedKey ? null : current));
  }, [selectedKey]);

  return selected ? <ReadingPopup key={selected.id} reading={selected} onClose={closeSelected} /> : null;
}
