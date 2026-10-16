# Playbook 06 — Category Taxonomy & Analytics Correctness

Implementation spec for the defect cluster covering the dashboard's category taxonomy (no `Quiet`, manual Speech reports split three ways, grey ❓ fallback), the 79.5% of production readings that have no `soundClass` (bucketed as 'Other' in the chart but 'Unknown' everywhere else, with absent confidence drawn as 0%), and the trend chart's week buckets (unpadded keys sorted as text, calendar year paired with an ISO week number).

**Execute steps in order. Each step is exactly one commit. Gate every step on `npx tsc -b` (0 errors), `npx eslint <the files the step changed>` (0 errors, no new warnings) and `npx vitest run <the test files the step names>`; run `npm test` and `npm run build` ONCE, at the end of Step 4 (master playbook §1.3).**

All BEFORE blocks below were copied verbatim from the working tree on 2026-10-15 (dashboard HEAD `353bbdd`), with two kinds of labelled exception:

- A BEFORE labelled "as left by Step N" is the AFTER text of an earlier step of this cluster. Use it where two steps touch the same region.
- The one BEFORE in `src/types/NoiseReading.ts` (Step 3, 3f) is the AFTER text of cluster 04 Step 3 (3a), because 04 rewrites that whole file.

Every other BEFORE is a short anchor that also matches after cluster 04's edits to the same files (04.2 and 04.3 replace other regions of `exportHelpers.ts`, `NoiseMarkers.tsx`, `DataTable.tsx` and `NoiseTrendChart.tsx`). If a BEFORE block does not match, STOP and re-read the file. Match on exact text, never on line numbers: the cited numbers are working-tree numbers at HEAD `353bbdd` and drift after clusters 04 and 05.

**Prerequisites.** Cluster 04 (all four steps) and cluster 05 are applied first (master §3.1). 06 relies on this from them:

- 01.1: vitest runs and `src/lib/__tests__/` is the test folder.
- 04.3: `NoiseReading.confidence` is already optional, and `NoiseReading.soundCategory` is still declared "until 06.3 removes it".
- 05: the chart components read readings from the `ReadingsProvider` through `useSyncedReadings()`. 06 does not edit that call.

Environment facts (verified):
- `date-fns ^4.1.0` (installed 4.1.0). It exports `getISOWeek`, `getISOWeekYear`, `startOfISOWeek`, `startOfHour`, `startOfDay` and `startOfMonth`; Step 4's tests exercise all of them.
- `recharts ^2.15.4`, `react ^19.2.0`, `typescript ~5.9.3`, `vitest 4.1.11` (added by 01.1).
- `tsconfig.app.json`: `target ES2022`, `verbatimModuleSyntax: true`, `erasableSyntaxOnly: true`, `strict: false` (until cluster 12). So: type-only imports use `import type` or an inline `type` modifier, there are no enums or namespaces, and `Object.fromEntries`/`Map` are available.
- Test files under `src/` are type-checked by `npx tsc -b` and linted by `npm run lint`. They import `describe`/`it`/`expect` from `vitest` explicitly.
- Both new library modules import nothing from Firebase, so the tests obey master §2.15.
- The categories and bands below were checked against the app at `9b08e68` (`lib/services/yamnet_class_mapping.dart`): all 19 names, icons, colours and Pollution/Ambient types in `src/lib/categories.ts` equal `getCategoryIcon`, `getCategoryColor` and `getSoundType` (checked by script when this spec was written). The 18 categories are `categoryTraffic` … `categoryQuiet`, plus the live-only `Uncertain`.
- Production ground truth (2026-10-16 probe): 3,374 `noise_readings`; only 691 (20.5%) have `soundClass`/`soundType`/`confidence`; 2,683 (79.5%) have none. Live `soundClass` values: Other 391, Speech 121, Transport 56, Nature 45, Traffic 25, Sports 14, Office 13, Tuk-tuk 7, Music 6, Construction 5, Body Sounds 3, Industrial 2, Religious 2, Speech-Pollution 1. `Quiet` and `Uncertain` do not exist in production yet, so they are forward-compatibility cases, verified by unit test and not by production data.
- Index rule: this cluster changes no query and adds no index.

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| data-3 | UNVERIFIED (Medium, confidence high); re-read in the working tree | `CategoryChart.tsx:15-63` keeps its own colour and icon maps with no `Quiet` or `Uncertain` and with phantom `Sirens`/`Machinery`/`Animals` keys. `Quiet` falls back to Other's grey and ❓ (`:93`, `:156`, `:182`). The manual reports `Speech-Pollution` and `Speech-Ambient` (`report_noise_screen.dart:44,47`) get their own bars, so Speech is split three ways. Steps 1 and 2. |
| data-2 | CONFIRMED (High) | A reading with no `soundClass` is 'Other' in the chart (`CategoryChart.tsx:79`) but 'Unknown' in the table, popup and both exports; 2,683 of 3,374 production docs (79.5%) are in that state, so the 'Other' bar holds 3,074 readings (91% of all data, 87% of the bar unclassified). Absent confidence renders as `0%`, `0.0%`, `0.00` and `0`. Step 3. |
| bug-3 | UNVERIFIED (Medium, confidence high); re-read in the working tree | Week buckets use `${getFullYear()}-W${weekNum}` with an unpadded ISO week number, sorted with `localeCompare` (W10 before W2), and the label drops the year (`NoiseTrendChart.tsx:72-74`, `:95`, `:107-113`, `:123`). Step 4. |
| arch-3 | PARTIAL (Low) | This cluster delivers the band half of the finding: one `src/lib/noiseBands.ts` (thresholds, Low/Moderate/High labels, colours), and it deletes the dead `SOUND_CATEGORIES` / `DB_THRESHOLDS` / `getNoiseLevel` in `themeConstants.ts` (stale 14-category map, 'Quiet' band label). Coordinates and timestamps were done by 04.2. Rewiring the remaining band copies is owned by 07.1, 09.4, 09.5 and 10.4 (see Out of scope). Step 1. |

Full finding text and verifier evidence: grep the IDs in `audit/00_MASTER_AUDIT_REPORT.md`, `audit/01_BUGS_AND_CORRECTNESS.md`, `audit/03_CROSS_REPO_CONTRACT_AUDIT.md` and `audit/06_ARCHITECTURE_AND_CODE_QUALITY.md`.

---

## Pre-reading

Open these files before touching anything:

1. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md` §2.11 (categories and bands), §3.4 decision D2, §4.3 (stored-reading shape), §4.7 (export and table composites), §4.11 (shared constants).
2. `audit/playbook/04_readings_storage_contract.md` Steps 2 and 3, to see what 04 leaves in the files below.
3. `src/components/analytics/CategoryChart.tsx` — whole file (230 lines).
4. `src/components/analytics/NoiseTrendChart.tsx` — whole file (265 lines).
5. `src/components/analytics/DataTable.tsx` — lines 1-135 and 240-290.
6. `src/components/map/NoiseMarkers.tsx` — lines 1-10, 160-172 and 300-360.
7. `src/utils/exportHelpers.ts` — whole file (207 lines).
8. `src/types/NoiseReading.ts` and `src/utils/themeConstants.ts` — whole files.
9. App contract: `noise_pollution_mapper/lib/services/yamnet_class_mapping.dart` (lines 30-58 names, 641-683 types, 1148-1237 icons and colours), `lib/screens/report_noise_screen.dart` (lines 37-55, the manual picker), `lib/screens/analytics_screen.dart` (lines 228-240, which skips unclassified docs). Read only; the app is not edited.

---

## Steps

### Step 1 — data-3, arch-3: shared taxonomy and noise-band modules

**Goal:** One module owns the category taxonomy (18 app categories plus `Uncertain`, each with a colour, an icon and a Pollution/Ambient type; `Speech-Pollution` and `Speech-Ambient` as aliases of `Speech`; `Unclassified`; the confidence helpers) and one module owns the dB bands (50/70 thresholds, Low/Moderate/High labels and colours). The dead, stale maps in `themeConstants.ts` are deleted. Nothing reads the new modules yet, so the UI is byte-for-byte unchanged by this step.

**Files:**
- `src/lib/categories.ts` (new)
- `src/lib/noiseBands.ts` (new)
- `src/lib/__tests__/categories.test.ts` (new; covers both modules)
- `src/utils/themeConstants.ts` (modified: deletions only)

**Exact changes**

1a. New file `src/lib/categories.ts` — full contents:

```ts
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
```

Placement note: the file imports nothing, so it is safe to import from tests and from any component. The helpers take structural types (`Pick<Classified, …>`), so `NoiseReading` satisfies them before and after Step 3 removes `soundCategory`. The app colours and icons are copied from `yamnet_class_mapping.dart` (`getCategoryColor`, `getCategoryIcon`). `Quiet` is teal `#00897B` with 🔇 and is distinct from `Other`. The order of `CATEGORY_LIST` is by type (the app's constant order is not meaningful).

1b. New file `src/lib/noiseBands.ts` — full contents:

```ts
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
```

Placement note: the colours equal the existing `FLUTTER_THEME_COLORS` noise colours and the three local copies (`NoiseMarkers.tsx`, `DataTable.tsx`), so adopting the module later changes no pixel. Cluster 10 step 4 changes colours here and nowhere else (master §4.11).

1c. `src/utils/themeConstants.ts`: delete the dead `SOUND_CATEGORIES`, `DB_THRESHOLDS` and `getNoiseLevel`. Nothing imports them: the only importers of this file take `FLUTTER_THEME_COLORS` (`Layout.tsx:14`, `ThemeContext.tsx:2`, `LoginPage.tsx:17`).

BEFORE (`src/utils/themeConstants.ts`, lines 37-179, verbatim):
```ts
  highNoise: '#F44336', // Red: > 70 dB
};

// Sound Categories (14 Categories - Session 29)
export const SOUND_CATEGORIES = {
  // Pollution Categories
  Traffic: {
    name: 'Traffic',
    icon: 'car',
    color: '#FF5252',
    type: 'Pollution',
    badge: 'Red',
  },
  'Tuk-tuk': {
    name: 'Tuk-tuk',
    icon: 'motorcycle',
    color: '#FF7043',
    type: 'Pollution',
    badge: 'Orange',
  },
  Construction: {
    name: 'Construction',
    icon: 'hammer',
    color: '#FFA726',
    type: 'Pollution',
    badge: 'Orange',
  },
  Sirens: {
    name: 'Sirens',
    icon: 'bell-ring',
    color: '#EF5350',
    type: 'Pollution',
    badge: 'Red',
  },
  Machinery: {
    name: 'Machinery',
    icon: 'cog',
    color: '#FF6E40',
    type: 'Pollution',
    badge: 'Orange',
  },
  Alarm: {
    name: 'Alarm',
    icon: 'alarm',
    color: '#F44336',
    type: 'Pollution',
    badge: 'Red',
  },
  Transport: {
    name: 'Transport',
    icon: 'train',
    color: '#E53935',
    type: 'Pollution',
    badge: 'Red',
  },

  // Ambient Categories
  Music: {
    name: 'Music',
    icon: 'music',
    color: '#42A5F5',
    type: 'Ambient',
    badge: 'Blue',
  },
  Nature: {
    name: 'Nature',
    icon: 'tree',
    color: '#66BB6A',
    type: 'Ambient',
    badge: 'Green',
  },
  Animals: {
    name: 'Animals',
    icon: 'paw',
    color: '#8BC34A',
    type: 'Ambient',
    badge: 'Lime',
  },
  Domestic: {
    name: 'Domestic',
    icon: 'home',
    color: '#9CCC65',
    type: 'Ambient',
    badge: 'Lime',
  },
  'Body Sounds': {
    name: 'Body Sounds',
    icon: 'lungs',
    color: '#7CB342',
    type: 'Ambient',
    badge: 'Lime',
  },

  // Both/Other
  Speech: {
    name: 'Speech',
    icon: 'message-circle',
    color: '#AB47BC',
    type: 'Both',
    badge: 'Purple',
  },
  Other: {
    name: 'Other',
    icon: 'help-circle',
    color: '#9E9E9E',
    type: 'Unclassified',
    badge: 'Gray',
  },
};

// dB Thresholds (ALIGNED WITH FLUTTER APP)
export const DB_THRESHOLDS = {
  low: 50, // < 50 dB = Quiet
  moderate: 70, // 50-70 dB = Moderate
  // > 70 dB = Loud
};

// Get noise level label and color based on dB
export function getNoiseLevel(decibels: number): {
  level: 'low' | 'moderate' | 'high';
  label: string;
  color: string;
} {
  if (decibels < DB_THRESHOLDS.low) {
    return {
      level: 'low',
      label: 'Quiet',
      color: FLUTTER_THEME_COLORS.lowNoise,
    };
  }
  if (decibels <= DB_THRESHOLDS.moderate) {
    return {
      level: 'moderate',
      label: 'Moderate',
      color: FLUTTER_THEME_COLORS.moderateNoise,
    };
  }
  return {
    level: 'high',
    label: 'Loud',
    color: FLUTTER_THEME_COLORS.highNoise,
  };
}
```

AFTER:
```ts
  highNoise: '#F44336', // Red: > 70 dB
};
```

Placement note: the AFTER is the last two lines of the file; the file ends with a newline. Everything above `highNoise` (including the rest of `FLUTTER_THEME_COLORS`) stays byte-identical.

1d. New file `src/lib/__tests__/categories.test.ts` — full contents:

```ts
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
```

Placement note: the test hard-codes the app's 18 category names. That list is the contract with `yamnet_class_mapping.dart`; CI cannot see the sibling repo, so a rename in the app must be mirrored here by hand. The test imports only the two pure modules and `vitest`.

