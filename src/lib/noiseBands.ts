/**
 * dB bands: the ONLY place the dashboard defines the 50 / 70 thresholds and
 * the band labels and colours (master playbook convention 2.11).
 *
 *   dB < 50        Low
 *   50 <= dB <= 70 Moderate
 *   dB > 70        High
 *
 * The thresholds match the Flutter app. A band is NEVER labelled 'Quiet':
 * 'Quiet' is a sound category (categories.ts). Colours are the app's noise
 * colours; only cluster 10 step 4 may change them, and only here.
 */

export type NoiseBandId = 'low' | 'moderate' | 'high';

export type BandGlyphShape = 'circle' | 'square' | 'triangle';

export interface NoiseBand {
  id: NoiseBandId;
  label: 'Low' | 'Moderate' | 'High';
  color: string;
  /** Text colour for badges drawn on `color`; WCAG AA (>= 4.5:1), asserted by contrast.test.ts. */
  textColor: string;
  /** Shape drawn in map pins and legend swatches, so a band is never told by colour alone. */
  glyph: BandGlyphShape;
}

/** Readings strictly below this are Low. */
export const LOW_BAND_BELOW_DB = 50;

/** Readings up to and including this are Moderate; above it, High. */
export const MODERATE_BAND_MAX_DB = 70;

export const NOISE_BANDS: Readonly<Record<NoiseBandId, NoiseBand>> = {
  low: { id: 'low', label: 'Low', color: '#4CAF50', textColor: '#1E1932', glyph: 'circle' },
  moderate: { id: 'moderate', label: 'Moderate', color: '#FF9800', textColor: '#1E1932', glyph: 'square' },
  high: { id: 'high', label: 'High', color: '#F44336', textColor: '#1E1932', glyph: 'triangle' },
};

/** Band for a finite dB value. Callers pass finite numbers (normalizeReading drops other docs). */
export function noiseBand(decibels: number): NoiseBand {
  if (decibels < LOW_BAND_BELOW_DB) return NOISE_BANDS.low;
  if (decibels <= MODERATE_BAND_MAX_DB) return NOISE_BANDS.moderate;
  return NOISE_BANDS.high;
}

const PIN_GLYPH_INK = '#1E1932';

// Static SVG fragments for the centre of a map pin (32x42 pin, white disc of
// radius 6 at 16,14). They contain no reading data, only fixed shapes.
const PIN_GLYPH_MARKUP: Readonly<Record<BandGlyphShape, string>> = {
  circle: `<circle cx="16" cy="14" r="4" fill="${PIN_GLYPH_INK}"/>`,
  square: `<rect x="12" y="10" width="8" height="8" fill="${PIN_GLYPH_INK}"/>`,
  triangle: `<path d="M16 9.5 L20.5 17.5 L11.5 17.5 Z" fill="${PIN_GLYPH_INK}"/>`,
};

/**
 * Centre glyph for the pin drawn in a band colour (a11y-5). A colour that is
 * not a band colour (the grey empty-state pin) gets a plain grey dot.
 */
export function bandMarkerGlyph(color: string): string {
  const wanted = color.toUpperCase();
  const band = Object.values(NOISE_BANDS).find((candidate) => candidate.color.toUpperCase() === wanted);
  return band ? PIN_GLYPH_MARKUP[band.glyph] : '<circle cx="16" cy="14" r="4" fill="#9E9E9E"/>';
}

/**
 * One-line disclosure for every place a dB number is shown as a finding: the
 * stats row (07.3), the CSV header and JSON note (07.3), and the map legend
 * (09.4 imports this same constant). It mirrors the app's own wording
 * (APP lib/screens/dashboard_screen.dart:1015): the app has no reference-SPL
 * calibration and no per-device profile, so absolute levels differ by phone.
 */
export const DB_CAVEAT =
  'dB values are uncalibrated estimates from phone microphones; levels vary by device.';
