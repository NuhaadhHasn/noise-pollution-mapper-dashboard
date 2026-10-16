import { describe, expect, it } from 'vitest';
import {
  ABSENT_VALUE,
  APP_CATEGORY_NAMES,
  CATEGORY_ALIASES,
  UNCLASSIFIED,
  categoryInfo,
  categoryLabel,
  categoryOf,
  confidenceLabel,
  confidenceOf,
  confidencePercent,
} from '@/lib/categories';
import { LOW_BAND_BELOW_DB, MODERATE_BAND_MAX_DB, NOISE_BANDS, noiseBand } from '@/lib/noiseBands';

// The app's 18 categories, copied from the Flutter app
// (lib/services/yamnet_class_mapping.dart, categoryTraffic ... categoryQuiet).
// This list is the contract: if the app adds or renames a category, this test
// must be updated together with src/lib/categories.ts.
const APP_CATEGORIES = [
  'Traffic',
  'Tuk-tuk',
  'Construction',
  'Industrial',
  'Speech',
  'Music',
  'Religious',
  'Market',
  'Nature',
  'Other',
  'Domestic',
  'Alarm',
  'Body Sounds',
  'Transport',
  'Sports',
  'Weather',
  'Office',
  'Quiet',
];

// Values the app also writes to soundClass (manual reports) that are not categories.
const MANUAL_ALIASES = ['Speech-Pollution', 'Speech-Ambient'];

const HEX = /^#[0-9A-F]{6}$/i;