**Edge cases to preserve**
- `FLUTTER_THEME_COLORS` is not touched; three files import it. Its `lowNoise`/`moderateNoise`/`highNoise` keys become unreferenced duplicates of the band colours. They stay so the object keeps its shape. Do not point new code at them: bands come from `noiseBands.ts`.
- `categories.ts` uses a `Map`, not an object literal, so a `soundClass` such as `constructor` or `__proto__` (writable by any registrant) resolves to 'Other' and never to an `Object.prototype` member. The test covers it.
- A blank, whitespace-only, missing or non-string `soundClass` is 'Unclassified'. An unknown non-empty string (legacy values such as `Sirens`) is 'Other', so the chart never invents a bar for it.
- `categoryLabel()` keeps the stored text (`Speech-Pollution` stays visible in the table and exports); only `categoryOf()` folds aliases. The stored `soundType` is not rewritten.
- `0` is a real confidence. Only `undefined`, `null`, non-numbers and non-finite numbers are absent.
- No band is labelled 'Quiet'. 'Quiet' exists only as a category name.
- Do not re-export anything from `themeConstants.ts`, and do not add a colour map to any component.

**Acceptance criteria**
- `src/lib/categories.ts`, `src/lib/noiseBands.ts` and `src/lib/__tests__/categories.test.ts` exist with the contents above; `themeConstants.ts` ends after `FLUTTER_THEME_COLORS`.
- `npx vitest run src/lib/__tests__/categories.test.ts` reports 42 passing tests, 0 failing.
- `grep -rnE "SOUND_CATEGORIES|DB_THRESHOLDS|getNoiseLevel" src` prints only the `getNoiseLevelColor`/`getNoiseLevelLabel` locals in `DataTable.tsx` and the local `getNoiseLevel` in `exportHelpers.ts` (both are rewired by later clusters).
- `grep -rn "label: 'Quiet'" src` prints nothing.
- The running app looks and behaves exactly as before (no consumer changed).

**Verify**
```
npx tsc -b
npx eslint src/lib/categories.ts src/lib/noiseBands.ts src/lib/__tests__/categories.test.ts src/utils/themeConstants.ts
npx vitest run src/lib/__tests__/categories.test.ts
grep -rn "label: 'Quiet'" src
```
Manual: `git status --short` lists exactly the three new files and `themeConstants.ts`. Stage by explicit path, never `git add -A`.

**Commit title:** `feat(taxonomy): shared category and noise-band module mirroring the app's 18 categories (data-3)`

---

### Step 2 — data-3: CategoryChart on the shared taxonomy

**Goal:** `CategoryChart` takes every colour and icon from `src/lib/categories.ts` and groups by `categoryOf()`. `Quiet` gets its own teal bar and 🔇 instead of Other's grey ❓; `Speech-Pollution` and `Speech-Ambient` fold into the `Speech` bar; the phantom `Sirens`/`Machinery`/`Animals` keys and the stale "17 sound categories" comment are gone. A reading with no `soundClass` is grouped as 'Unclassified' (its own neutral bar) instead of being merged into the real 'Other'; Step 3 then removes that bar.

**Files:**
- `src/components/analytics/CategoryChart.tsx`

**Exact changes**

2a. Import the taxonomy. Single-line anchor (the line survives cluster 05).

BEFORE (`src/components/analytics/CategoryChart.tsx`, lines 5-5, verbatim):
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

AFTER:
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { categoryInfo, categoryOf } from '@/lib/categories';
```

2b. Delete the local colour and icon maps (`CATEGORY_COLORS`, `CATEGORY_ICONS`) and the "17 sound categories" comment.

BEFORE (`src/components/analytics/CategoryChart.tsx`, lines 14-63, verbatim):
```tsx
// 17 sound categories with colors (matching Flutter app's yamnet_class_mapping.dart)
const CATEGORY_COLORS: Record<string, string> = {
  // Pollution Categories (9)
  'Traffic': '#FF5252',
  'Tuk-tuk': '#FF7043',
  'Construction': '#FFA726',
  'Industrial': '#FF6E40',
  'Sirens': '#EF5350',
  'Machinery': '#FF6E40',
  'Alarm': '#F44336',
  'Transport': '#E53935',
  'Sports': '#FF4081',
  // Ambient Categories (7)
  'Music': '#42A5F5',
  'Nature': '#66BB6A',
  'Animals': '#8BC34A',
  'Domestic': '#9CCC65',
  'Body Sounds': '#7CB342',
  'Weather': '#4FC3F7',
  'Office': '#BA68C8',
  // Both/Other (1)
  'Speech': '#AB47BC',
  'Religious': '#7E57C2',
  'Market': '#FF7043',
  'Other': '#9E9E9E',
};

