import { useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import type { NoiseReading } from '@/types/NoiseReading';
import { buildHeatPoints, HEAT_MAX_DB } from '@/lib/mapFilters';
import { LOW_BAND_BELOW_DB, MODERATE_BAND_MAX_DB, NOISE_BANDS } from '@/lib/noiseBands';

interface HeatmapLayerProps {
  /** Already-filtered readings: the same array the markers and the badge use. */
  readings: NoiseReading[];
  visible?: boolean;
}

// Gradient stops sit on the band thresholds (the same 50 / 70 dB the pins and
// the legend use), on the 0..1 scale heatIntensity() produces (dB / 120). A
// lone reading therefore lands on its own band colour: below 50 dB green,
// 70 dB orange, 100 dB and up red. Colours come from the shared band module.
const LOW_STOP = LOW_BAND_BELOW_DB / HEAT_MAX_DB;
const MODERATE_STOP = MODERATE_BAND_MAX_DB / HEAT_MAX_DB;

const HEAT_GRADIENT: { [stop: number]: string } = {
  0.0: NOISE_BANDS.low.color,
  [LOW_STOP]: NOISE_BANDS.low.color,
  [MODERATE_STOP]: NOISE_BANDS.moderate.color,
  1.0: NOISE_BANDS.high.color,
};

/**
 * HeatmapLayer - Displays where readings concentrate, tinted by loudness
 *
 * Features:
 * - Intensity is dB / 120, clamped, exactly like the app's heatmap; 0 dB is a real value
 * - Readings at one site are averaged first, so repeat recordings do not stack
 * - Gradient stops follow the shared noise bands (convention 2.11)
 * - Builds nothing while hidden
 */
export function HeatmapLayer({ readings, visible = true }: HeatmapLayerProps) {
  const map = useMap();
  const heatPoints = useMemo(() => buildHeatPoints(readings), [readings]);

  useEffect(() => {
    if (!visible || heatPoints.length === 0) return;

    // leaflet.heat sums the points that share a screen cell, scaled by
    // 1 / 2^(maxZoom - zoom) (HeatLayer.js _redraw). maxZoom 12 keeps zoomed-out
    // views readable; at HEAD's 17 every cell was scaled by 1/1024 at the
    // default zoom 7 and sat on the minOpacity floor.
    const heatLayer = L.heatLayer(heatPoints, {
      radius: 25,
      blur: 15,
      maxZoom: 12,
      minOpacity: 0.35, // below LOW_STOP, so a lone quiet reading keeps the Low colour
      max: 1.0,
      gradient: HEAT_GRADIENT,
      pane: 'overlayPane',
    });
    heatLayer.addTo(map);

    return () => {
      map.removeLayer(heatLayer);
    };
  }, [heatPoints, visible, map]);

  return null;
}
