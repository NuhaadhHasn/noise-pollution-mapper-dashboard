/**
 * Sound-category taxonomy. This is the ONLY place the dashboard names
 * categories, colours or icons: no component may keep its own map (master
 * playbook convention 2.11).
 *
 * It mirrors the Flutter app, which is the only writer of `soundClass`
 * (lib/services/yamnet_class_mapping.dart):
 *   names    categoryTraffic ... categoryQuiet, categoryUncertain
 *   type     getSoundType()
 *   icons    getCategoryIcon()
 *   colours  getCategoryColor()
 * Manual reports (lib/screens/report_noise_screen.dart) additionally write
 * 'Speech-Pollution' and 'Speech-Ambient'. They are aliases of 'Speech' on the
 * category axis; the stored `soundType` of such a reading is untouched.
 *
 * 'Quiet' is a CATEGORY (the YAMNet 'Silence' class). It is never a dB-band
 * label: bands live in noiseBands.ts and are Low / Moderate / High.
 */

export type SoundType = 'Pollution' | 'Ambient';

export interface CategoryInfo {
  name: string;
  color: string;
  icon: string;
  soundType: SoundType;
}

/** Label for a reading that has no soundClass. Never a chart category. */
export const UNCLASSIFIED = 'Unclassified';

/** Shown where a numeric value (confidence) is absent. */
export const ABSENT_VALUE = '—';

const OTHER_INFO: CategoryInfo = { name: 'Other', color: '#9E9E9E', icon: '🔊', soundType: 'Ambient' };

const UNCLASSIFIED_INFO: CategoryInfo = {
  name: UNCLASSIFIED,
  color: '#BDBDBD',
  icon: '❔',
  soundType: 'Ambient',
};

// 18 app categories plus the live-only 'Uncertain'. Colours, icons and types
// are copied from the app (see the header comment).
const CATEGORY_LIST: readonly CategoryInfo[] = [
  { name: 'Traffic', color: '#F44336', icon: '🚗', soundType: 'Pollution' },
  { name: 'Tuk-tuk', color: '#FF9800', icon: '🛺', soundType: 'Pollution' },
  { name: 'Construction', color: '#FF5722', icon: '🏗️', soundType: 'Pollution' },
  { name: 'Industrial', color: '#795548', icon: '🏭', soundType: 'Pollution' },
  { name: 'Transport', color: '#1565C0', icon: '🚆', soundType: 'Pollution' },
  { name: 'Alarm', color: '#C62828', icon: '🚨', soundType: 'Pollution' },
  { name: 'Speech', color: '#2196F3', icon: '🗣️', soundType: 'Ambient' },
  { name: 'Music', color: '#9C27B0', icon: '🎵', soundType: 'Ambient' },
  { name: 'Religious', color: '#FFEB3B', icon: '🔔', soundType: 'Ambient' },
  { name: 'Market', color: '#00BCD4', icon: '🏪', soundType: 'Ambient' },
  { name: 'Nature', color: '#4CAF50', icon: '🌿', soundType: 'Ambient' },
  { name: 'Domestic', color: '#FFB300', icon: '🏠', soundType: 'Ambient' },
  { name: 'Body Sounds', color: '#9575CD', icon: '👤', soundType: 'Ambient' },
  { name: 'Sports', color: '#43A047', icon: '⚽', soundType: 'Ambient' },
  { name: 'Weather', color: '#039BE5', icon: '🌦️', soundType: 'Ambient' },
  { name: 'Office', color: '#5E35B1', icon: '💼', soundType: 'Ambient' },
  { name: 'Quiet', color: '#00897B', icon: '🔇', soundType: 'Ambient' },
  OTHER_INFO,
  { name: 'Uncertain', color: '#757575', icon: '❓', soundType: 'Ambient' },
];

// A Map, not an object literal: `soundClass` is writable by any registrant, so
// a value such as 'constructor' must never resolve to an Object.prototype member.
const BY_NAME: ReadonlyMap<string, CategoryInfo> = new Map<string, CategoryInfo>(
  CATEGORY_LIST.map((info): [string, CategoryInfo] => [info.name, info])
);

/** Every canonical category name (the 18 app categories plus 'Uncertain'). */
export const APP_CATEGORY_NAMES: readonly string[] = CATEGORY_LIST.map((info) => info.name);

/** Stored values that are not categories of their own, mapped to the category they fold into. */
export const CATEGORY_ALIASES: ReadonlyMap<string, string> = new Map<string, string>([
  ['Speech-Pollution', 'Speech'],
  ['Speech-Ambient', 'Speech'],
]);

/** The one reading shape the helpers below need. NoiseReading satisfies it. */
export interface Classified {
  soundClass?: string | null;
  confidence?: number | null;
}

function cleanClass(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Canonical category for grouping.
 * - blank, missing or non-string      -> 'Unclassified'
 * - an alias ('Speech-Pollution' ...) -> the category it folds into
 * - a known category                  -> itself
 * - anything else (legacy strings)    -> 'Other'
 */
export function canonicalCategory(raw: string | null | undefined): string {
  const name = cleanClass(raw);
  if (name === '' || name === UNCLASSIFIED) return UNCLASSIFIED;
  const canonical = CATEGORY_ALIASES.get(name) ?? name;
  return BY_NAME.has(canonical) ? canonical : OTHER_INFO.name;
}

/** Colour, icon and type for any stored value. Never undefined. */
export function categoryInfo(raw: string | null | undefined): CategoryInfo {
  const canonical = canonicalCategory(raw);
  if (canonical === UNCLASSIFIED) return UNCLASSIFIED_INFO;
  return BY_NAME.get(canonical) ?? OTHER_INFO;
}

/** Canonical category of a reading, for grouping and filtering. */
export function categoryOf(reading: Pick<Classified, 'soundClass'>): string {
  return canonicalCategory(reading.soundClass);
}

/**
 * Category text for display and export: the stored soundClass as written
 * ('Speech-Pollution' stays visible), or 'Unclassified' when there is none.
 */
export function categoryLabel(reading: Pick<Classified, 'soundClass'>): string {
  const raw = cleanClass(reading.soundClass);
  return raw === '' ? UNCLASSIFIED : raw;
}

/** Confidence as stored (0..1), or null when the reading has none. 0 is a real value. */
export function confidenceOf(reading: Pick<Classified, 'confidence'>): number | null {
  const value = reading.confidence;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Confidence as a percentage (0..100), or null when absent. */
export function confidencePercent(reading: Pick<Classified, 'confidence'>): number | null {
  const value = confidenceOf(reading);
  return value === null ? null : value * 100;
}

/** '87%' (or '87.6%' with digits = 1), or an em dash when confidence is absent. */
export function confidenceLabel(reading: Pick<Classified, 'confidence'>, digits = 0): string {
  const percent = confidencePercent(reading);
  return percent === null ? ABSENT_VALUE : `${percent.toFixed(digits)}%`;
}