// Category icons (matching Flutter app)
const CATEGORY_ICONS: Record<string, string> = {
  'Traffic': '🚗',
  'Tuk-tuk': '🛺',
  'Construction': '🏗️',
  'Industrial': '🏭',
  'Sirens': '🚨',
  'Machinery': '⚙️',
  'Alarm': '🔔',
  'Transport': '🚂',
  'Sports': '⚽',
  'Music': '🎵',
  'Nature': '🌿',
  'Animals': '🐾',
  'Domestic': '🏠',
  'Body Sounds': '👤',
  'Weather': '🌦️',
  'Office': '💼',
  'Speech': '💬',
  'Religious': '🔔',
  'Market': '🏪',
  'Other': '❓',
};
```

AFTER:
```tsx
// Bar colours and icons come from the shared taxonomy (src/lib/categories.ts).
```

2c. Group by the canonical category (replaces the `as any` cast and the `soundClass || soundCategory || 'Other'` precedence).

BEFORE (`src/components/analytics/CategoryChart.tsx`, lines 75-79, verbatim):
```tsx
    readings.forEach((reading) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const read = reading as any;
      // Flutter app uses 'soundClass', web app might use 'soundCategory' - check both
      const category = read.soundClass || read.soundCategory || 'Other';
```

AFTER:
```tsx
    readings.forEach((reading) => {
      // Canonical category: 'Speech-Pollution' / 'Speech-Ambient' (manual reports)
      // fold into 'Speech'; a reading with no soundClass is 'Unclassified' and is
      // never merged into the real 'Other' (data-3).
      const category = categoryOf(reading);
```

2d. Bar colour from the taxonomy.

BEFORE (`src/components/analytics/CategoryChart.tsx`, lines 93-93, verbatim):
```tsx
        color: CATEGORY_COLORS[category] || '#9E9E9E',
```

AFTER:
```tsx
        color: categoryInfo(category).color,
```

2e. Y-axis tick icon.

BEFORE (`src/components/analytics/CategoryChart.tsx`, lines 155-158, verbatim):
```tsx
              tickFormatter={(category) => {
                const icon = CATEGORY_ICONS[category] || '❓';
                return `${icon} ${category}`;
              }}
```

AFTER:
```tsx
              tickFormatter={(category) => {
                const icon = categoryInfo(category).icon;
                return `${icon} ${category}`;
              }}
```

2f. Tooltip label icon.

BEFORE (`src/components/analytics/CategoryChart.tsx`, lines 181-184, verbatim):
```tsx
              labelFormatter={(label) => {
                const icon = CATEGORY_ICONS[label as string] || '❓';
                return `${icon} ${label}`;
              }}
```

AFTER:
```tsx
              labelFormatter={(label) => {
                const icon = categoryInfo(label as string).icon;
                return `${icon} ${label}`;
              }}
```

Placement note: 2c-2f edit disjoint regions of the component body; none touches `const { readings } = useSyncedReadings();` (cluster 05 may have changed that line) or the early-return empty state (Step 3 edits that). The `CategoryData` interface (`:7-12`) is unchanged.

**Edge cases to preserve**
- Sort order stays "average dB, descending"; the bar value is still `avgDb`; the legend still shows the count per bar.
- Between this commit and Step 3 the chart shows an 'Unclassified' bar (grey `#BDBDBD`, ❔) holding the 2,683 production readings that used to inflate 'Other'. That is intentional and honest; Step 3 removes the bar and adds the caption. Do not squash the two steps.
- `categoryInfo()` never returns `undefined`, so there are no `|| '#9E9E9E'` or `|| '❓'` fallbacks left to maintain.
- `reading.decibelLevel || 0` stays as is (a missing dB is bug-10, out of scope).
- Tick and tooltip labels use the canonical name, so a folded manual report reads 'Speech' everywhere in the chart.

**Acceptance criteria**
- `grep -rnE "CATEGORY_COLORS|CATEGORY_ICONS" src` prints nothing.
- `grep -n "soundCategory\|as any" src/components/analytics/CategoryChart.tsx` prints nothing.
- On production data the chart has no `Speech-Pollution` bar: its reading is counted in `Speech` (121 + 1 = 122). It shows an 'Unclassified' bar with count 2,683, and the 'Other' legend count is 391, not 3,074.
- `npx vitest run src/lib/__tests__/categories.test.ts` still passes (the `Quiet` colour/icon and fold behaviour the chart relies on are asserted there).

**Verify**
```
npx tsc -b
npx eslint src/components/analytics/CategoryChart.tsx
npx vitest run src/lib/__tests__/categories.test.ts
```
Manual: open `/analytics`. Confirm the bars: Speech has one bar, 'Unclassified' is a separate neutral bar, and no bar is labelled Sirens, Machinery or Animals. Do NOT run `npm run build` in this step.

**Commit title:** `fix(analytics): CategoryChart uses the shared taxonomy, adds Quiet and folds manual Speech reports (data-3)`

---

### Step 3 — data-2: one 'Unclassified' label and '—' for absent confidence

**Goal:** Per decision D2 (default): `CategoryChart` excludes readings with no `soundClass` from the bars (matching the app's `analytics_screen.dart:232-234`) and shows the caption "N of M readings are unclassified and not shown". `DataTable`, the map popup and both exports say 'Unclassified' through `categoryLabel()`. Absent confidence shows '—' in the table and the popup, an empty cell in the CSV, and `null` in the JSON. The never-written `soundCategory` field is deleted from `NoiseReading` together with every `soundCategory ||` precedence expression.

**Files:**
- `src/components/analytics/CategoryChart.tsx`
- `src/components/analytics/DataTable.tsx`
- `src/components/map/NoiseMarkers.tsx`
- `src/utils/exportHelpers.ts`
- `src/types/NoiseReading.ts`

**Exact changes**

3a. `src/components/analytics/CategoryChart.tsx`: import `UNCLASSIFIED`. This anchors on Step 2's AFTER text.

BEFORE (`src/components/analytics/CategoryChart.tsx`, as left by Step 2, verbatim):
```tsx
import { categoryInfo, categoryOf } from '@/lib/categories';
```

AFTER:
```tsx
import { categoryInfo, categoryOf, UNCLASSIFIED } from '@/lib/categories';
```

3b. `src/components/analytics/CategoryChart.tsx`: leave unclassified readings out of the bars. This anchors on Step 2's AFTER text (2c). The second line is unchanged working-tree text.

BEFORE (`src/components/analytics/CategoryChart.tsx`, as left by Step 2, verbatim):
```tsx
      const category = categoryOf(reading);
      if (!groups.has(category)) {
```

AFTER:
```tsx
      const category = categoryOf(reading);
      // D2: readings with no soundClass are not charted (the app's own analytics
      // skips them too, analytics_screen.dart:232-234). The caption below counts them.
      if (category === UNCLASSIFIED) return;
      if (!groups.has(category)) {
```

3c. `src/components/analytics/CategoryChart.tsx`: count the unclassified readings and build the caption.

This anchors on cluster 05 Step 4's AFTER text (05.4k/05.4l added the `loading` early return), not on HEAD. The new `useMemo` MUST go above `if (loading)`: a hook placed after an early return breaks the rules of hooks. (Corrected 2026-10-16 by a mechanical dry run of the playbook; the original block anchored on HEAD lines 97-100 and would not have matched after 05.4.)

BEFORE (`src/components/analytics/CategoryChart.tsx`, as left by cluster 05 Step 4, verbatim):
```tsx
    return result;
  }, [readings]);

  if (loading) {
```

AFTER:
```tsx
    return result;
  }, [readings]);

  // Readings the app left unclassified are not charted (D2). The caption says
  // how many were left out; at audit time that was 2,683 of 3,374 in production.
  const unclassifiedCount = useMemo(
    () => readings.filter((reading) => categoryOf(reading) === UNCLASSIFIED).length,
    [readings]
  );
  const unclassifiedCaption =
    unclassifiedCount > 0
      ? `${unclassifiedCount.toLocaleString('en-US')} of ${readings.length.toLocaleString('en-US')} readings are unclassified and not shown`
      : null;

  if (loading) {
```

3d. `src/components/analytics/CategoryChart.tsx`: the empty state. When every reading is unclassified, "No readings have been uploaded" would be wrong, so say what is going on and show the caption. This is a MERGE with cluster 05 Step 4's error/empty copy: keep 05's error branch first and untouched. (Corrected 2026-10-16 by the playbook dry run; the original block anchored on HEAD lines 111-113, which 05.4 replaced.)

BEFORE (`src/components/analytics/CategoryChart.tsx`, as left by cluster 05 Step 4, verbatim):
```tsx
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              {error
                ? 'Categories appear once the readings have been downloaded.'
                : 'No readings have been uploaded from the mobile app yet.'}
            </p>
```

AFTER:
```tsx
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              {error
                ? 'Categories appear once the readings have been downloaded.'
                : unclassifiedCount > 0
                  ? 'None of the readings has a sound category yet.'
                  : 'No readings have been uploaded from the mobile app yet.'}
            </p>
            {!error && unclassifiedCaption && (
              <p className={cn("text-xs mt-2", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                {unclassifiedCaption}
              </p>
            )}
```

3e. `src/components/analytics/CategoryChart.tsx`: the caption under the legend.

BEFORE (`src/components/analytics/CategoryChart.tsx`, lines 222-230, verbatim):
```tsx
            <span className={cn("text-xs shrink-0", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              ({data.count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

AFTER:
```tsx
            <span className={cn("text-xs shrink-0", isDarkMode ? "text-gray-500" : "text-gray-500")}>
              ({data.count})
            </span>
          </div>
        ))}
      </div>

      {unclassifiedCaption && (
        <p className={cn("mt-3 text-xs", isDarkMode ? "text-gray-400" : "text-gray-600")}>
          {unclassifiedCaption}
        </p>
      )}
    </div>
  );
}
```

3f. `src/types/NoiseReading.ts`: delete `soundCategory`. This anchors on cluster 04 Step 3 (3a)'s AFTER text, which rewrote the whole file. It does NOT match at HEAD `353bbdd`; if it does not match, 04.3 has not been applied: STOP.

BEFORE (`src/types/NoiseReading.ts`, as left by cluster 04 Step 3, verbatim):
```ts
  soundCategory?: string;      // never written by any app version; kept ONLY until 06.3 removes it
  soundClass?: string;         // raw app value; absent = unclassified
