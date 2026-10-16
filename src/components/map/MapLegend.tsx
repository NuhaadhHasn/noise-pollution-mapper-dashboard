import { useTheme } from '@/contexts/ThemeContext';
import {
  DB_CAVEAT,
  LOW_BAND_BELOW_DB,
  MODERATE_BAND_MAX_DB,
  NOISE_BANDS,
} from '@/lib/noiseBands';

// One row per dB band. Thresholds, labels and colours all come from the shared
// band module (master convention 2.11), so the legend can never drift from the
// pins, the table badges or the heatmap gradient.
const BAND_ROWS = [
  { band: NOISE_BANDS.low, range: `below ${LOW_BAND_BELOW_DB} dB` },
  { band: NOISE_BANDS.moderate, range: `${LOW_BAND_BELOW_DB}\u2013${MODERATE_BAND_MAX_DB} dB` },
  { band: NOISE_BANDS.high, range: `above ${MODERATE_BAND_MAX_DB} dB` },
];

interface MapLegendProps {
  /** Adds the heatmap note while the heat layer is on. */
  showHeatmap: boolean;
}

/**
 * MapLegend - What the pin colours (and the heat layer) mean.
 *
 * Sits bottom-left above the marker badge, never bottom-right, so it cannot
 * cover the OpenStreetMap attribution.
 */
export function MapLegend({ showHeatmap }: MapLegendProps) {
  const { isDarkMode } = useTheme();
  const muted = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div
      role="group"
      aria-label="Map legend"
      className={`absolute bottom-16 left-4 z-[400] max-w-[15rem] rounded-lg px-3 py-2 shadow-lg text-xs ${
        isDarkMode ? 'bg-[#2D2640] text-gray-200' : 'bg-white text-gray-800'
      }`}
    >
      <p className="font-semibold mb-1.5">Noise level</p>
      <ul className="space-y-1">
        {BAND_ROWS.map(({ band, range }) => (
          <li key={band.id} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 shrink-0 rounded-full border border-white/70"
              style={{ backgroundColor: band.color }}
            />
            <span className="font-medium">{band.label}</span>
            <span className={muted}>{range}</span>
          </li>
        ))}
      </ul>
      {showHeatmap && (
        <p className={`mt-1.5 ${muted}`}>
          Heatmap: colour follows these bands. Nearby readings add up, so a hot spot can mean
          many readings rather than one loud one.
        </p>
      )}
      <p className={`mt-1.5 text-[11px] ${muted}`}>{DB_CAVEAT}</p>
    </div>
  );
}
