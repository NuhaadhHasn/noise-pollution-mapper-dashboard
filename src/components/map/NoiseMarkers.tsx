import { Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Icon } from 'leaflet';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { NoiseReading } from '@/types/NoiseReading';
import { format } from 'date-fns';

// Custom marker icon factory
function createMarkerIcon(color: string): Icon {
  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg width="30" height="40" viewBox="0 0 30 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="15" cy="15" r="15" fill="${color}"/>
      </svg>
    `)}`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
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
  };
  onMarkersLoaded?: (count: number) => void;
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
export function NoiseMarkers({ filters, onMarkersLoaded }: NoiseMarkersProps) {
  const [readings, setReadings] = useState<NoiseReading[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const map = useMap();

  useEffect(() => {
    const q = query(collection(db, 'noise_readings'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const readingData = doc.data();
        // Debug: Log first 3 documents to see structure
        if (snapshot.docs.indexOf(doc) < 3) {
          console.log(`Reading ${doc.id}:`, readingData);
          console.log(`  Has latitude:`, 'latitude' in readingData);
          console.log(`  Has longitude:`, 'longitude' in readingData);
          console.log(`  Latitude value:`, readingData.latitude);
          console.log(`  Longitude value:`, readingData.longitude);
          console.log(`  Has soundCategory:`, 'soundCategory' in readingData);
          console.log(`  Has soundClass:`, 'soundClass' in readingData);
          console.log(`  Decibel level:`, readingData.decibelLevel);
          console.log('---');
        }
        return {
          id: doc.id,
          ...readingData,
        };
      }) as NoiseReading[];
      setReadings(data);
      setIsLoading(false);
    }, (error) => {
      console.error('Error fetching noise readings:', error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Apply filters and validate data
  const filteredReadings = readings.filter(reading => {
    // Validate location exists (flat structure: latitude/longitude at root level)
    let isValidLocation = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const read = reading as any;
    
    // Check for flat structure (latitude/longitude at root level)
    if (typeof read.latitude === 'number' && typeof read.longitude === 'number') {
      isValidLocation = true;
    }
    // Check for nested structure (location.latitude/location.longitude)
    else if (reading.location) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loc = reading.location as any;
      if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
        isValidLocation = true;
      }
    }
    // Check for GeoJSON format (lat/lng at root level)
    else if (typeof read.lat === 'number' && typeof read.lng === 'number') {
      isValidLocation = true;
    }
    // Check for GeoJSON Point (coordinates array at root level)
    else if (Array.isArray(read.coordinates) && read.coordinates.length >= 2) {
      isValidLocation = true;
    }
    
    if (!isValidLocation) {
      console.warn('Invalid location data for reading:', reading.id, reading);
      return false;
    }
    
    // Validate decibel level
    if (typeof reading.decibelLevel !== 'number') {
      console.warn('Invalid decibel level for reading:', reading.id);
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
    
    // Apply date filter
    if (filters?.dateRange) {
      const readingDate = reading.timestamp?.toDate?.();
      if (!readingDate || readingDate < filters.dateRange.start ||
          readingDate > filters.dateRange.end) {
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
        // Extract coordinates - check flat structure first
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const read = reading as any;
        let lat: number | undefined;
        let lng: number | undefined;
        
        // Flat structure (latitude/longitude at root level)
        if (typeof read?.latitude === 'number' && typeof read?.longitude === 'number') {
          lat = read.latitude;
          lng = read.longitude;
        }
        // Nested structure (location.latitude/location.longitude)
        else if (reading.location) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const loc = reading.location as any;
          if (typeof loc.latitude === 'number') {
            lat = loc.latitude;
            lng = loc.longitude;
          }
        }
        // GeoJSON format (lat/lng at root level)
        else if (typeof read?.lat === 'number' && typeof read?.lng === 'number') {
          lat = read.lat;
          lng = read.lng;
        }
        // GeoJSON Point (coordinates array at root level)
        else if (Array.isArray(read?.coordinates)) {
          lng = read.coordinates[0];
          lat = read.coordinates[1];
        }
        
        // Skip if no valid coordinates
        if (!lat || !lng) {
          return null;
        }
        
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
                      {reading.decibelLevel} dB
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
                    {reading.timestamp?.toDate?.()
                      ? format(reading.timestamp.toDate(), 'MMM d, yyyy h:mm a')
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