```

AFTER:
```ts
  soundClass?: string;         // raw app value; absent = unclassified
```

Placement note: `confidence?: number` is already optional after 04.3, so no change is needed there. Deleting the field is safe only because 3g-3r below (and Step 2 for the chart) remove every reader. At HEAD the readers are exactly `CategoryChart.tsx:79`, `DataTable.tsx:104-105` and `:251`, `NoiseMarkers.tsx:166` and `:304`, and `exportHelpers.ts:74` and `:121`.

3g. `src/components/analytics/DataTable.tsx`: import the helpers. Single-line anchor (04.2n adds a sibling import line after it, which does not matter).

BEFORE (`src/components/analytics/DataTable.tsx`, lines 14-14, verbatim):
```tsx
import { cn } from '@/lib/utils';
```

AFTER:
```tsx
import { cn } from '@/lib/utils';
import { categoryLabel, confidenceLabel, confidenceOf } from '@/lib/categories';
```

3h. `src/components/analytics/DataTable.tsx`: sort the Category column by the displayed label.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 103-106, verbatim):
```tsx
        case 'soundCategory':
          aVal = a.soundCategory || a.soundClass || '';
          bVal = b.soundCategory || b.soundClass || '';
          break;
```

AFTER:
```tsx
        case 'soundCategory':
          aVal = categoryLabel(a);
          bVal = categoryLabel(b);
          break;
```

3i. `src/components/analytics/DataTable.tsx`: sort absent confidence below every real value.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 111-114, verbatim):
```tsx
        case 'confidence':
          aVal = a.confidence || 0;
          bVal = b.confidence || 0;
          break;
```

AFTER:
```tsx
        case 'confidence':
          // An absent confidence sorts below every real value (last when descending).
          aVal = confidenceOf(a) ?? -1;
          bVal = confidenceOf(b) ?? -1;
          break;
```

3j. `src/components/analytics/DataTable.tsx`: the Category cell.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 251-251, verbatim):
```tsx
                    {reading.soundCategory || reading.soundClass || 'Unknown'}
```

AFTER:
```tsx
                    {categoryLabel(reading)}
```

3k. `src/components/analytics/DataTable.tsx`: the Confidence cell. An absent confidence shows '—' with no bar.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 267-280, verbatim):
```tsx
                  <TableCell className={cn(isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(reading.confidence || 0) * 100}%`,
                            backgroundColor: reading.confidence > 0.7 ? '#4CAF50' : reading.confidence > 0.4 ? '#FF9800' : '#F44336'
                          }}
                        />
                      </div>
                      <span>{((reading.confidence || 0) * 100).toFixed(0)}%</span>
                    </div>
                  </TableCell>
```

AFTER:
```tsx
                  <TableCell className={cn(isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
                    {confidenceOf(reading) === null ? (
                      <span>{confidenceLabel(reading)}</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(confidenceOf(reading) ?? 0) * 100}%`,
                              backgroundColor: (confidenceOf(reading) ?? 0) > 0.7 ? '#4CAF50' : (confidenceOf(reading) ?? 0) > 0.4 ? '#FF9800' : '#F44336'
                            }}
                          />
                        </div>
                        <span>{confidenceLabel(reading)}</span>
                      </div>
                    )}
                  </TableCell>
