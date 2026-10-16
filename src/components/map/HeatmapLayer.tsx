import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import type { NoiseReading } from '@/types/NoiseReading';
import { getCoordinates } from '@/lib/readings';

interface HeatmapLayerProps {
  readings: NoiseReading[];
  visible?: boolean;
}

/**
 * HeatmapLayer - Displays noise pollution density heatmap
 * 
 * Features:
 * - Color-coded by noise level (green → yellow → orange → red)
 * - Intensity based on dB level
 * - Real-time updates
 * - Performance optimized for 3000+ markers
 */
export function HeatmapLayer({ readings, visible = true }: HeatmapLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!readings || readings.length === 0) return;

    // Convert readings to heat points [lat, lng, intensity]
    const heatPoints: [number, number, number][] = readings.map(reading => {
      // Extract coordinates through the shared helper (flat, finite lat/lng)
      const coords = getCoordinates(reading);
      const lat = coords?.lat;
      const lng = coords?.lng;

      // Normalize intensity based on dB level (0-1 scale)
      // 30dB = 0.0 (quietest), 100dB = 1.0 (loudest)
      const intensity = reading.decibelLevel 
        ? Math.min(1.0, Math.max(0.0, (reading.decibelLevel - 30) / 70))
        : 0.5;

      return [lat || 0, lng || 0, intensity] as [number, number, number];
    }).filter((point): point is [number, number, number] => point[0] !== 0 && point[1] !== 0); // Filter invalid coordinates

    // Create heat layer (leaflet.heat plugin)
    const heatLayer = L.heatLayer(heatPoints, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      minOpacity: 0.4,
      max: 1.0,
      gradient: {
        0.0: '#4CAF50',   // Green (quiet: <50dB)
        0.35: '#FFEB3B',  // Yellow (moderate: 50-60dB)
        0.65: '#FF9800',  // Orange (loud: 60-70dB)
        1.0: '#F44336'    // Red (very loud: >70dB)
      },
      pane: 'overlayPane'
    });

    // Add to map if visible
    if (visible) {
      heatLayer.addTo(map);
    }

    // Cleanup
    return () => {
      map.removeLayer(heatLayer);
    };
  }, [readings, visible, map]);

  return null;
}