describe('taxonomy coverage', () => {
  it('has exactly the 18 app categories plus Uncertain', () => {
    expect([...APP_CATEGORY_NAMES].sort()).toEqual([...APP_CATEGORIES, 'Uncertain'].sort());
  });

  it.each([...APP_CATEGORIES, 'Uncertain', ...MANUAL_ALIASES])('%s has a colour and an icon', (name) => {
    const info = categoryInfo(name);
    expect(info.color).toMatch(HEX);
    expect(info.icon.length).toBeGreaterThan(0);
    expect(info.name).not.toBe(UNCLASSIFIED);
  });

  it('gives every category its own colour', () => {
    const colors = APP_CATEGORY_NAMES.map((name) => categoryInfo(name).color.toUpperCase());
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('keeps the app colours and icons for Quiet and Other', () => {
    expect(categoryInfo('Quiet').color).toBe('#00897B');
    expect(categoryInfo('Quiet').icon).toBe('🔇');
    expect(categoryInfo('Other').color).toBe('#9E9E9E');
    expect(categoryInfo('Other').icon).toBe('🔊');
  });

  it('makes Quiet look different from Other', () => {
    expect(categoryInfo('Quiet').color).not.toBe(categoryInfo('Other').color);
    expect(categoryInfo('Quiet').icon).not.toBe(categoryInfo('Other').icon);
  });

  it('follows the app for Pollution and Ambient', () => {
    for (const name of ['Traffic', 'Tuk-tuk', 'Construction', 'Industrial', 'Transport', 'Alarm']) {
      expect(categoryInfo(name).soundType).toBe('Pollution');
    }
    for (const name of ['Speech', 'Music', 'Sports', 'Quiet', 'Other', 'Nature']) {
      expect(categoryInfo(name).soundType).toBe('Ambient');
    }
  });

  it('declares both manual Speech values as aliases of Speech', () => {
    for (const alias of MANUAL_ALIASES) {
      expect(CATEGORY_ALIASES.get(alias)).toBe('Speech');
    }
  });
});

describe('categoryOf', () => {
  it('folds the manual Speech values into Speech', () => {
    expect(categoryOf({ soundClass: 'Speech-Pollution' })).toBe('Speech');
    expect(categoryOf({ soundClass: 'Speech-Ambient' })).toBe('Speech');
    expect(categoryOf({ soundClass: 'Speech' })).toBe('Speech');
  });

  it('keeps Quiet as its own category', () => {
    expect(categoryOf({ soundClass: 'Quiet' })).toBe('Quiet');
  });

  it('calls a reading with no soundClass Unclassified, never Other', () => {
    expect(categoryOf({})).toBe(UNCLASSIFIED);
    expect(categoryOf({ soundClass: undefined })).toBe(UNCLASSIFIED);
    expect(categoryOf({ soundClass: null })).toBe(UNCLASSIFIED);
    expect(categoryOf({ soundClass: '' })).toBe(UNCLASSIFIED);
    expect(categoryOf({ soundClass: '   ' })).toBe(UNCLASSIFIED);
  });

  it('routes an unknown legacy string to Other', () => {
    expect(categoryOf({ soundClass: 'Sirens' })).toBe('Other');
    expect(categoryOf({ soundClass: 'Machinery' })).toBe('Other');
  });

  it('never resolves a value that names an Object.prototype member', () => {
    expect(categoryOf({ soundClass: 'constructor' })).toBe('Other');
    expect(categoryOf({ soundClass: '__proto__' })).toBe('Other');
    expect(categoryOf({ soundClass: 'toString' })).toBe('Other');
    expect(categoryInfo('constructor').name).toBe('Other');
  });

  it('gives Unclassified a neutral colour that is not the Other colour', () => {
    const info = categoryInfo(UNCLASSIFIED);
    expect(info.name).toBe(UNCLASSIFIED);
    expect(info.color).not.toBe(categoryInfo('Other').color);
  });
});

describe('categoryLabel', () => {
  it('shows the stored value as written', () => {
    expect(categoryLabel({ soundClass: 'Traffic' })).toBe('Traffic');
    expect(categoryLabel({ soundClass: 'Speech-Pollution' })).toBe('Speech-Pollution');
    expect(categoryLabel({ soundClass: '  Quiet ' })).toBe('Quiet');
  });

  it('shows Unclassified when there is no soundClass', () => {
    expect(categoryLabel({})).toBe('Unclassified');
    expect(categoryLabel({ soundClass: null })).toBe('Unclassified');
    expect(categoryLabel({ soundClass: '' })).toBe('Unclassified');
  });
});

describe('confidence', () => {
  it('shows an em dash and no number when confidence is absent', () => {
    expect(ABSENT_VALUE).toBe('—');
    for (const reading of [{}, { confidence: undefined }, { confidence: null }, { confidence: Number.NaN }]) {
      expect(confidenceLabel(reading)).toBe('—');
      expect(confidenceOf(reading)).toBeNull();
      expect(confidencePercent(reading)).toBeNull();
    }
  });

  it('treats 0 as a real value', () => {
    expect(confidenceLabel({ confidence: 0 })).toBe('0%');
    expect(confidenceOf({ confidence: 0 })).toBe(0);
    expect(confidencePercent({ confidence: 0 })).toBe(0);
  });

  it('formats a percentage with the requested digits', () => {
    expect(confidenceLabel({ confidence: 0.876 })).toBe('88%');
    expect(confidenceLabel({ confidence: 0.876 }, 1)).toBe('87.6%');
    expect(confidenceLabel({ confidence: 1 })).toBe('100%');
    expect(confidenceOf({ confidence: 0.876 })).toBe(0.876);
  });
});

describe('noise bands', () => {
  it('uses 50 and 70 as the thresholds', () => {
    expect(LOW_BAND_BELOW_DB).toBe(50);
    expect(MODERATE_BAND_MAX_DB).toBe(70);
    expect(noiseBand(0).label).toBe('Low');
    expect(noiseBand(49.9).label).toBe('Low');
    expect(noiseBand(50).label).toBe('Moderate');
    expect(noiseBand(70).label).toBe('Moderate');
    expect(noiseBand(70.1).label).toBe('High');
    expect(noiseBand(120).label).toBe('High');
  });

  it('labels the bands Low, Moderate and High, and never Quiet', () => {
    const labels = Object.values(NOISE_BANDS).map((band) => band.label);
    expect(labels).toEqual(['Low', 'Moderate', 'High']);
    expect(labels).not.toContain('Quiet');
  });

  it('gives each band its own colour', () => {
    const colors = Object.values(NOISE_BANDS).map((band) => band.color);
    expect(new Set(colors).size).toBe(3);
    for (const color of colors) expect(color).toMatch(HEX);
  });

  it('keeps the Quiet category separate from every band label', () => {
    const labels = Object.values(NOISE_BANDS).map((band) => band.label as string);
    expect(labels).not.toContain(categoryInfo('Quiet').name);
  });
});