```

Placement note: the `SortField` value `'soundCategory'` (type at `:22`, `handleSort('soundCategory')` and `SortIcon field="soundCategory"` at `:193-195`) is a sort-key identifier, not the deleted `NoiseReading` property. Leave it; cluster 10.2 touches those header lines. Every DataTable edit in this step is on a different region from 04.2 (`toDate`, timestamp cell) and from 07.2 (the 'User Email' column).

3l. `src/components/map/NoiseMarkers.tsx`: import the helpers. Single-line anchor (it survives 04.2g, which appends an import after it).

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 5-5, verbatim):
```tsx
import type { NoiseReading } from '@/types/NoiseReading';
```

AFTER:
```tsx
import type { NoiseReading } from '@/types/NoiseReading';
import { categoryLabel, categoryOf, confidenceLabel } from '@/lib/categories';
```

3m. `src/components/map/NoiseMarkers.tsx`: the category filter compares canonical categories, so a manual 'Speech-Pollution' report matches a 'Speech' filter. (The `categories` filter is not set by any caller today; 09.1 moves the whole filter to `MapPage`.)

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 163-166, verbatim):
```tsx
    // Apply category filter (check both soundCategory and soundClass)
    if (filters?.categories && filters.categories.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const category = (reading as any).soundCategory || (reading as any).soundClass;
```

AFTER:
```tsx
    // Apply category filter (canonical category: manual 'Speech-*' reports match 'Speech')
    if (filters?.categories && filters.categories.length > 0) {
      const category = categoryOf(reading);
```

3n. `src/components/map/NoiseMarkers.tsx`: the popup category.

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 302-304, verbatim):
```tsx
        // Get category (check both soundCategory and soundClass)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const category = (reading as any).soundCategory || (reading as any).soundClass || 'Unknown';
```

AFTER:
```tsx
        // Category text: the stored soundClass, or 'Unclassified' when absent
        const category = categoryLabel(reading);
```

3o. `src/components/map/NoiseMarkers.tsx`: the popup confidence.

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 356-356, verbatim):
```tsx
                      {((reading.confidence || 0) * 100).toFixed(1)}%
```

AFTER:
```tsx
                      {confidenceLabel(reading, 1)}
```

3p. `src/utils/exportHelpers.ts`: import the helpers. Single-line anchor (04.2c appends an import after it).

BEFORE (`src/utils/exportHelpers.ts`, lines 3-3, verbatim):
```ts
import { format } from 'date-fns';
```

AFTER:
```ts
import { format } from 'date-fns';
import { categoryLabel, confidenceOf, confidencePercent } from '@/lib/categories';
```

3q. `src/utils/exportHelpers.ts`: CSV category and confidence. An absent confidence is an empty cell.

BEFORE (`src/utils/exportHelpers.ts`, lines 74-76, verbatim):
```ts
      `"${reading.soundCategory || reading.soundClass || 'Unknown'}"`,
      `"${reading.soundType || 'Unknown'}"`,
      ((reading.confidence || 0) * 100).toFixed(2),
```

AFTER:
```ts
      `"${categoryLabel(reading)}"`,
      `"${reading.soundType || 'Unknown'}"`,
      confidencePercent(reading)?.toFixed(2) ?? '',
```

3r. `src/utils/exportHelpers.ts`: JSON category and confidence. An absent confidence is `null`. The JSON key stays `soundCategory` so files exported before and after this change keep one shape; cluster 07.1 rewrites this builder.

BEFORE (`src/utils/exportHelpers.ts`, lines 121-123, verbatim):
```ts
        soundCategory: reading.soundCategory || reading.soundClass || 'Unknown',
        soundType: reading.soundType || 'Unknown',
        confidence: reading.confidence || 0
```

AFTER:
```ts
        soundCategory: categoryLabel(reading),
        soundType: reading.soundType || 'Unknown',
        confidence: confidenceOf(reading)
```

Placement note: 3q and 3r are expression-level only. Cluster 07.1 rewrites the CSV row builder afterwards (master §4.7), and the final CSV `Category` column is the raw `soundClass` or 'Unclassified', which is exactly `categoryLabel()`. Do not touch the surrounding quoting here; `csvCell()` in 07.1 owns it.

**Edge cases to preserve**
- Unclassified is decided by `categoryOf()` / `categoryLabel()` only. There is no second definition of "no soundClass" anywhere.
- Confidence `0` is real: it shows `0%` with an empty bar, never '—'.
- The popup 'Type' row is still hidden when `soundType` is missing. The table 'Type' cell still shows 'Unknown' for it; `soundType` is outside this cluster.
- CSV: absent confidence is an empty cell (not `0.00`). JSON: absent confidence is `null` (not `0`). Present values keep their formats (`toFixed(2)` percent in CSV, the 0-1 fraction in JSON).
- The chart caption counts every unclassified reading in `readings`, not only the visible ones, and uses `toLocaleString('en-US')` so 2683 reads "2,683".
- Manual reports (`soundClass` 'Speech-Pollution', confidence 1.0) are shown as written in the table, popup and exports; only the chart folds them. A "Manual" badge instead of 100% is a separate UX item (out of scope).
- Do not delete the `'soundCategory'` sort key or the JSON output key named `soundCategory` (see 3k and 3r).

**Acceptance criteria**
- `grep -rnE "\.soundCategory|soundCategory\?" src` prints nothing.
- `grep -rn "'Unknown'" src/components/analytics/DataTable.tsx src/components/map/NoiseMarkers.tsx src/utils/exportHelpers.ts` shows no category or confidence expression (only the `soundType`, location and user fallbacks remain).
- On production data, `/analytics` shows the caption "2,683 of 3,374 readings are unclassified and not shown", the 'Other' bar legend reads (391), and no 'Unclassified' bar exists.
- DataTable: rows with no `soundClass` read 'Unclassified' in Category and '—' (no bar) in Confidence. Sorting Confidence descending puts '—' rows last. Sorting Category works with no console error.
- A map popup for such a reading shows `Category: Unclassified` and `Confidence: —`.
- CSV: for such a reading the Category cell is `"Unclassified"` and the Confidence cell is empty, so the row contains `"Unknown",,` between the Type and the last column (an absent `soundType` is still `"Unknown"`). JSON: `"soundCategory": "Unclassified"` and `"confidence": null`.
- With a hand-edited reading whose `soundClass` is 'Speech-Pollution': the chart counts it under Speech, while the table and CSV still print `Speech-Pollution`.

**Verify**
```
npx tsc -b
npx eslint src/components/analytics/CategoryChart.tsx src/components/analytics/DataTable.tsx src/components/map/NoiseMarkers.tsx src/utils/exportHelpers.ts src/types/NoiseReading.ts
npx vitest run src/lib/__tests__/categories.test.ts
grep -rnE "\.soundCategory|soundCategory\?" src
```
Manual: the acceptance checks above, on `/analytics` and `/map`, and one CSV and one JSON export opened in an editor. Do NOT run `npm run build` in this step.

**Commit title:** `fix(analytics): one 'Unclassified' label for missing soundClass and '—' for absent confidence (data-2)`

---

### Step 4 — bug-3: ISO week buckets

**Goal:** The trend chart's Week view buckets by ISO week-year with a zero-padded week (`2026-W02`), sorts buckets by their numeric start time, and labels a week with its year ("Week 2, 2026"). The bucket logic moves out of the component into a pure, tested module. Hour, day and month buckets keep their keys and labels.

**Files:**
- `src/lib/trendBuckets.ts` (new)
- `src/lib/__tests__/trendBuckets.test.ts` (new)
- `src/components/analytics/NoiseTrendChart.tsx`

**Exact changes**

4a. New file `src/lib/trendBuckets.ts` — full contents:

```ts
import {
  format,
  getISOWeek,
  getISOWeekYear,
  startOfDay,
  startOfHour,
  startOfISOWeek,
  startOfMonth,
} from 'date-fns';

export type TimeGranularity = 'hour' | 'day' | 'week' | 'month';

export interface TrendBucket {
  /** Stable group key, also the chart's category value. */
  key: string;
  /** Epoch ms of the start of the bucket. Sort by this, never by the key text. */
  start: number;
}

/**
 * Which trend bucket a date belongs to, in the browser's local time.
 *
 * Weeks are ISO weeks. The key pairs the ISO week-year (not the calendar year)
 * with a zero-padded week number, so 2025-12-29 is '2026-W01' and
 * 2027-01-01 is '2026-W53'.
 */
export function bucketOf(date: Date, granularity: TimeGranularity): TrendBucket {
  switch (granularity) {
    case 'hour':
      return { key: format(date, 'yyyy-MM-dd HH:00'), start: startOfHour(date).getTime() };
    case 'week': {
      const week = String(getISOWeek(date)).padStart(2, '0');
      return { key: `${getISOWeekYear(date)}-W${week}`, start: startOfISOWeek(date).getTime() };
    }
    case 'month':
      return { key: format(date, 'yyyy-MM'), start: startOfMonth(date).getTime() };
    case 'day':
    default:
      return { key: format(date, 'yyyy-MM-dd'), start: startOfDay(date).getTime() };
  }
}

/** '2026-W02' -> 'Week 2, 2026'. A key that is not a week key is returned unchanged. */
export function weekLabel(key: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) return key;
  return `Week ${Number(match[2])}, ${match[1]}`;
}
```

Placement note: the module imports only `date-fns`. `bucketOf()` returns the key (also the chart's category value) and the numeric `start`; sorting uses `start`, so it stays correct even where the key text would not sort. The hour, day and month keys are the same strings the component produced before.

4b. New file `src/lib/__tests__/trendBuckets.test.ts` — full contents:

```ts
import { describe, expect, it } from 'vitest';
import { bucketOf, weekLabel } from '@/lib/trendBuckets';

// Local-time dates (month is 1-based here). Noon keeps every case away from
// midnight and DST edges, whatever time zone the test runs in.
const at = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour);

