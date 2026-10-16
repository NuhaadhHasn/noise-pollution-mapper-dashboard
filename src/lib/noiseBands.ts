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

export interface NoiseBand {
  id: NoiseBandId;
  label: 'Low' | 'Moderate' | 'High';
  color: string;
}

/** Readings strictly below this are Low. */
export const LOW_BAND_BELOW_DB = 50;

/** Readings up to and including this are Moderate; above it, High. */
export const MODERATE_BAND_MAX_DB = 70;

export const NOISE_BANDS: Readonly<Record<NoiseBandId, NoiseBand>> = {
  low: { id: 'low', label: 'Low', color: '#4CAF50' },
  moderate: { id: 'moderate', label: 'Moderate', color: '#FF9800' },
  high: { id: 'high', label: 'High', color: '#F44336' },
};

/** Band for a finite dB value. Callers pass finite numbers (normalizeReading drops other docs). */
export function noiseBand(decibels: number): NoiseBand {
  if (decibels < LOW_BAND_BELOW_DB) return NOISE_BANDS.low;
  if (decibels <= MODERATE_BAND_MAX_DB) return NOISE_BANDS.moderate;
  return NOISE_BANDS.high;
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