describe('bucketOf week', () => {
  it('zero-pads the week number', () => {
    expect(bucketOf(at(2026, 1, 7), 'week').key).toBe('2026-W02');
    expect(bucketOf(at(2026, 3, 4), 'week').key).toBe('2026-W10');
  });

  it('orders W2 before W10 by bucket start, and the padded keys agree', () => {
    const w2 = bucketOf(at(2026, 1, 7), 'week');
    const w10 = bucketOf(at(2026, 3, 4), 'week');
    expect(w2.start).toBeLessThan(w10.start);
    expect(w2.key < w10.key).toBe(true);
  });

  it('puts 2025-12-29 in ISO week-year 2026, week 01', () => {
    expect(bucketOf(at(2025, 12, 29), 'week').key).toBe('2026-W01');
    expect(bucketOf(at(2025, 12, 31), 'week').key).toBe('2026-W01');
    expect(bucketOf(at(2026, 1, 1), 'week').key).toBe('2026-W01');
  });

  it('puts 2027-01-01 in week 53 of 2026', () => {
    expect(bucketOf(at(2026, 12, 31), 'week').key).toBe('2026-W53');
    expect(bucketOf(at(2027, 1, 1), 'week').key).toBe('2026-W53');
  });

  it('puts 2024-12-30 in week 01 of 2025', () => {
    expect(bucketOf(at(2024, 12, 30), 'week').key).toBe('2025-W01');
  });

  it('keeps Monday to Sunday of one ISO week in one bucket', () => {
    const monday = bucketOf(at(2026, 3, 2, 0), 'week');
    const sunday = bucketOf(at(2026, 3, 8, 23), 'week');
    expect(monday.key).toBe('2026-W10');
    expect(sunday.key).toBe('2026-W10');
    expect(sunday.start).toBe(monday.start);
  });

  it('starts the bucket on Monday at local midnight', () => {
    expect(bucketOf(at(2026, 3, 4), 'week').start).toBe(at(2026, 3, 2, 0).getTime());
  });

  it('orders weeks across a year boundary by start', () => {
    const last = bucketOf(at(2025, 12, 24), 'week'); // 2025-W52
    const first = bucketOf(at(2025, 12, 30), 'week'); // 2026-W01
    expect(last.key).toBe('2025-W52');
    expect(first.key).toBe('2026-W01');
    expect(last.start).toBeLessThan(first.start);
  });
});

describe('bucketOf other granularities', () => {
  it('formats hour, day and month keys as before', () => {
    const date = new Date(2026, 2, 5, 14, 37);
    expect(bucketOf(date, 'hour').key).toBe('2026-03-05 14:00');
    expect(bucketOf(date, 'day').key).toBe('2026-03-05');
    expect(bucketOf(date, 'month').key).toBe('2026-03');
  });

  it('starts each bucket at the beginning of its period', () => {
    const date = new Date(2026, 2, 5, 14, 37);
    expect(bucketOf(date, 'hour').start).toBe(new Date(2026, 2, 5, 14).getTime());
    expect(bucketOf(date, 'day').start).toBe(new Date(2026, 2, 5).getTime());
    expect(bucketOf(date, 'month').start).toBe(new Date(2026, 2, 1).getTime());
  });
});

describe('weekLabel', () => {
  it('includes the year and drops the padding', () => {
    expect(weekLabel('2026-W02')).toBe('Week 2, 2026');
    expect(weekLabel('2026-W53')).toBe('Week 53, 2026');
  });

  it('returns a key that is not a week key unchanged', () => {
    expect(weekLabel('2026-03-05')).toBe('2026-03-05');
    expect(weekLabel('')).toBe('');
  });
});
```

Placement note: every date is built in local time, which is what `bucketOf()` uses, so the suite passes in any time zone (checked in America/Los_Angeles, Asia/Colombo, Pacific/Auckland and UTC).

4c. `src/components/analytics/NoiseTrendChart.tsx`: import the module. Single-line anchor (04.2r appends an import after it).

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 7-7, verbatim):
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

AFTER:
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { bucketOf, weekLabel, type TimeGranularity } from '@/lib/trendBuckets';
```

4d. `src/components/analytics/NoiseTrendChart.tsx`: remove the local `TimeGranularity` (now imported).

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 9-11, verbatim):
```tsx
type TimeGranularity = 'hour' | 'day' | 'week' | 'month';

interface TrendDataPoint {
```

AFTER:
```tsx
interface TrendDataPoint {
```

4e. `src/components/analytics/NoiseTrendChart.tsx`: keep each bucket's start time with its readings.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 59-59, verbatim):
```tsx
    const groups = new Map<string, number[]>();
```

AFTER:
```tsx
    const groups = new Map<string, { start: number; dbLevels: number[] }>();
```

4f. `src/components/analytics/NoiseTrendChart.tsx`: replace the per-granularity `switch` (and its unpadded `${getFullYear()}-W${weekNum}` week key) with `bucketOf()`. The anchor starts at `let key: string;`, which is the same text before and after 04.2t (04.2t only adds lines above it).

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 63-90, verbatim):
```tsx
      let key: string;

      switch (granularity) {
        case 'hour': {
          key = format(timestamp, 'yyyy-MM-dd HH:00');
          break;
        }
        case 'week': {
          // ISO week number
          const weekNum = getWeekNumber(timestamp);
          key = `${timestamp.getFullYear()}-W${weekNum}`;
          break;
        }
        case 'month': {
          key = format(timestamp, 'yyyy-MM');
          break;
        }
        case 'day':
        default: {
          key = format(timestamp, 'yyyy-MM-dd');
          break;
        }
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(reading.decibelLevel);
```

AFTER:
```tsx
      const { key, start } = bucketOf(timestamp, granularity);

      const group = groups.get(key);
      if (group) {
        group.dbLevels.push(reading.decibelLevel);
      } else {
        groups.set(key, { start, dbLevels: [reading.decibelLevel] });
      }
```

The `});` that closes `readings.forEach` on the next line stays. `timestamp` is the `Date` the line above 4f already computes (`toDate(reading.timestamp)` at HEAD, `getReadingDate(reading)` with its null guard after 04.2t); do not touch that line.

4g. `src/components/analytics/NoiseTrendChart.tsx`: sort by the numeric bucket start, not by the key text.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 95-96, verbatim):
```tsx
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, dbLevels]) => ({
```

AFTER:
```tsx
      .sort(([, a], [, b]) => a.start - b.start)
      .map(([timestamp, { dbLevels }]) => ({
```

4h. `src/components/analytics/NoiseTrendChart.tsx`: delete the local `getWeekNumber` (its ISO week math now lives in `date-fns`).

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 106-115, verbatim):
```tsx
  // Helper function to get week number
  function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  // Format display label based on granularity
```

AFTER:
```tsx
  // Format display label based on granularity
```

4i. `src/components/analytics/NoiseTrendChart.tsx`: the week label includes the year.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 122-124, verbatim):
```tsx
        case 'week': {
          return `Week ${timestamp.split('-W')[1]}`;
        }
```

AFTER:
```tsx
        case 'week': {
          return weekLabel(timestamp);
        }
```

Placement note: the sorted array's `timestamp` field is still the bucket key string, and `XAxis dataKey="timestamp"`, `formatLabel` and the tooltip `labelFormatter` read it unchanged. Edits 4c-4i touch regions that cluster 04.2 (`toDate`, lines 23-63) and 05/10 (hooks call, chart markup) do not.

**Edge cases to preserve**
- ISO week-year, not calendar year: 2025-12-29 to 2026-01-04 is `2026-W01`, and 2027-01-01 is `2026-W53` (2026 has 53 ISO weeks). A week that spans New Year is one bucket, one point.
- Zero-padding makes the keys sort as text, but the order comes from `start` (Monday 00:00 local), so W2 precedes W10 and 2025-W52 precedes 2026-W01.
- Hour, day and month keys and labels are byte-identical to before (`yyyy-MM-dd HH:00`, `yyyy-MM-dd`, `yyyy-MM`); only the week key and label change.
- Buckets are computed in the browser's local time, as before. Fixing the time zone (Asia/Colombo) is bug-12, a follow-up in master §7.
- `Math.max(...dbLevels)` and `Math.min(...dbLevels)` per bucket are unchanged.
- The week tick label is longer ("Week 10, 2026"). The axis keeps `angle={-45}` and `height={60}`; do not change them here (10.3 owns chart accessibility and layout).
- With no readings the chart still shows its "No data available" state; `groupedData` is `[]`.

**Acceptance criteria**
- `npx vitest run src/lib/__tests__/trendBuckets.test.ts` reports 12 passing tests, 0 failing.
- `grep -rnE "getWeekNumber|localeCompare" src/components/analytics/NoiseTrendChart.tsx` prints nothing.
- Week view on production data (readings since Feb 2026): the x-axis reads Week 6, 2026, Week 7, 2026 … Week 9, 2026, Week 10, 2026 … in ascending order; W10 is to the right of W9. The Maximum/Minimum/Average lines no longer zigzag backwards.
- Hour, Day and Month views look exactly as before.

**Verify**
```
npx tsc -b
npx eslint src/lib/trendBuckets.ts src/lib/__tests__/trendBuckets.test.ts src/components/analytics/NoiseTrendChart.tsx
npx vitest run src/lib/__tests__/trendBuckets.test.ts
npm test
npm run build
```
Manual: on `/analytics` click Hour, Day, Week, Month in turn and check the axes. `npm test` runs every suite present at this point (01-06). `npm run build` is the **cluster-end build**: run it exactly once here (about 7.5 minutes on this machine), with nothing else running. It must finish OK. Then run the cluster convention greps from the repo root, each of which must print nothing:
```
grep -rn "label: 'Quiet'" src
grep -rnE "CATEGORY_COLORS|CATEGORY_ICONS|getWeekNumber|SOUND_CATEGORIES|DB_THRESHOLDS" src
grep -rnE "\.soundCategory|soundCategory\?" src
```

**Commit title:** `fix(analytics): bucket trend weeks by ISO week-year with zero-padded sortable keys (bug-3)`

---

## Risks & rollback

- **Revert order.** Later steps anchor on earlier AFTER text (3a-3e on Step 2; every UI step on Step 1's modules). Revert newest first: 4, then 3, 2, 1. Reverting Step 1 alone while 2-3 are applied breaks the build.
- **Chart semantics change (D2).** After Step 3 the category chart no longer includes 79.5% of production readings, by decision D2, and says so in a caption. If the owner overrules D2, keep Step 2's behaviour (an 'Unclassified' bar) and skip 3a-3e; nothing else in the cluster depends on them.
- **Speech totals change.** The one production `Speech-Pollution` reading moves into the `Speech` bar (122). The table, popup and exports still print the stored value.
- **Cluster 05 overlap.** 05.4 edits the chart components (loading and error states) and may change the empty-state markup that 3c and 3d anchor on. If 3d does not match, apply it semantically: the empty state must show 'No classified readings to chart yet' plus the caption when `unclassifiedCount > 0`.
- **Forward compatibility is tested, not observed.** `Quiet` and `Uncertain` do not exist in production yet. Their colours, icons and fold rules are proven by `categories.test.ts`; do not expect to see them in the live chart until the app version that writes them ships.
- **Colour legibility.** `Religious` (`#FFEB3B`) is the app's yellow and is faint on the light card. It matches the app and is deliberately not changed here; non-colour cues and AA fixes belong to cluster 10.
- **Hand-mirrored contract.** `categories.test.ts` hard-codes the app's category names; a rename in the app is not caught by CI. The audit-time script comparison (all 19 names, icons, colours and types equal to the Dart source) was run once when this spec was written.
- **No data migration, no rules or index change.** Rolling back only reverts source files.

## Out of scope

- **Rewiring the remaining band copies** to `noiseBand()`: the `getNoiseLevel` in `exportHelpers.ts` (07.1), the marker colour and icon cache, heatmap stops and legend (09.4, 09.5), and the table badge's `getNoiseLevelColor`/`getNoiseLevelLabel` (10.4). Until they land, the local copies keep the same 50/70 thresholds and colours. The comments "Quiet"/"Loud" in `NoiseMarkers.getMarkerColor` are also left for 09.5.
- **CSV quoting and formula neutralisation** (`csvCell`), the uncalibrated-dB caveat, the 'Contributor' column: cluster 07. The category cell keeps its current quoting until 07.1.
- **`soundType` handling:** the 'Unknown' fallback in the table's Type cell, and the SoundTypeChart (04.3, 10.x).
- **A "Manual" label instead of 100% confidence** for manual reports: UX follow-up.
- **`VITE_HIGH_NOISE_THRESHOLD` and `VITE_MODERATE_NOISE_THRESHOLD`** in `.env.example` (never read): master §7, arch-3 remainder.
- **Time-zone-explicit bucketing (bug-12)** and `StatsCards` missing-dB handling (bug-10): master §7.
- **`FLUTTER_THEME_COLORS.lowNoise`/`moderateNoise`/`highNoise`:** unreferenced duplicates left in place; removing them is a dead-code sweep (master §7).
- **App-side changes:** none. The app is the contract and is not edited.
