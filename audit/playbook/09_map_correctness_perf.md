# Playbook 09 — Map Correctness & Performance

Implementation spec for the defect cluster covering the map's filter pipeline (the heatmap and the marker badge ignore the filters the markers obey), the date-range control (local state that forgets itself, a range end frozen at click time, a start cut off mid-day), the false empty state, the heatmap's intensity maths and missing legend, and two render-cost problems (a new Leaflet icon per marker per render, and one cluster `addLayer` per reading).

**Execute steps in order. Each step is exactly one commit. Gate every step on `npx tsc -b` (0 errors), `npx eslint <the files the step changed>` (0 errors, no new warnings) and `npx vitest run src/lib/__tests__/mapFilters.test.ts` (Steps 1, 2 and 4 change it; later steps must keep it green). Run `npm test` and `npm run build` ONCE, at the end of Step 6 (master playbook §1.3). Never run a build, a type check and a dev server at the same time.**

All BEFORE blocks below were copied verbatim from the working tree on 2026-10-15 (dashboard HEAD `353bbdd`), with three kinds of labelled exception:

- A BEFORE labelled "as left by Step N" is the AFTER text of an earlier step of this cluster. Use it where two steps touch the same region. Each one is derived mechanically from that AFTER text.
- A BEFORE labelled "as left by 05.6e" or "as left by 05.5d" is the AFTER text of that earlier-cluster step. At HEAD the line does not exist yet, because cluster 05 runs first (master §3.1).
- **Whole-file replacements** (Step 1 `NoiseMarkers.tsx`, Step 2 `DateRangeFilter.tsx`, Step 4 `HeatmapLayer.tsx`) quote the HEAD file as BEFORE for reference. `DateRangeFilter.tsx` is touched by no other cluster, so its BEFORE is exact. `NoiseMarkers.tsx` and `HeatmapLayer.tsx` have already been edited by clusters 04, 05 and 06 when this cluster runs. For those two, **replace the whole file with the AFTER text** after confirming the "already contained" checklist in the step. If the current file holds anything the checklist does not list, merge it into the AFTER text instead of dropping it.

Every other BEFORE is a short anchor that also matches after clusters 04–08 edited the same files (their edit regions are disjoint from these anchors). If a BEFORE block does not match, STOP and re-read the file. Match on exact text, never on line numbers (master §1.6).

**Prerequisites.** Clusters 04, 05, 06 and 07 are applied first (master §3.1), and 03.2 has edited `UserFilterToggle.tsx`. This cluster relies on exactly this from them:

- 01.1: vitest runs, and `src/lib/__tests__/` is the test folder.
- 04.2 and 04.3: `src/lib/readings.ts` exports `getCoordinates`, `getReadingDate`, `CoordinateFields` and `DateFields`. A cached `NoiseReading` is flat (`latitude`, `longitude`, finite `decibelLevel`), and its `timestamp` and `createdAt` are epoch ms or null.
- 05.3, 05.5 and 05.6: `useSyncedReadings()` returns `{ readings, loading, error, syncing, refresh, forceFullSync, … }` from the one `ReadingsProvider`. `NoiseMarkers` already reads the provider (no `localDb` or `syncManager`). `DashboardPage` already holds `const { readings, loading: isLoading, … } = useSyncedReadings()`. `MapPage` already holds `const { forceFullSync } = useSyncedReadings();`.
- 06.1: `src/lib/categories.ts` (`categoryOf`, `categoryLabel`, `confidenceLabel`) and `src/lib/noiseBands.ts` (`NOISE_BANDS`, `noiseBand`, `LOW_BAND_BELOW_DB` = 50, `MODERATE_BAND_MAX_DB` = 70).
- 07.3: `DB_CAVEAT` is exported from `src/lib/noiseBands.ts`.

Environment facts (verified from `package.json` and `node_modules` on 2026-10-15):
- `react ^19.2.0` (installed 19.2.4), `react-leaflet ^5.0.0` (5.0.0), `@react-leaflet/core ^3.0.0` (3.0.0), `leaflet ^1.9.4` (1.9.4), `leaflet.markercluster ^1.5.3` (1.5.3), `leaflet.heat ^0.2.0` (0.2.0), `date-fns ^4.1.0` (4.1.0; exports `startOfDay`, `endOfDay`, `subDays`), `typescript ~5.9.3`, `vitest 4.1.11` (added by 01.1), `eslint-plugin-react-hooks ^7.0.1` (7.0.1, flat `recommended`).
- `tsconfig.app.json`: `verbatimModuleSyntax: true` (type-only imports need `import type` or an inline `type` modifier), `erasableSyntaxOnly: true` (no enums), `strict: false` until cluster 12. Write the new code strict-clean anyway.
- eslint-plugin-react-hooks 7 `recommended` includes the compiler rules. This cluster therefore calls no `setState` synchronously inside an effect and reads no clock or random value during render. Date maths lives in `src/lib/mapFilters.ts`, outside any component.
- The ONLY Firestore composite index is `noise_readings (userId ASC, timestamp DESC)`. This cluster issues no Firestore query at all: it filters the provider's in-memory readings. No index, rules or app change is needed.
- `leaflet.heat` (`src/HeatLayer.js` `_redraw`) puts every point into a screen grid cell, SUMS the intensities of a cell, scales each by `1 / 2^(maxZoom - zoom)` (capped at 12 octaves) and clamps the sum at `max`. `leaflet.markercluster` (`dist/leaflet.markercluster-src.js`) reads `chunkedLoading` once per `addLayers` call; its chunk loop is a `setTimeout` chain that cannot be cancelled, and `_addLayer` dereferences `this._map`. Steps 4 and 6 are designed around both facts.
- The master decisions this cluster uses: **D1** (Step 3: who may use the dashboard, hence the `/map` default) and **D5** (Step 6: measure first). Read both answers from the owner before starting. Defaults: D1(A), and D5 measured.

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| bug-2 | UNVERIFIED (Medium, confidence high) | The heatmap is fed the unfiltered cache (`NoiseMarkers.tsx:80-81`, `:97-98` via `onDataChange`), so it ignores 'My Readings Only' and the date range that the markers obey. |
| bug-9 | UNVERIFIED (Medium, confidence high) | The marker badge reports the unfiltered total when filters leave zero markers (`NoiseMarkers.tsx:76-78`, effect keyed on the filtered LENGTH at `:233-237`). |
| bug-6 | UNVERIFIED (Medium, confidence high) | `DateRangeFilter` keeps its selection in local state (`DateRangeFilter.tsx:37`) while the panel unmounts on close, so it reads 'All time' while the map is still filtered. |
| bug-8 | UNVERIFIED (Medium, confidence high), parts 2 and 3 only | The range end is frozen at click time and the start is 'now minus N days' at the current time of day (`DateRangeFilter.tsx:50-58`). Part 1 (timestamp before client-clock `createdAt`) was done in 04.2 and is only kept here. |
| ux-2 | UNVERIFIED (Medium, confidence high) | `/map` opens on 'My Readings Only' (`MapPage.tsx:27`) and, with zero matches, drops a grey pin at the map centre saying 'Be the first to contribute' (`NoiseMarkers.tsx:245-260`), which is false for thousands of readings. |
| bug-7 | UNVERIFIED (Medium, confidence medium) | Heatmap intensity treats 0 dB as 0.5, normalises 30-100 dB unlike the app's `dB/120`, labels gradient stops with wrong dB bands, stacks repeat readings of one spot into red, and has no legend (`HeatmapLayer.tsx:58-79`). |
| perf-3 | UNVERIFIED (Medium, confidence high) | `NoiseMarkers` allocates a new `Icon` plus a base64 SVG per marker per render (`:11-29`, `:310`), so react-leaflet calls `setIcon` on every marker, and re-renders on every keystroke in the dead search box. |
| perf-4 | UNVERIFIED (Medium, confidence medium) | One React `<Marker>` per reading means one `addLayer` (or one `removeLayer`) per reading whenever markers mount after the cluster group is on the map, so `chunkedLoading` (`MapPage.tsx:169-171`) never applies. Gated by owner decision D5: measure first. |

---

## Pre-reading

Open these before touching anything. The files on disk are the truth: re-read each one fresh, because clusters 04–08 have changed several of them since HEAD.

1. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md`: §2 (conventions 2.9-2.13), §3.4 (D1, D5), §4.3, §4.6 (the `NoiseMarkers` composite, and why 09.6 is a MERGE), §4.8 (the `MapPage` composite) and §4.11 (shared constants).
2. `audit/playbook/04_readings_storage_contract.md`: 2a (the `readings.ts` helpers), 2h-2k (what 04.2 left in `NoiseMarkers`) and 2l-2m (`HeatmapLayer`).
3. `audit/playbook/05_sync_engine_provider.md`: 3d-3f (`NoiseMarkers`), 5a-5d (`DashboardPage`) and 6d-6h (`MapPage`).
4. `audit/playbook/06_taxonomy_analytics.md`: 1a and 1b (`categories.ts`, `noiseBands.ts`) and 3l-3o (`NoiseMarkers`). `audit/playbook/07_export_privacy.md` 3a (`DB_CAVEAT`). `audit/playbook/03_dead_storage_pipeline.md` 2b-2c (`UserFilterToggle`).
5. `src/pages/MapPage.tsx`, `src/components/map/NoiseMarkers.tsx`, `HeatmapLayer.tsx`, `DateRangeFilter.tsx`, `UserFilterToggle.tsx`, `MarkerClusterGroup.tsx`, `MapContainer.tsx`, and `src/pages/DashboardPage.tsx`: whole files.
6. `node_modules/leaflet.heat/src/HeatLayer.js` (`_redraw`) and `node_modules/leaflet.markercluster/dist/leaflet.markercluster-src.js` (`addLayers`, `_addLayer`, `clearLayers`). `node_modules/react-leaflet/lib/Popup.js` (the popup lifecycle).
7. For the intended heatmap semantics: `noise_pollution_mapper/lib/models/heatmap_point.dart:65-70` (`clamp(dB, 0, 120) / 120`) and `lib/screens/map_view_screen.dart:1495-1545` (the app paints each point by its own intensity). Read only; do not edit the app.

---

## Steps

### Step 1 — bug-2, bug-9: one filtered set for markers, heatmap and badge

**Goal:** Filtering happens once, in a pure function, in `MapPage`. The SAME filtered array feeds `NoiseMarkers`, `HeatmapLayer` and the marker badge, so they cannot disagree (bug-2) and the badge counts what is drawn (bug-9). `NoiseMarkers` becomes purely presentational: it receives `readings`, and loads, filters, logs and reports nothing. `HeatmapLayer` moves out of `MarkerClusterGroup` to be a sibling under `MapComponent`. The Overview mini-map passes the provider's readings straight in.

**Files:**
- `src/lib/mapFilters.ts` (new)
- `src/lib/__tests__/mapFilters.test.ts` (new)
- `src/components/map/NoiseMarkers.tsx` (whole-file replacement)
- `src/pages/MapPage.tsx`
- `src/pages/DashboardPage.tsx`

**Exact changes**

1a. New pure module.

New file `src/lib/mapFilters.ts` — full contents:

```ts
/**
 * Pure filtering for the map (cluster 09). MapPage calls filterReadings() once
 * and hands the SAME array to the markers, the heatmap and the marker badge, so
 * the three can never disagree (bug-2, bug-9).
 *
 * No React and no Firebase, so it is unit-tested directly (master playbook
 * convention 2.15). Dates go through getReadingDate() (convention 2.10).
 */
import { getCoordinates, getReadingDate } from '@/lib/readings';
import type { CoordinateFields, DateFields } from '@/lib/readings';
import { categoryOf } from '@/lib/categories';

/** An inclusive window between two real instants. */
export interface DateRange {
  start: Date;
  end: Date;
}

/** The reading fields the map filter looks at. NoiseReading satisfies it structurally. */
export interface FilterableReading extends CoordinateFields, DateFields {
  userId?: string;
  decibelLevel?: unknown;
  soundClass?: string | null;
}

export interface ReadingFilters {
  /** The signed-in user's uid. Only consulted while showAllUsers is false. */
  userId: string;
  showAllUsers: boolean;
  /** Inclusive date window; null means all time. */
  range: DateRange | null;
  /** Optional inclusive dB window. No UI sets it yet (ux-6). */
  dbRange?: { min: number; max: number };
  /** Optional canonical category names (categories.ts). No UI sets it yet (ux-6). */
  categories?: readonly string[];
}

/**
 * The readings the map should draw: a usable position and dB first, then the
 * optional dB and category windows, then the date window, then the user
 * filter. Returns a new array; the input is never mutated.
 */
export function filterReadings<T extends FilterableReading>(
  readings: readonly T[],
  filters: ReadingFilters,
): T[] {
  const { userId, showAllUsers, range, dbRange, categories } = filters;
  const wanted = categories && categories.length > 0 ? categories : null;
  const startMs = range ? range.start.getTime() : null;
  const endMs = range ? range.end.getTime() : null;

  return readings.filter((reading) => {
    if (!getCoordinates(reading)) return false;

    const db = reading.decibelLevel;
    if (typeof db !== 'number' || !Number.isFinite(db)) return false;
    if (dbRange && (db < dbRange.min || db > dbRange.max)) return false;

    if (wanted && !wanted.includes(categoryOf(reading))) return false;

    if (startMs !== null && endMs !== null) {
      const date = getReadingDate(reading);
      if (!date) return false;
      const ms = date.getTime();
      if (ms < startMs || ms > endMs) return false;
    }

    if (!showAllUsers && reading.userId !== userId) return false;
    return true;
  });
}
```

Placement note: the module imports only other pure modules (`readings`, `categories`), so it is safe to import from tests (convention 2.15). The filter order is the order `NoiseMarkers` used at HEAD: position, dB, dB window, category, date, user. `FilterableReading` is structural, so `NoiseReading` (flat, epoch-ms) satisfies it without a cast. The `dbRange` and `categories` options keep the dead `NoiseMarkers` filter props alive in their new home (06.3m: "09.1 moves the whole filter to `MapPage`"). `MapPage` does not pass them, because the UI for them is ux-6.

1b. New tests.

New file `src/lib/__tests__/mapFilters.test.ts` — full contents:

```ts
import { describe, expect, it } from 'vitest';
import { filterReadings } from '@/lib/mapFilters';
import type { FilterableReading, ReadingFilters } from '@/lib/mapFilters';

interface TestReading extends FilterableReading {
  id: string;
}

function reading(overrides: Partial<TestReading> = {}): TestReading {
  return {
    id: 'r1',
    userId: 'u1',
    decibelLevel: 60,
    latitude: 6.9,
    longitude: 79.86,
    timestamp: new Date(2026, 9, 15, 12, 0).getTime(),
    ...overrides,
  };
}

const ALL: ReadingFilters = { userId: 'u1', showAllUsers: true, range: null };

function ids(list: TestReading[]): string[] {
  return list.map((item) => item.id);
}

describe('filterReadings', () => {
  it('keeps readings that have a position and a finite dB', () => {
    const list = [reading({ id: 'a' }), reading({ id: 'b', decibelLevel: 0 })];
    expect(ids(filterReadings(list, ALL))).toEqual(['a', 'b']);
  });

  it('drops a reading with no usable position', () => {
    const list = [
      reading({ id: 'ok' }),
      reading({ id: 'none', latitude: undefined }),
      reading({ id: 'range', latitude: 95 }),
    ];
    expect(ids(filterReadings(list, ALL))).toEqual(['ok']);
  });

  it('drops a reading whose dB is not a finite number', () => {
    const list = [
      reading({ id: 'ok' }),
      reading({ id: 'text', decibelLevel: 'loud' }),
      reading({ id: 'nan', decibelLevel: Number.NaN }),
      reading({ id: 'missing', decibelLevel: undefined }),
    ];
    expect(ids(filterReadings(list, ALL))).toEqual(['ok']);
  });

  it('keeps only the caller\'s readings while showAllUsers is false', () => {
    const list = [reading({ id: 'mine' }), reading({ id: 'theirs', userId: 'u2' })];
    expect(ids(filterReadings(list, { ...ALL, showAllUsers: false }))).toEqual(['mine']);
    expect(ids(filterReadings(list, ALL))).toEqual(['mine', 'theirs']);
  });

  it('matches nothing for an empty userId while showAllUsers is false', () => {
    const list = [reading({ id: 'mine' })];
    expect(filterReadings(list, { ...ALL, userId: '', showAllUsers: false })).toEqual([]);
  });

  it('applies an inclusive dB window', () => {
    const list = [
      reading({ id: 'low', decibelLevel: 39.9 }),
      reading({ id: 'min', decibelLevel: 40 }),
      reading({ id: 'max', decibelLevel: 70 }),
      reading({ id: 'high', decibelLevel: 70.1 }),
    ];
    expect(ids(filterReadings(list, { ...ALL, dbRange: { min: 40, max: 70 } }))).toEqual(['min', 'max']);
  });

  it('compares canonical categories, so Speech-Pollution matches Speech and Quiet is its own category', () => {
    const list = [
      reading({ id: 'speech', soundClass: 'Speech-Pollution' }),
      reading({ id: 'quiet', soundClass: 'Quiet' }),
      reading({ id: 'none' }),
    ];
    expect(ids(filterReadings(list, { ...ALL, categories: ['Speech'] }))).toEqual(['speech']);
    expect(ids(filterReadings(list, { ...ALL, categories: ['Quiet'] }))).toEqual(['quiet']);
    expect(ids(filterReadings(list, { ...ALL, categories: [] }))).toEqual(['speech', 'quiet', 'none']);
  });

  it('returns a new array and leaves the input untouched', () => {
    const list = [reading({ id: 'a' }), reading({ id: 'b', userId: 'u2' })];
    const copy = [...list];
    const result = filterReadings(list, { ...ALL, showAllUsers: false });
    expect(result).not.toBe(list);
    expect(list).toEqual(copy);
  });
});

describe('filterReadings date range', () => {
  const range = { start: new Date(2026, 9, 10), end: new Date(2026, 9, 16, 23, 59, 59, 999) };
  const inRange = new Date(2026, 9, 12, 12, 0).getTime();
  const outOfRange = new Date(2026, 8, 1, 12, 0).getTime();

  it('lets the server timestamp decide, not the client-clock createdAt (bug-8)', () => {
    const list = [
      reading({ id: 'server-in', timestamp: inRange, createdAt: outOfRange }),
      reading({ id: 'server-out', timestamp: outOfRange, createdAt: inRange }),
    ];
    expect(ids(filterReadings(list, { ...ALL, range }))).toEqual(['server-in']);
  });

  it('falls back to createdAt only when the timestamp is missing', () => {
    const list = [
      reading({ id: 'fallback', timestamp: null, createdAt: inRange }),
      reading({ id: 'nothing', timestamp: null }),
    ];
    expect(ids(filterReadings(list, { ...ALL, range }))).toEqual(['fallback']);
  });

  it('drops a reading with no date once a range is set, and keeps it for all time', () => {
    const list = [reading({ id: 'undated', timestamp: null })];
    expect(filterReadings(list, { ...ALL, range })).toEqual([]);
    expect(ids(filterReadings(list, ALL))).toEqual(['undated']);
  });

  it('includes both bounds', () => {
    const list = [
      reading({ id: 'start', timestamp: range.start.getTime() }),
      reading({ id: 'end', timestamp: range.end.getTime() }),
      reading({ id: 'before', timestamp: range.start.getTime() - 1 }),
      reading({ id: 'after', timestamp: range.end.getTime() + 1 }),
    ];
    expect(ids(filterReadings(list, { ...ALL, range }))).toEqual(['start', 'end']);
  });
});
```

Placement note: every date is built with the local-time `Date` constructor, so the suite passes in any time zone. The file imports no Firebase module.

1c. `src/components/map/NoiseMarkers.tsx`: the whole file becomes presentational.

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 1-374, the whole file at HEAD, verbatim; at execution time it already carries 04.2, 05.3 and 06.3 edits, see the checklist below):
```tsx
import { Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Icon } from 'leaflet';
import { useEffect, useState } from 'react';
import type { NoiseReading } from '@/types/NoiseReading';
import { format } from 'date-fns';
import * as localDb from '@/utils/db';
import * as syncManager from '@/utils/syncManager';

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
    userId?: string; // Filter by specific user (Phase 1)
    showAllUsers?: boolean; // Show all users' readings (Phase 2)
  };
  onMarkersLoaded?: (count: number) => void;
  onDataChange?: (data: NoiseReading[]) => void;
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
export function NoiseMarkers({ filters, onMarkersLoaded, onDataChange }: NoiseMarkersProps) {
  const [readings, setReadings] = useState<NoiseReading[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const map = useMap();

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        // Step 1: Load from IndexedDB cache (instant, 0 Firebase reads)
        const cachedReadings = await localDb.getAllReadings();
        
        if (isMounted) {
          setReadings(cachedReadings);
          setIsLoading(false);
          
          if (onMarkersLoaded) {
            onMarkersLoaded(cachedReadings.length);
          }
          
          if (onDataChange && cachedReadings.length > 0) {
            onDataChange(cachedReadings);
          }
        }

        // Step 2: Background sync - fetch only NEW readings since last sync
        const syncResult = await syncManager.syncNewReadings();
        
        if (isMounted && syncResult.newCount > 0) {
          // Reload all readings from IndexedDB (includes new ones)
          const updatedReadings = await localDb.getAllReadings();
          setReadings(updatedReadings);
          
          if (onMarkersLoaded) {
            onMarkersLoaded(updatedReadings.length);
          }
          
          if (onDataChange) {
            onDataChange(updatedReadings);
          }
        }
      } catch (error) {
        console.error('Error loading readings:', error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [onMarkersLoaded, onDataChange]);

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
      let readingDate: Date | undefined;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const read = reading as any;
      
      // Handle Firestore Timestamp object from IndexedDB (stored as { seconds, nanoseconds })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const timestampAny = reading.timestamp as any;
      if (timestampAny?.seconds) {
        readingDate = new Date(timestampAny.seconds * 1000);
      }
      // Handle Firestore Timestamp with toDate() method
      else if (reading.timestamp?.toDate) {
        readingDate = reading.timestamp.toDate();
      }
      // Handle ISO string
      else if (typeof reading.timestamp === 'string') {
        readingDate = new Date(reading.timestamp);
      }
      // Handle numeric timestamp (milliseconds)
      else if (typeof reading.timestamp === 'number') {
        readingDate = new Date(reading.timestamp);
      }
      // Handle nested timestamp (createdAt, updatedAt, etc.)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createdAtAny = read.createdAt as any;
      if (createdAtAny?.seconds) {
        readingDate = new Date(createdAtAny.seconds * 1000);
      }
      else if (read.createdAt?.toDate) {
        readingDate = read.createdAt.toDate();
      }
      else if (typeof read.createdAt === 'string') {
        readingDate = new Date(read.createdAt);
      }
      else if (typeof read.createdAt === 'number') {
        readingDate = new Date(read.createdAt);
      }
      
      if (!readingDate || readingDate < filters.dateRange.start ||
          readingDate > filters.dateRange.end) {
        return false;
      }
    }

    // Apply user filter (Phase 1: User-Based Restrictions)
    if (filters?.userId && !filters?.showAllUsers) {
      // Filter by specific user's readings
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const read = reading as any;
      if (read.userId !== filters.userId) {
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
```

AFTER (the whole file):
```tsx
import { Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Icon } from 'leaflet';
import type { NoiseReading } from '@/types/NoiseReading';
import { categoryLabel, confidenceLabel } from '@/lib/categories';
import { format } from 'date-fns';
import { getCoordinates, getReadingDate } from '@/lib/readings';

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

// Get marker color by dB level
function getMarkerColor(decibelLevel: number): string {
  if (decibelLevel < 50) return '#4CAF50'; // Green - Quiet
  if (decibelLevel <= 70) return '#FF9800'; // Orange - Moderate
  return '#F44336'; // Red - Loud
}

interface NoiseMarkersProps {
  /**
   * The readings to draw, already filtered by the caller (src/lib/mapFilters.ts).
   * This component draws exactly what it is given, so the markers, the heatmap
   * and the marker badge always show the same set (bug-2, bug-9).
   */
  readings: NoiseReading[];
}

/**
 * NoiseMarkers - Displays already-filtered noise readings as markers on the map
 *
 * Purely presentational: it loads nothing, filters nothing, logs nothing and
 * reports nothing to its parent.
 * - Color-coded by dB level
 * - A popup per marker
 * - An empty list shows the empty pin until Step 3 moves that message into an overlay
 */
export function NoiseMarkers({ readings }: NoiseMarkersProps) {
  const map = useMap();

  // Show empty state message (as a popup at map center)
  if (readings.length === 0) {
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
      {readings.map((reading) => {
        // Coordinates and date through the shared helpers (bug-1)
        const coords = getCoordinates(reading);
        if (!coords) {
          return null;
        }
        const { lat, lng } = coords;
        const readingDate = getReadingDate(reading);

        // Category text: the stored soundClass, or 'Unclassified' when absent
        const category = categoryLabel(reading);

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
          </Marker>
        );
      })}
    </>
  );
}
```

Already contained in the AFTER text (confirm each against the current file before replacing; they are what makes this a safe whole-file replacement, master §4.6):
- 04.2: popup date through `getReadingDate(reading)` (`readingDate` computed once per marker), coordinates through `getCoordinates(reading)`, no `console.warn` of a whole reading.
- 05.3: no local `useState` load, no `localDb`, no `syncManager`, no `useSyncedReadings` call in this file (the provider now reaches the map through `MapPage`).
- 06.3: the popup category is `categoryLabel(reading)` (so 'Quiet' and 'Unclassified' read correctly) and the popup confidence is `confidenceLabel(reading, 1)`. The `categoryOf` category filter moved into `mapFilters.ts`.
- Unchanged from HEAD, and so intentionally still present: `createMarkerIcon`, `getMarkerColor`, the popup JSX and the grey empty pin. Steps 3 and 5 change them.

1d. `src/pages/MapPage.tsx`: imports.

BEFORE (`src/pages/MapPage.tsx`, line 1, verbatim):
```tsx
import { useState } from 'react';
```

AFTER:
```tsx
import { useMemo, useState } from 'react';
```

BEFORE (`src/pages/MapPage.tsx`, line 16, verbatim):
```tsx
import type { NoiseReading } from '@/types/NoiseReading';
```

AFTER:
```tsx
import { filterReadings } from '@/lib/mapFilters';
```

Placement note: `NoiseReading` is no longer named in `MapPage` once `readingsData` goes (1e), so its import must go too (an unused import is an eslint error). 05.6d keeps this line verbatim.

1e. Same file: the two callback-fed states go.

BEFORE (`src/pages/MapPage.tsx`, lines 24-26, verbatim):
```tsx
  const [markerCount, setMarkerCount] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [readingsData, setReadingsData] = useState<NoiseReading[]>([]);
```

AFTER:
```tsx
  const [showHeatmap, setShowHeatmap] = useState(false);
```

1f. Same file: read the provider and filter once. This anchors on the line 05.6e left.

BEFORE (`src/pages/MapPage.tsx`, as left by 05.6e, verbatim):
```tsx
  const { forceFullSync } = useSyncedReadings();
```

AFTER:
```tsx
  const { readings, loading, forceFullSync } = useSyncedReadings();
  const userId = user?.uid ?? '';

  // One filtered set feeds the markers, the heatmap and the badge, so the three
  // can never disagree (bug-2, bug-9). The deps are the provider's readings array
  // plus primitives, so the memo recomputes only when one of them changes.
  const filteredReadings = useMemo(
    () => filterReadings(readings, { userId, showAllUsers, range: dateRange }),
    [readings, userId, showAllUsers, dateRange],
  );
```

Placement note: this line sits after `useTheme()` and after every `useState`, so `showAllUsers` and `dateRange` are already declared. `user` (from `useAuth`, line 21) stays in use through `userId`.

1g. Same file: the badge counts what is drawn.

BEFORE (`src/pages/MapPage.tsx`, line 136, verbatim):
```tsx
          <span className="font-semibold text-sm">{markerCount} markers</span>
```

AFTER:
```tsx
          <span className="font-semibold text-sm">{filteredReadings.length} markers</span>
```

1h. Same file: one array for both layers; the heatmap leaves the cluster group; the loading gate moves here.

BEFORE (`src/pages/MapPage.tsx`, lines 173-184, verbatim):
```tsx
              <NoiseMarkers
                filters={{
                  userId: user?.uid || '',
                  showAllUsers,
                  dateRange: dateRange || undefined,
                }}
                onMarkersLoaded={setMarkerCount}
                onDataChange={setReadingsData}
              />
              <HeatmapLayer readings={readingsData} visible={showHeatmap} />
            </MarkerClusterGroup>
          </MapComponent>
```

AFTER:
```tsx
              {!loading && <NoiseMarkers readings={filteredReadings} />}
            </MarkerClusterGroup>
            <HeatmapLayer readings={filteredReadings} visible={showHeatmap} />
          </MapComponent>
```

Placement note: `NoiseMarkers` used to return `null` while the provider was loading. `loading` now gates it here, so the grey empty pin cannot flash before the cache is read. `HeatmapLayer` calls `useMap()` only, so as a sibling under `MapComponent` it still sits inside the Leaflet map context. The `<MarkerClusterGroup options={{ … }}>` opening lines above this block are untouched.

1i. `src/pages/DashboardPage.tsx`: the mini-map passes the provider's readings. This anchors on the line 05.5d left.

BEFORE (`src/pages/DashboardPage.tsx`, as left by 05.5d, verbatim):
```tsx
                    <NoiseMarkers />
```

AFTER:
```tsx
                    <NoiseMarkers readings={readings} />
```

Placement note: `readings` is already in scope from 05.5b (`const { readings, loading: isLoading, error, syncing, refresh } = useSyncedReadings();`). The Overview map shows every reading, as it did at HEAD (it passed no filters), so no `filterReadings` call is needed. After 04.3 every cached reading has a position and a finite dB. The mini-map is already gated on `isLoading` by `DashboardPage`.

**Edge cases to preserve**
- Filter semantics are unchanged from `NoiseMarkers.tsx:117-230` at HEAD (position, dB, date, user), with one deliberate difference: an EMPTY `userId` with `showAllUsers` false now matches nothing, where HEAD (`if (filters?.userId && !filters?.showAllUsers)`) silently showed everything. A signed-out visitor cannot reach `/map` (`ProtectedRoute`), so this is unreachable in practice, and the safe default is no data.
- The date window is still the `{ start, end }` pair `DateRangeFilter` produces. Step 2 replaces it with a preset id.
- `NoiseMarkers` keeps the grey empty pin until Step 3, so this commit changes no copy.
- `HeatmapLayer.tsx` is NOT edited here. Its intensity maths, its `lat || 0` quirk and its stale colour comments are Step 4's. Only the array it receives and its position in the tree change.
- 04.2 made the date filter prefer `timestamp`; the filter here uses the same `getReadingDate`. The category filter compares `categoryOf` (canonical), so a manual `Speech-Pollution` report matches a `Speech` filter and `Quiet` is a category of its own.
- No `console.warn` or `console.log` of a reading anywhere (convention 2.13).

**Acceptance criteria**
- `grep -rn "onDataChange\|onMarkersLoaded\|readingsData\|setMarkerCount" src` prints nothing, and `grep -n "markerCount" src/pages/MapPage.tsx` prints nothing. (`AnalyticsPage` and `DashboardPage` keep their own derived `markerCount` constants from 05; they are not touched.)
- `grep -n "console\.\|useEffect\|useSyncedReadings\|localDb\|syncManager" src/components/map/NoiseMarkers.tsx` prints nothing.
- `grep -n "HeatmapLayer" src/pages/MapPage.tsx` shows the import and one element, and the element is not inside `<MarkerClusterGroup>`.
- Manual (dev server, admin, `/map`, filter panel open):
  - On 'My Readings Only', the badge, the markers and the heatmap (toggle it on) show the same set. Switch to 'All Users' and all three grow together.
  - Pick 'Last 7 days': all three shrink together. With a date range that matches nothing, the badge reads `0 markers` and the heatmap is empty.
  - An account with no readings of its own on 'My Readings Only' sees `0 markers` (not the unfiltered total) and the grey pin.
  - After a Sync that brings new readings, the badge, markers and heatmap all update.
- `npx vitest run src/lib/__tests__/mapFilters.test.ts` passes.

**Verify**
```
npx tsc -b
npx eslint src/lib/mapFilters.ts src/lib/__tests__/mapFilters.test.ts src/components/map/NoiseMarkers.tsx src/pages/MapPage.tsx src/pages/DashboardPage.tsx
npx vitest run src/lib/__tests__/mapFilters.test.ts
```

**Commit title:** `fix(map): one filtered reading set feeds markers, heatmap and the marker badge (bug-2, bug-9)`

---

### Step 2 — bug-6, bug-8 (parts 2 and 3): controlled date presets

**Goal:** `DateRangeFilter` holds no selection of its own: `MapPage` stores a preset id and passes it down, so closing and reopening the filter panel cannot make the button disagree with the map (bug-6). The window is computed from the preset at filter time, from the start of the day N days ago to the end of today, so a reading synced after the selection is not hidden and the oldest day is not cut off mid-day (bug-8, parts 2 and 3). The timestamp-first precedence from 04.2 is unchanged (part 1).

**Files:**
- `src/lib/mapFilters.ts`
- `src/lib/__tests__/mapFilters.test.ts`
- `src/components/map/DateRangeFilter.tsx` (whole-file replacement)
- `src/pages/MapPage.tsx`

**Exact changes**

Prerequisite: Step 1 is committed. Every block below anchors on Step 1's AFTER text, except the `DateRangeFilter.tsx` and `MapPage.tsx` JSX blocks, which are untouched HEAD text.

2a. `src/lib/mapFilters.ts`: import the date helpers.

BEFORE (`src/lib/mapFilters.ts`, as left by Step 1, verbatim):
```ts
import { categoryOf } from '@/lib/categories';
```

AFTER:
```ts
import { categoryOf } from '@/lib/categories';
import { endOfDay, startOfDay, subDays } from 'date-fns';
```

2b. Same file: the presets, and the two functions that turn a preset into a window and a caption.

BEFORE (`src/lib/mapFilters.ts`, as left by Step 1, verbatim):
```ts
/** An inclusive window between two real instants. */
export interface DateRange {
  start: Date;
  end: Date;
}
```

AFTER:
```ts
/** An inclusive window between two real instants. */
export interface DateRange {
  start: Date;
  end: Date;
}

export type DatePresetId = 'all' | '7d' | '30d' | '90d';

export interface DatePreset {
  id: DatePresetId;
  label: string;
  /** Days back from today; null means all time. */
  days: number | null;
}

/** The presets in the order the filter lists them. */
export const DATE_PRESETS: readonly DatePreset[] = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

export const DEFAULT_DATE_PRESET: DatePresetId = 'all';

/**
 * The window a preset means at `now`: from the START of the day `days` days
 * ago to the END of today (browser-local days; bug-12 owns Asia/Colombo).
 * Computed at filter time, never at click time, so readings that arrive
 * after the selection are inside the window (bug-8). Null means all time.
 */
export function presetRange(id: DatePresetId, now: Date): DateRange | null {
  const preset = DATE_PRESETS.find((candidate) => candidate.id === id);
  if (!preset || preset.days === null) return null;
  return { start: startOfDay(subDays(now, preset.days)), end: endOfDay(now) };
}

/** The caption under the date control: the window in plain dates. */
export function presetSummary(id: DatePresetId, now: Date = new Date()): string {
  const range = presetRange(id, now);
  if (!range) return 'Showing all dates';
  return `From ${range.start.toLocaleDateString()} to ${range.end.toLocaleDateString()}`;
}
```

Placement note: `presetRange` and `presetSummary` are function declarations, so their position above `ReadingFilters` is fine. `presetSummary` takes `now` as a default parameter so the component never reads the clock during render (eslint-plugin-react-hooks `purity`). An unknown preset id falls back to all time. A window of `days: 7` spans 8 calendar days (the day 7 days ago through today). That is the app-aligned reading of 'last 7 days back from today' and it never cuts the oldest day short.

2c. Same file: the filter takes a preset, not a frozen window.

BEFORE (`src/lib/mapFilters.ts`, as left by Step 1, verbatim):
```ts
  /** Inclusive date window; null means all time. */
  range: DateRange | null;
```

AFTER:
```ts
  /** Preset id; the window is computed from it at filter time (bug-6, bug-8). */
  preset: DatePresetId;
```

BEFORE (`src/lib/mapFilters.ts`, as left by Step 1, verbatim):
```ts
export function filterReadings<T extends FilterableReading>(
  readings: readonly T[],
  filters: ReadingFilters,
): T[] {
  const { userId, showAllUsers, range, dbRange, categories } = filters;
  const wanted = categories && categories.length > 0 ? categories : null;
  const startMs = range ? range.start.getTime() : null;
  const endMs = range ? range.end.getTime() : null;
```

AFTER:
```ts
export function filterReadings<T extends FilterableReading>(
  readings: readonly T[],
  filters: ReadingFilters,
  now: Date = new Date(),
): T[] {
  const { userId, showAllUsers, preset, dbRange, categories } = filters;
  const wanted = categories && categories.length > 0 ? categories : null;
  const range = presetRange(preset, now);
  const startMs = range ? range.start.getTime() : null;
  const endMs = range ? range.end.getTime() : null;
```

Placement note: the `return readings.filter(...)` body below is unchanged: it still compares `getReadingDate(reading)` (timestamp first, `createdAt` only when the timestamp is missing) against `startMs` and `endMs`. `now` defaults to the clock at the moment the filter RUNS, which is each recompute of `MapPage`'s memo (a changed preset, user filter or readings array). A tab left open across midnight with no new sync keeps yesterday's window until the next of those; the provider's hourly sync refreshes it.

2d. `src/lib/__tests__/mapFilters.test.ts`: the tests follow the new option shape.

BEFORE (`src/lib/__tests__/mapFilters.test.ts`, as left by Step 1, verbatim):
```ts
import { filterReadings } from '@/lib/mapFilters';
```

AFTER:
```ts
import { filterReadings, presetRange, presetSummary } from '@/lib/mapFilters';
```

BEFORE (`src/lib/__tests__/mapFilters.test.ts`, as left by Step 1, verbatim):
```ts
const ALL: ReadingFilters = { userId: 'u1', showAllUsers: true, range: null };
```

AFTER:
```ts
const ALL: ReadingFilters = { userId: 'u1', showAllUsers: true, preset: 'all' };
```

BEFORE (`src/lib/__tests__/mapFilters.test.ts`, as left by Step 1 (the last describe block, to the end of the file), verbatim):
```ts
describe('filterReadings date range', () => {
  const range = { start: new Date(2026, 9, 10), end: new Date(2026, 9, 16, 23, 59, 59, 999) };
  const inRange = new Date(2026, 9, 12, 12, 0).getTime();
  const outOfRange = new Date(2026, 8, 1, 12, 0).getTime();

  it('lets the server timestamp decide, not the client-clock createdAt (bug-8)', () => {
    const list = [
      reading({ id: 'server-in', timestamp: inRange, createdAt: outOfRange }),
      reading({ id: 'server-out', timestamp: outOfRange, createdAt: inRange }),
    ];
    expect(ids(filterReadings(list, { ...ALL, range }))).toEqual(['server-in']);
  });

  it('falls back to createdAt only when the timestamp is missing', () => {
    const list = [
      reading({ id: 'fallback', timestamp: null, createdAt: inRange }),
      reading({ id: 'nothing', timestamp: null }),
    ];
    expect(ids(filterReadings(list, { ...ALL, range }))).toEqual(['fallback']);
  });

  it('drops a reading with no date once a range is set, and keeps it for all time', () => {
    const list = [reading({ id: 'undated', timestamp: null })];
    expect(filterReadings(list, { ...ALL, range })).toEqual([]);
    expect(ids(filterReadings(list, ALL))).toEqual(['undated']);
  });

  it('includes both bounds', () => {
    const list = [
      reading({ id: 'start', timestamp: range.start.getTime() }),
      reading({ id: 'end', timestamp: range.end.getTime() }),
      reading({ id: 'before', timestamp: range.start.getTime() - 1 }),
      reading({ id: 'after', timestamp: range.end.getTime() + 1 }),
    ];
    expect(ids(filterReadings(list, { ...ALL, range }))).toEqual(['start', 'end']);
  });
});
```

AFTER:
```ts
// Friday 16 Oct 2026, 15:30 local time.
const NOW = new Date(2026, 9, 16, 15, 30);

describe('presetRange', () => {
  it('is null for all time and for an unknown id', () => {
    expect(presetRange('all', NOW)).toBeNull();
    expect(presetRange('bogus' as never, NOW)).toBeNull();
  });

  it('runs from the start of the day N days ago to the end of today (bug-8)', () => {
    const range = presetRange('7d', NOW);
    expect(range?.start.getTime()).toBe(new Date(2026, 9, 9, 0, 0, 0, 0).getTime());
    expect(range?.end.getTime()).toBe(new Date(2026, 9, 16, 23, 59, 59, 999).getTime());
  });

  it('covers 30 and 90 days back', () => {
    expect(presetRange('30d', NOW)?.start.getTime()).toBe(new Date(2026, 8, 16).getTime());
    expect(presetRange('90d', NOW)?.start.getTime()).toBe(new Date(2026, 6, 18).getTime());
  });
});

describe('filterReadings with a date preset', () => {
  const preset = { ...ALL, preset: '7d' as const };

  it('keeps the whole oldest day and drops the day before it', () => {
    const list = [
      reading({ id: 'first-ms', timestamp: new Date(2026, 9, 9, 0, 0, 0, 0).getTime() }),
      reading({ id: 'too-old', timestamp: new Date(2026, 9, 8, 23, 59, 59, 999).getTime() }),
    ];
    expect(ids(filterReadings(list, preset, NOW))).toEqual(['first-ms']);
  });

  it('does not hide a reading that arrives later today (end of today, not click time)', () => {
    const later = reading({ id: 'later', timestamp: new Date(2026, 9, 16, 23, 0).getTime() });
    const tomorrow = reading({ id: 'tomorrow', timestamp: new Date(2026, 9, 17, 0, 0).getTime() });
    expect(ids(filterReadings([later, tomorrow], preset, NOW))).toEqual(['later']);
  });

  it('recomputes the window from the clock it is given, so a later run sees newer readings', () => {
    const newest = reading({ id: 'newest', timestamp: new Date(2026, 9, 20, 9, 0).getTime() });
    expect(filterReadings([newest], preset, NOW)).toEqual([]);
    expect(ids(filterReadings([newest], preset, new Date(2026, 9, 20, 10, 0)))).toEqual(['newest']);
  });

  it('lets the server timestamp decide over the client-clock createdAt (bug-8, part 1 kept)', () => {
    const inWindow = new Date(2026, 9, 12, 12, 0).getTime();
    const outOfWindow = new Date(2026, 8, 1, 12, 0).getTime();
    const list = [
      reading({ id: 'server-in', timestamp: inWindow, createdAt: outOfWindow }),
      reading({ id: 'server-out', timestamp: outOfWindow, createdAt: inWindow }),
      reading({ id: 'fallback', timestamp: null, createdAt: inWindow }),
      reading({ id: 'undated', timestamp: null }),
    ];
    expect(ids(filterReadings(list, preset, NOW))).toEqual(['server-in', 'fallback']);
  });

  it('keeps undated readings for all time', () => {
    const list = [reading({ id: 'undated', timestamp: null })];
    expect(ids(filterReadings(list, ALL, NOW))).toEqual(['undated']);
  });
});

describe('presetSummary', () => {
  it('says all dates for all time', () => {
    expect(presetSummary('all', NOW)).toBe('Showing all dates');
  });

  it('names the window in local dates', () => {
    expect(presetSummary('7d', NOW)).toBe(
      `From ${new Date(2026, 9, 9).toLocaleDateString()} to ${new Date(2026, 9, 16, 23, 59, 59, 999).toLocaleDateString()}`,
    );
  });
});
```

Placement note: the first `describe('filterReadings', …)` block uses `ALL` and is unchanged; only the date-range block is replaced.

2e. `src/components/map/DateRangeFilter.tsx`: the whole file becomes controlled. This file is touched by no other cluster, so the BEFORE is the exact current file.

BEFORE (`src/components/map/DateRangeFilter.tsx`, lines 1-106, the whole file, verbatim):
```tsx
import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DateRangeFilterProps {
  onDateRangeChange?: (range: { start: Date; end: Date } | null) => void;
}

interface DateRangeOption {
  label: string;
  days: number | null; // null = all time
}

const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
];

/**
 * DateRangeFilter - Filter readings by date range
 * 
 * Features:
 * - Preset options (7/30/90 days, All time)
 * - Clear visual indication of selected range
 * - Works with cached data (no extra Firestore reads)
 */
export function DateRangeFilter({ onDateRangeChange }: DateRangeFilterProps) {
  const { isDarkMode } = useTheme();
  const [selectedOption, setSelectedOption] = useState<DateRangeOption>(DATE_RANGE_OPTIONS[3]); // Default: All time
  const [isOpen, setIsOpen] = useState(false);

  function handleSelect(option: DateRangeOption) {
    setSelectedOption(option);
    setIsOpen(false);
    
    if (onDateRangeChange) {
      if (option.days === null) {
        // All time - no filter
        onDateRangeChange(null);
      } else {
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - option.days);
        
        onDateRangeChange({
          start: startDate,
          end: endDate,
        });
      }
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-start text-left font-normal ${
            !selectedOption && 'text-muted-foreground'
          } ${
            isDarkMode
              ? 'border-gray-600 text-gray-300 hover:bg-gray-800'
              : ''
          }`}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {selectedOption ? selectedOption.label : 'Select date range'}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className={`w-56 z-[9999] ${
        isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white'
      }`}>
        <div className="space-y-1">
          {DATE_RANGE_OPTIONS.map((option) => (
            <Button
              key={option.label}
              variant="ghost"
              className={`w-full justify-start font-normal ${
                selectedOption?.label === option.label
                  ? isDarkMode
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-200 text-gray-900'
                  : isDarkMode
                    ? 'text-gray-300 hover:bg-gray-800'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => handleSelect(option)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

AFTER (the whole file):
```tsx
import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DATE_PRESETS, type DatePresetId } from '@/lib/mapFilters';

interface DateRangeFilterProps {
  /** The active preset. MapPage owns it, so this control always matches the map (bug-6). */
  value: DatePresetId;
  onChange: (preset: DatePresetId) => void;
}

/**
 * DateRangeFilter - Filter readings by date range
 *
 * Features:
 * - Preset options (7/30/90 days, All time) from src/lib/mapFilters.ts
 * - Controlled: no selection of its own, so closing and reopening the filter
 *   panel can never show a different range from the one the map applies
 * - Works with cached data (no extra Firestore reads)
 */
export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const { isDarkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const selected = DATE_PRESETS.find((preset) => preset.id === value);

  function handleSelect(id: DatePresetId) {
    setIsOpen(false);
    onChange(id);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-start text-left font-normal ${
            isDarkMode
              ? 'border-gray-600 text-gray-300 hover:bg-gray-800'
              : ''
          }`}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {selected ? selected.label : 'Select date range'}
        </Button>
      </PopoverTrigger>

      <PopoverContent className={`w-56 z-[9999] ${
        isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white'
      }`}>
        <div className="space-y-1">
          {DATE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="ghost"
              className={`w-full justify-start font-normal ${
                preset.id === value
                  ? isDarkMode
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-200 text-gray-900'
                  : isDarkMode
                    ? 'text-gray-300 hover:bg-gray-800'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => handleSelect(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

Placement note: the dead `!selectedOption && 'text-muted-foreground'` class expression is dropped (`selectedOption` was never falsy). The popover markup, classes and z-index are otherwise unchanged. `DateRangeOption` and the local option array are gone: the presets live in `mapFilters.ts`.

2f. `src/pages/MapPage.tsx`: import, state, memo and JSX. The import and the memo blocks anchor on the AFTER text of Step 1; the state line and the `DateRangeFilter` JSX block are untouched HEAD text.

BEFORE (`src/pages/MapPage.tsx`, as left by Step 1, verbatim):
```tsx
import { filterReadings } from '@/lib/mapFilters';
```

AFTER:
```tsx
import { DEFAULT_DATE_PRESET, filterReadings, presetSummary, type DatePresetId } from '@/lib/mapFilters';
```

BEFORE (`src/pages/MapPage.tsx`, line 28, verbatim):
```tsx
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null); // Phase 3: Date filter (null = all time)
```

AFTER:
```tsx
  const [datePreset, setDatePreset] = useState<DatePresetId>(DEFAULT_DATE_PRESET); // Phase 3: Date filter (a preset id; the window is computed at filter time)
```

Placement note: this line is untouched HEAD text (Step 1 did not change it).

BEFORE (`src/pages/MapPage.tsx`, as left by Step 1, verbatim):
```tsx
    () => filterReadings(readings, { userId, showAllUsers, range: dateRange }),
    [readings, userId, showAllUsers, dateRange],
```

AFTER:
```tsx
    () => filterReadings(readings, { userId, showAllUsers, preset: datePreset }),
    [readings, userId, showAllUsers, datePreset],
```

BEFORE (`src/pages/MapPage.tsx`, lines 222-231, verbatim):
```tsx
            <DateRangeFilter
              onDateRangeChange={setDateRange}
            />
            <p className={`text-xs mt-2 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              {dateRange
                ? `From ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}`
                : 'Showing all dates'}
            </p>
```

AFTER:
```tsx
            <DateRangeFilter value={datePreset} onChange={setDatePreset} />
            <p className={`text-xs mt-2 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              {presetSummary(datePreset)}
            </p>
```

**Edge cases to preserve**
- Same caption format as HEAD ('From <date> to <date>' and 'Showing all dates'), now produced by `presetSummary`.
- Default is still all time, so the first view is unchanged. The preset list order and labels are unchanged.
- Timestamp-first precedence from 04.2 is unchanged and now covered by a preset-level test.
- No `new Date()`, `Date.now()` or `Math.random()` appears in any component. The clock is read only as a default parameter inside `src/lib/mapFilters.ts`.
- The `Popover` content keeps `z-[9999]` so it stays above the map overlays.

**Acceptance criteria**
- `grep -rn "dateRange\|setDateRange\|onDateRangeChange" src` prints nothing.
- Manual: select 'Last 7 days', close the filter panel, reopen it. The button reads 'Last 7 days' and the caption below it reads 'From <date 7 days ago> to <today>'. Select 'All time' and the caption reads 'Showing all dates'.
- Manual: with 'Last 7 days' selected, record a reading on the phone, press Sync on the map. The new reading appears without re-selecting the preset.
- Manual: a reading from exactly 7 days ago in the early morning is on the map.
- `npx vitest run src/lib/__tests__/mapFilters.test.ts` passes.

**Verify**
```
npx tsc -b
npx eslint src/lib/mapFilters.ts src/lib/__tests__/mapFilters.test.ts src/components/map/DateRangeFilter.tsx src/pages/MapPage.tsx
npx vitest run src/lib/__tests__/mapFilters.test.ts
```

**Commit title:** `fix(map): controlled date presets recomputed at filter time with day boundaries (bug-6, bug-8)`

---

### Step 3 — ux-2: default view and empty overlay

**Goal:** `/map` opens on every contributor's readings (decision D1), and an empty result is explained by a real overlay that knows which filter caused it and offers a way out. The fake grey pin that said "Be the first to contribute" is gone. The Data Source confirmation copy matches the new default.

**Files:**
- `src/pages/MapPage.tsx`
- `src/components/map/NoiseMarkers.tsx`
- `src/components/map/UserFilterToggle.tsx`

**Exact changes**

Prerequisite: Steps 1 and 2 are committed. The `MapPage.tsx` blocks anchor on their AFTER text, except 3a (HEAD text) and 3b's anchor `{/* Filter Panel */}` (HEAD text).

3a. `src/pages/MapPage.tsx`: the default data source. **Read the owner's D1 answer first.**
- **D1(A), the default** (admin-only dashboard): apply the change below. An admin who recorded nothing then opens on the community's readings, and the toggle narrows to their own.
- **D1(B)** (community viewing, own readings first): SKIP 3a. The line stays `useState(false)`; the overlay in 3b is the recovery path (its button switches to all readings).

BEFORE (`src/pages/MapPage.tsx`, line 27, verbatim):
```tsx
  const [showAllUsers, setShowAllUsers] = useState(false); // Phase 1: User filter
```

AFTER:
```tsx
  const [showAllUsers, setShowAllUsers] = useState(true); // Phase 1: User filter. D1(A): open on every contributor's readings; the toggle narrows to "My Readings Only"
```

3b. Same file: the empty-state overlay. It renders only after the provider has loaded, and it is the single owner of the "nothing to show" message.

BEFORE (`src/pages/MapPage.tsx`, line 188, verbatim):
```tsx
      {/* Filter Panel */}
```

AFTER:
```tsx
      {/* Empty state (ux-2): a real overlay that names the cause. It is never a marker. */}
      {!loading && filteredReadings.length === 0 && (
        <div className="absolute inset-0 z-[350] flex items-center justify-center p-4 pointer-events-none">
          <div
            role="status"
            className={`pointer-events-auto max-w-sm rounded-lg shadow-lg p-4 text-center ${
              isDarkMode ? 'bg-[#2D2640] text-white' : 'bg-white text-gray-900'
            }`}
          >
            <p className="font-semibold mb-1">
              {readings.length === 0
                ? 'No readings have been synced yet'
                : 'No readings match the current filters'}
            </p>
            <p className={`text-sm mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {readings.length === 0
                ? 'Readings appear here once the mobile app has uploaded them.'
                : 'Nothing matches the current Data Source and Date Range filters.'}
            </p>
            {readings.length > 0 && (!showAllUsers || datePreset !== DEFAULT_DATE_PRESET) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAllUsers(true);
                  setDatePreset(DEFAULT_DATE_PRESET);
                }}
              >
                Show all readings
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Filter Panel */}
```

Placement note: the overlay sits after the map container and before the filter panel. Its `z-[350]` is above the top bar (`z-[300]`) and below the filter panel (`z-[399]`), the badge and the legend (`z-[400]`); the full-screen wrapper is `pointer-events-none`, so only the card takes clicks and the map underneath stays draggable. `loading`, `readings`, `showAllUsers`, `datePreset`, `DEFAULT_DATE_PRESET`, `Button` and `isDarkMode` are all already in scope from Steps 1 and 2 and the HEAD imports. With no readings at all there is no button, because there is nothing to widen to.

3c. `src/components/map/NoiseMarkers.tsx`: the grey empty pin goes. These blocks anchor on Step 1's AFTER text.

BEFORE (`src/components/map/NoiseMarkers.tsx`, as left by Step 1, verbatim):
```tsx
import { Marker, Popup, useMap } from 'react-leaflet';
```

AFTER:
```tsx
import { Marker, Popup } from 'react-leaflet';
```

BEFORE (`src/components/map/NoiseMarkers.tsx`, as left by Step 1, verbatim):
```tsx
/**
 * NoiseMarkers - Displays already-filtered noise readings as markers on the map
 *
 * Purely presentational: it loads nothing, filters nothing, logs nothing and
 * reports nothing to its parent.
 * - Color-coded by dB level
 * - A popup per marker
 * - An empty list shows the empty pin until Step 3 moves that message into an overlay
 */
export function NoiseMarkers({ readings }: NoiseMarkersProps) {
  const map = useMap();

  // Show empty state message (as a popup at map center)
  if (readings.length === 0) {
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
```

AFTER:
```tsx
/**
 * NoiseMarkers - Displays already-filtered noise readings as markers on the map
 *
 * Purely presentational: it loads nothing, filters nothing, logs nothing and
 * reports nothing to its parent.
 * - Color-coded by dB level
 * - A popup per marker
 * - An empty list renders nothing: MapPage shows the filter-aware empty overlay (ux-2)
 */
export function NoiseMarkers({ readings }: NoiseMarkersProps) {
  // Nothing to draw: MapPage explains why (ux-2). No marker is ever invented.
  if (readings.length === 0) {
    return null;
  }
```

Placement note: `useMap` and `map.getCenter()` are no longer used, so both go (an unused import or variable is an eslint error). `Marker`, `Popup`, `LatLngExpression` and `createMarkerIcon` are still used by the marker list below. Everything from `  return (\n    <>` to the end of the file is unchanged in this step.

3d. `src/components/map/UserFilterToggle.tsx`: the confirmation copy. It anchors on text 03.2 leaves untouched (03.2 edits only the header comment and the recommendation panel).

BEFORE (`src/components/map/UserFilterToggle.tsx`, lines 93-95, verbatim):
```tsx
              <p>
                This will show noise readings from <strong>all users</strong> instead of just your own.
              </p>
```

AFTER:
```tsx
              <p>
                This will show noise readings from <strong>all contributors</strong> instead of just your own. They are already in this browser, so nothing is downloaded: this only changes which readings the map shows.
              </p>
```

**Edge cases to preserve**
- The overlay shows only when `!loading`, so a cold load never flashes it. It distinguishes "no readings synced at all" from "filters excluded everything".
- Under D1(A), `Show all readings` is offered only when a narrowing filter is active (`!showAllUsers` or a non-default date preset). It resets both to their defaults.
- The badge, the legend and the filter panel stay above the overlay. Closing the filter panel does not touch the overlay.
- No marker is ever created for an empty result. `NoiseMarkers` returns `null`, and on the Overview mini-map the stats cards already carry the no-data message.
- The toggle's button label, `title` strings, handlers, dialog title and buttons are unchanged (`UserFilterToggle` still asks before switching TO all users; the copy now says why that is safe).

**Acceptance criteria**
- `grep -rn "Be the first to contribute\|No noise readings yet" src` prints nothing.
- `grep -n "useMap\|getCenter" src/components/map/NoiseMarkers.tsx` prints nothing.
- Manual, D1(A) (signed in as the admin, `/map`): the badge shows the full count on first open, the caption reads 'Showing readings from all users', and there is no grey pin.
- Manual: choose 'My Readings Only' as an account with no readings of its own. The overlay reads 'No readings match the current filters' with a 'Show all readings' button, and the button restores the full map. Choose a date range with no readings: same overlay, same button. The map under the overlay still drags and zooms.
- Manual: switching to All Users shows the dialog with the new sentence and no mention of a download.

**Verify**
```
npx tsc -b
npx eslint src/pages/MapPage.tsx src/components/map/NoiseMarkers.tsx src/components/map/UserFilterToggle.tsx
```

**Commit title:** `fix(map): default to all readings and show a filter-aware empty overlay instead of a fake pin (ux-2)`

---

### Step 4 — bug-7: heatmap intensity and legend

**Goal:** The heatmap uses the app's intensity (`clamp(dB / 120)`), treats 0 dB as 0, and puts its gradient stops on the shared 50 / 70 dB band thresholds, so a lone reading lands on its own band colour. Readings recorded at the same spot are averaged into one point first, so twenty repeat recordings of a quiet place can no longer add up to red. The layer is built only while visible. A new `MapLegend` shows the band swatches, the heatmap note and the shared uncalibrated-dB caveat.

**Files:**
- `src/lib/mapFilters.ts`
- `src/lib/__tests__/mapFilters.test.ts`
- `src/components/map/HeatmapLayer.tsx` (whole-file replacement)
- `src/components/map/MapLegend.tsx` (new)
- `src/pages/MapPage.tsx`

**Exact changes**

Prerequisite: Steps 1-3 are committed. The `mapFilters.ts` and test blocks anchor on Step 2's AFTER text.

4a. `src/lib/mapFilters.ts`: the heat helpers go at the end of the file.

BEFORE (`src/lib/mapFilters.ts`, as left by Step 2 (the last lines of the file), verbatim):
```ts
    if (!showAllUsers && reading.userId !== userId) return false;
    return true;
  });
}
```

AFTER:
```ts
    if (!showAllUsers && reading.userId !== userId) return false;
    return true;
  });
}

/** A reading at or above this dB is drawn at full heat. Same 0-120 dB scale as the app (heatmap_point.dart:65-70). */
export const HEAT_MAX_DB = 120;

/**
 * Heat intensity (0..1) for a dB value, or null when it is not a finite
 * number. 0 dB is a real reading and maps to 0, not to a default (bug-7).
 */
export function heatIntensity(db: unknown): number | null {
  if (typeof db !== 'number' || !Number.isFinite(db)) return null;
  return Math.min(1, Math.max(0, db / HEAT_MAX_DB));
}

/**
 * Heat points [lat, lng, intensity] for leaflet.heat. Readings at the same
 * site (positions equal to 4 decimals, about 11 m) become ONE point whose
 * intensity is the mean dB of the site, so twenty repeat recordings of a quiet
 * spot cannot add up to 'very loud' (bug-7). leaflet.heat still sums nearby
 * sites, so the map shows where readings concentrate, tinted by loudness.
 */
export function buildHeatPoints(
  readings: readonly FilterableReading[],
): Array<[number, number, number]> {
  const sites = new Map<string, { lat: number; lng: number; db: number; count: number }>();
  for (const reading of readings) {
    const coords = getCoordinates(reading);
    const db = reading.decibelLevel;
    if (!coords || typeof db !== 'number' || !Number.isFinite(db)) continue;
    const key = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
    const site = sites.get(key);
    if (site) {
      site.lat += coords.lat;
      site.lng += coords.lng;
      site.db += db;
      site.count += 1;
    } else {
      sites.set(key, { lat: coords.lat, lng: coords.lng, db, count: 1 });
    }
  }

  const points: Array<[number, number, number]> = [];
  for (const site of sites.values()) {
    const intensity = heatIntensity(site.db / site.count);
    if (intensity === null) continue;
    points.push([site.lat / site.count, site.lng / site.count, intensity]);
  }
  return points;
}
```

Placement note: `heatIntensity` accepts `unknown` so a bad `decibelLevel` can never reach the canvas as `NaN`. The old `point[0] !== 0 && point[1] !== 0` filter is gone: `getCoordinates` already rejects non-finite and out-of-range positions, and a real coordinate of 0 is valid after 04.2. The 4-decimal site key (about 11 m) is a tuning constant, not a contract.

4b. `src/lib/__tests__/mapFilters.test.ts`: append the heat tests and extend the import.

BEFORE (`src/lib/__tests__/mapFilters.test.ts`, as left by Step 2, verbatim):
```ts
import { filterReadings, presetRange, presetSummary } from '@/lib/mapFilters';
```

AFTER:
```ts
import {
  buildHeatPoints,
  filterReadings,
  heatIntensity,
  presetRange,
  presetSummary,
} from '@/lib/mapFilters';
```

BEFORE (`src/lib/__tests__/mapFilters.test.ts`, as left by Step 2 (the last lines of the file), verbatim):
```ts
  it('names the window in local dates', () => {
    expect(presetSummary('7d', NOW)).toBe(
      `From ${new Date(2026, 9, 9).toLocaleDateString()} to ${new Date(2026, 9, 16, 23, 59, 59, 999).toLocaleDateString()}`,
    );
  });
});
```

AFTER:
```ts
  it('names the window in local dates', () => {
    expect(presetSummary('7d', NOW)).toBe(
      `From ${new Date(2026, 9, 9).toLocaleDateString()} to ${new Date(2026, 9, 16, 23, 59, 59, 999).toLocaleDateString()}`,
    );
  });
});

describe('heatIntensity', () => {
  it('uses the app scale: clamp(dB / 120)', () => {
    expect(heatIntensity(60)).toBe(0.5);
    expect(heatIntensity(120)).toBe(1);
    expect(heatIntensity(150)).toBe(1);
    expect(heatIntensity(-5)).toBe(0);
  });

  it('treats 0 dB as a real reading, not as a default (bug-7)', () => {
    expect(heatIntensity(0)).toBe(0);
  });

  it('returns null for anything that is not a finite number', () => {
    expect(heatIntensity(Number.NaN)).toBeNull();
    expect(heatIntensity(Infinity)).toBeNull();
    expect(heatIntensity('60')).toBeNull();
    expect(heatIntensity(undefined)).toBeNull();
  });
});

describe('buildHeatPoints', () => {
  it('keeps a 0 dB reading at intensity 0', () => {
    expect(buildHeatPoints([reading({ decibelLevel: 0 })])).toEqual([[6.9, 79.86, 0]]);
  });

  it('merges readings at one site into a single point with the mean intensity', () => {
    const points = buildHeatPoints([
      reading({ id: 'a', decibelLevel: 30 }),
      reading({ id: 'b', decibelLevel: 90 }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0][2]).toBeCloseTo(0.5, 6);
  });

  it('does not let repeat quiet recordings add up: 20 readings of 30 dB stay at 0.25', () => {
    const quiet = Array.from({ length: 20 }, (_, i) => reading({ id: `q${i}`, decibelLevel: 30 }));
    const points = buildHeatPoints(quiet);
    expect(points).toHaveLength(1);
    expect(points[0][2]).toBeCloseTo(0.25, 6);
  });

  it('keeps sites that differ at the 4th decimal apart', () => {
    const points = buildHeatPoints([
      reading({ id: 'a', latitude: 6.9 }),
      reading({ id: 'b', latitude: 6.9005 }),
    ]);
    expect(points).toHaveLength(2);
  });

  it('places a merged point at the mean position of its readings', () => {
    const points = buildHeatPoints([
      reading({ id: 'a', latitude: 6.90001 }),
      reading({ id: 'b', latitude: 6.90003 }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0][0]).toBeCloseTo(6.90002, 6);
  });

  it('skips readings without a position or a finite dB', () => {
    const points = buildHeatPoints([
      reading({ id: 'a', latitude: undefined }),
      reading({ id: 'b', decibelLevel: Number.NaN }),
      reading({ id: 'c', decibelLevel: 'x' }),
    ]);
    expect(points).toEqual([]);
  });
});
```

4c. `src/components/map/HeatmapLayer.tsx`: the whole file. Replace it with the AFTER text.

BEFORE (`src/components/map/HeatmapLayer.tsx`, lines 1-95, the whole file at HEAD, verbatim; at execution time 04.2l and 04.2m have already added the `getCoordinates` import and replaced the coordinate block, see the checklist below):
```tsx
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import type { NoiseReading } from '@/types/NoiseReading';

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
      // Extract coordinates (support flat structure)
      const read = reading as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      let lat: number | undefined;
      let lng: number | undefined;

      // Flat structure (latitude/longitude at root level)
      if (typeof read?.latitude === 'number' && typeof read?.longitude === 'number') {
        lat = read.latitude;
        lng = read.longitude;
      }
      // Nested structure (location.latitude/location.longitude)
      else if (reading.location) {
        const loc = reading.location as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
          lat = loc.latitude;
          lng = loc.longitude;
        }
      }
      // GeoJSON format (lat/lng at root level)
      else if (typeof read?.lat === 'number' && typeof read?.lng === 'number') {
        lat = read.lat;
        lng = read.lng;
      }
      // GeoJSON Point (coordinates array)
      else if (Array.isArray(read?.coordinates) && read.coordinates.length >= 2) {
        lng = read.coordinates[0];
        lat = read.coordinates[1];
      }

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
```

AFTER (the whole file):
```tsx
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
```

Already contained in the AFTER text: 04.2's coordinate handling. `getCoordinates` is now called inside `buildHeatPoints` (`mapFilters.ts`), so this file no longer imports `@/lib/readings` and has no nested-`location` or `lat`/`lng`/`coordinates` branches. Unchanged from HEAD: the `radius: 25`, `blur: 15`, `max: 1.0` and `pane: 'overlayPane'` options, and the add/remove lifecycle.

4d. New file: the legend.

New file `src/components/map/MapLegend.tsx` — full contents:

```tsx
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
```

Placement note: thresholds, labels and colours come from `noiseBands.ts` only (convention 2.11), so the legend follows any later colour change made there by 10.4. No dB band is labelled "Quiet": the bands are Low, Moderate and High, and `Quiet` is a sound category. The text uses `DB_CAVEAT` verbatim (07.3). The legend is bottom-left, above the badge, so it never covers the OpenStreetMap attribution at the bottom right.

4e. `src/pages/MapPage.tsx`: mount the legend. Both blocks are untouched HEAD text.

BEFORE (`src/pages/MapPage.tsx`, line 6, verbatim):
```tsx
import { HeatmapLayer } from '@/components/map/HeatmapLayer';
```

AFTER:
```tsx
import { HeatmapLayer } from '@/components/map/HeatmapLayer';
import { MapLegend } from '@/components/map/MapLegend';
```

BEFORE (`src/pages/MapPage.tsx`, line 140, verbatim):
```tsx
      {/* Map - Full Screen, No Scrollbars */}
```

AFTER:
```tsx
      {/* Legend: what the pin colours and the heat layer mean */}
      <MapLegend showHeatmap={showHeatmap} />

      {/* Map - Full Screen, No Scrollbars */}
```

**Edge cases to preserve**
- Colour semantics: below 50 dB reads green, 50-70 dB blends green to orange, 70 dB is orange, and 100 dB and up is red. The stops are `50/120` and `70/120`, computed from the shared constants, never typed as numbers here.
- The heat layer is still density-aware: `leaflet.heat` sums nearby sites, and the legend says so in words. Averaging per site removes only same-spot stacking, which is the case the finding showed.
- `maxZoom` goes from 17 to 12, and `minOpacity` from 0.4 to 0.35. At HEAD, `v = 1 / 2^(17 - zoom)` made every cell contribute about 1/1024 at the default zoom 7 (`HeatLayer.js` `_redraw`), so everything sat on the opacity floor and looked uniformly pale. These two numbers are tuning constants; adjust them after looking at the map and record the final values in the commit body.
- `heatIntensity(0)` is 0, never 0.5. A missing or non-numeric dB never reaches the canvas.
- With the heatmap off, no `L.heatLayer` is created (`!visible` returns before building).
- Convention 2.12: the legend renders constants only; no reading field reaches it.

**Acceptance criteria**
- `grep -n "reading.decibelLevel ?\|: 0.5\|- 30) / 70\|0.35:\|0.65:" src/components/map/HeatmapLayer.tsx` prints nothing.
- `grep -n "Quiet" src/components/map/MapLegend.tsx src/components/map/HeatmapLayer.tsx` prints nothing (no dB band is called Quiet; Step 5 removes the last stale `Quiet` comment in `NoiseMarkers.tsx`).
- Manual (`/map`, heatmap on): the legend lists Low below 50 dB, Moderate 50-70 dB, High above 70 dB with the same colours as the pins, plus the heatmap note and the caveat sentence. Toggling the heatmap off removes the heatmap note. The legend does not overlap the badge or the OpenStreetMap attribution.
- Manual: zoomed to a quiet neighbourhood with many repeat recordings at one spot, the heat is green, not red. At the default zoom 7 the heatmap shows hot spots where readings concentrate, and is no longer one uniform pale wash.
- `npx vitest run src/lib/__tests__/mapFilters.test.ts` passes.

**Verify**
```
npx tsc -b
npx eslint src/lib/mapFilters.ts src/lib/__tests__/mapFilters.test.ts src/components/map/HeatmapLayer.tsx src/components/map/MapLegend.tsx src/pages/MapPage.tsx
npx vitest run src/lib/__tests__/mapFilters.test.ts
```

**Commit title:** `fix(heatmap): app-aligned dB intensity, correct 0 dB handling and a map legend (bug-7)`

---

### Step 5 — perf-3: icon cache and memoized markers

**Goal:** The three marker pins are built once, at module load, keyed by noise band, instead of one `Icon` plus a base64 SVG per marker per render. The marker element list is memoized on the `readings` array, so a parent re-render (a keystroke in the search box, a heatmap toggle, the filter panel opening) returns the same elements and React skips every `Marker` and `Popup`. The inline `getMarkerColor` copy of the band thresholds goes in favour of the shared band module.

**Files:**
- `src/components/map/NoiseMarkers.tsx`

**Exact changes**

Prerequisite: Steps 1 and 3 are committed. Every block anchors on their AFTER text (Step 1's file with Step 3's edits). `MapPage.tsx` needs no change: after Step 1 it builds no `filters` object, and `filteredReadings` is already a memoized, referentially stable array.

5a. Imports.

BEFORE (`src/components/map/NoiseMarkers.tsx`, as left by Step 3, verbatim):
```tsx
import { Marker, Popup } from 'react-leaflet';
```

AFTER:
```tsx
import { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
```

BEFORE (`src/components/map/NoiseMarkers.tsx`, as left by Step 3, verbatim):
```tsx
import { getCoordinates, getReadingDate } from '@/lib/readings';
```

AFTER:
```tsx
import { getCoordinates, getReadingDate } from '@/lib/readings';
import { NOISE_BANDS, noiseBand } from '@/lib/noiseBands';
```

Placement note: single-line anchors; 04.2g put the `readings` import in this position and 05.3e did not touch it.

5b. The band-colour copy becomes a cached icon per band.

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 31-36, verbatim):
```tsx
// Get marker color by dB level
function getMarkerColor(decibelLevel: number): string {
  if (decibelLevel < 50) return '#4CAF50'; // Green - Quiet
  if (decibelLevel <= 70) return '#FF9800'; // Orange - Moderate
  return '#F44336'; // Red - Loud
}
```

AFTER:
```tsx
// One pin per noise band, built once at module load (perf-3). Before this every
// marker allocated its own Icon plus a base64 SVG on every render, and
// react-leaflet called setIcon on every marker because each Icon was a new
// object. Colours come from the shared band module (convention 2.11).
const BAND_ICONS = {
  low: createMarkerIcon(NOISE_BANDS.low.color),
  moderate: createMarkerIcon(NOISE_BANDS.moderate.color),
  high: createMarkerIcon(NOISE_BANDS.high.color),
};
```

Placement note: this block is untouched HEAD text; clusters 04-06 never edit it. `createMarkerIcon` above it is unchanged, and cluster 10.4 may later change its SVG (pin shape or glyph) without touching the cache. The icons are created when the module loads, so a colour changed in `noiseBands.ts` is picked up on the next reload.

5c. The component body: a memoized marker list built from the cached icons.

BEFORE (`src/components/map/NoiseMarkers.tsx`, as left by Step 3 (the component, to the end of the file), verbatim):
```tsx
export function NoiseMarkers({ readings }: NoiseMarkersProps) {
  // Nothing to draw: MapPage explains why (ux-2). No marker is ever invented.
  if (readings.length === 0) {
    return null;
  }

  return (
    <>
      {readings.map((reading) => {
        // Coordinates and date through the shared helpers (bug-1)
        const coords = getCoordinates(reading);
        if (!coords) {
          return null;
        }
        const { lat, lng } = coords;
        const readingDate = getReadingDate(reading);

        // Category text: the stored soundClass, or 'Unclassified' when absent
        const category = categoryLabel(reading);

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
          </Marker>
        );
      })}
    </>
  );
}
```

AFTER:
```tsx
export function NoiseMarkers({ readings }: NoiseMarkersProps) {
  // The marker elements depend only on `readings`. A parent re-render (typing in the
  // search box, toggling the heatmap or the filter panel) returns the very same
  // element array, so React skips every Marker and Popup (perf-3).
  const markers = useMemo(
    () =>
      readings.map((reading) => {
        // Coordinates and date through the shared helpers (bug-1)
        const coords = getCoordinates(reading);
        if (!coords) {
          return null;
        }
        const { lat, lng } = coords;
        const readingDate = getReadingDate(reading);

        // Category text: the stored soundClass, or 'Unclassified' when absent
        const category = categoryLabel(reading);

        // The cached pin for this reading's noise band (BAND_ICONS), never a new Icon
        const band = noiseBand(reading.decibelLevel);

        return (
          <Marker
            key={reading.id}
            position={[lat, lng] as LatLngExpression}
            icon={BAND_ICONS[band.id]}
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
          </Marker>
        );
      }),
    [readings],
  );

  // Nothing to draw: MapPage explains why (ux-2). No marker is ever invented.
  if (readings.length === 0) {
    return null;
  }

  return <>{markers}</>;
}
```

**Edge cases to preserve**
- Hook order: `useMemo` runs before the early `return null`, so the hook count never changes between renders.
- The marker `key` is still `reading.id`. The popup JSX is byte-identical to Step 1 apart from the badge colour, which is now `band.color`.
- Every 04, 05 and 06 behaviour stays: popup date from `getReadingDate`, category from `categoryLabel`, confidence from `confidenceLabel`, coordinates from `getCoordinates`.
- Pin colours and the 50 / 70 dB boundaries are exactly those of HEAD (`noiseBands.ts` holds the same values). Cluster 10.4 may change band colours there only.
- The Overview mini-map benefits too: its `readings` prop is the provider array, whose identity changes only when the provider replaces it.
- Step 6 replaces the per-reading `<Marker>` tree. If D5 says to skip Step 6, this step stands on its own.

**Acceptance criteria**
- `grep -n "getMarkerColor\|Quiet" src/components/map/NoiseMarkers.tsx` prints nothing.
- `grep -n "new Icon\|btoa" src/components/map/NoiseMarkers.tsx` prints only the two lines inside `createMarkerIcon`.
- Manual (React DevTools Profiler, 'Highlight updates when components render' on, `/map`): type in the Search box. `NoiseMarkers`'s markers and the map layers do not re-render; only the top bar does. Toggle the heatmap: markers do not re-render.
- Manual: pins look and click exactly as before; popups show the same fields; the badge colour in each popup matches its pin.

**Verify**
```
npx tsc -b
npx eslint src/components/map/NoiseMarkers.tsx
```

**Commit title:** `perf(map): cache marker icons per band and memoize the marker list (perf-3)`

---

### Step 6 — perf-4: bulk cluster add (MERGE, D5 measure-first)

**This is the most dangerous MERGE in the playbook (master §4.6). Apply it to the file as it is after Step 5, never as a verbatim replacement of an older copy.**

**Goal:** Markers are created in plain Leaflet and bulk-added to the cluster group (`addLayers`) in chunks, instead of mounting one React `<Marker>` per reading, so a filter change or a late mount costs a few bulk calls, not thousands of `addLayer` / `removeLayer` calls. Popups are NOT built from HTML strings: one React-rendered `<Popup>` shows the selected reading (convention 2.12). `MarkerClusterGroup` gets sensible defaults, so the Overview mini-map is tuned without passing options.

**Step 6 pre-check — D5: measure first (not a commit).**

Do this before changing any file. The finding (perf-4, confidence medium) is only partly true, so measure.

- What is true: when markers mount AFTER the cluster group is already on the map (a cold load, because `NoiseMarkers` renders nothing until the provider has loaded; and every filter change, because React then mounts or unmounts excluded markers one by one), each marker costs one `addLayer` or `removeLayer` with its own bounds and icon refresh (`leaflet.markercluster-src.js` `addLayer`, about line 97).
- What is not: when `MapPage` mounts with the readings already loaded (navigating from `/dashboard` with a warm provider), React runs the markers' effects before the cluster group's own effect adds it to the map, so the markers queue in `_needsClustering` and `onAdd` adds them through the bulk `addLayers` path, where `chunkedLoading` does apply.

Procedure (Chrome, `npm run dev` or `npm run preview`, signed in as the admin, `/map`, All Users):
1. DevTools, Performance panel. Record a hard reload of `/map` (cold) and stop when the markers have appeared. Note the longest single task after the readings arrive.
2. Record again while switching Date Range between 'All time' and 'Last 7 days' twice. Note the longest task for each switch.
3. **If every longest task is under 300 ms: SKIP this step.** Make no commit, and append this bullet to the end of the "Parked engineering work" list in §7 ("After the playbook") of `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md`, with the real numbers:

```
- perf-4 / D5: not applied. Measured <YYYY-MM-DD> on <hardware>: marker commit burst <N> ms cold and <M> ms on a date-filter change, both under the 300 ms limit. Step 09.6 skipped; 09.5 stands alone.
```

4. If any task is 300 ms or longer, apply the changes below, and put the before and after numbers in the commit body.

**Files:**
- `src/components/map/NoiseMarkers.tsx` (MERGE onto Step 5)
- `src/components/map/MarkerClusterGroup.tsx`
- `src/pages/MapPage.tsx`

**Exact changes**

Prerequisite: Steps 1-5 are committed and the D5 measurement says to proceed. The `NoiseMarkers.tsx` blocks anchor on Step 5's AFTER text. The `MarkerClusterGroup.tsx` and `MapPage.tsx` blocks are untouched HEAD text.

6a. `src/components/map/NoiseMarkers.tsx`: imports. They drop `Marker` and `LatLngExpression` and add the hooks, the Leaflet context and the `L` namespace.

BEFORE (`src/components/map/NoiseMarkers.tsx`, as left by Step 5, verbatim):
```tsx
import { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Icon } from 'leaflet';
```

AFTER:
```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Popup } from 'react-leaflet';
import { useLeafletContext } from '@react-leaflet/core';
import L, { Icon } from 'leaflet';
```

6b. Same file: the component. The per-reading `<Marker>` tree, with its popups, is replaced by the imperative bulk add plus one React popup. The popup JSX is the SAME markup Step 5 left (header, noise level, category, type, confidence and timestamp), moved into `ReadingPopup` and dedented. The MERGE checklist is below the block.

BEFORE (`src/components/map/NoiseMarkers.tsx`, as left by Step 5 (from the component doc comment to the end of the file), verbatim):
```tsx
/**
 * NoiseMarkers - Displays already-filtered noise readings as markers on the map
 *
 * Purely presentational: it loads nothing, filters nothing, logs nothing and
 * reports nothing to its parent.
 * - Color-coded by dB level
 * - A popup per marker
 * - An empty list renders nothing: MapPage shows the filter-aware empty overlay (ux-2)
 */
export function NoiseMarkers({ readings }: NoiseMarkersProps) {
  // The marker elements depend only on `readings`. A parent re-render (typing in the
  // search box, toggling the heatmap or the filter panel) returns the very same
  // element array, so React skips every Marker and Popup (perf-3).
  const markers = useMemo(
    () =>
      readings.map((reading) => {
        // Coordinates and date through the shared helpers (bug-1)
        const coords = getCoordinates(reading);
        if (!coords) {
          return null;
        }
        const { lat, lng } = coords;
        const readingDate = getReadingDate(reading);

        // Category text: the stored soundClass, or 'Unclassified' when absent
        const category = categoryLabel(reading);

        // The cached pin for this reading's noise band (BAND_ICONS), never a new Icon
        const band = noiseBand(reading.decibelLevel);

        return (
          <Marker
            key={reading.id}
            position={[lat, lng] as LatLngExpression}
            icon={BAND_ICONS[band.id]}
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
          </Marker>
        );
      }),
    [readings],
  );

  // Nothing to draw: MapPage explains why (ux-2). No marker is ever invented.
  if (readings.length === 0) {
    return null;
  }

  return <>{markers}</>;
}
```

AFTER:
```tsx
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
```

MERGE checklist (verify each in the AFTER text and in the final file; none may regress, master §4.6):
- 04: the popup timestamp is `readingDate ? format(readingDate, …) : 'No timestamp'` with `readingDate = getReadingDate(reading)`; coordinates come from `getCoordinates`; no `console.warn` of a reading.
- 05: `NoiseMarkers` loads nothing; it renders the `readings` prop and never calls `useSyncedReadings` or any parent callback.
- 06: the popup category is `categoryLabel(reading)` (so `Quiet` and `Unclassified` read correctly) and the confidence is `confidenceLabel(reading, 1)`.
- 09.1: no filtering and no loading state in this file. 09.3: an empty list renders `null`. 09.5: pins come from `BAND_ICONS`, and the popup badge colour from `noiseBand(...)`.
- Security (convention 2.12): reading fields (`locationName`, `soundClass`, …) reach the DOM only through JSX inside `ReadingPopup`. There is no `bindPopup`, no `innerHTML`, and no `L.divIcon({ html })`. The cluster-count icon is markercluster's default, which interpolates only the numeric count.
- Cluster 10.4 (pin appearance) later edits `createMarkerIcon` only; the `BAND_ICONS` cache and the `readings` effect are its stable seams.

6c. `src/components/map/MarkerClusterGroup.tsx`: sensible defaults for every map, and `chunkedLoading` pinned off.

BEFORE (`src/components/map/MarkerClusterGroup.tsx`, lines 12-15, verbatim):
```tsx
function createCluster(props: MarkerClusterGroupProps, context: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { options } = props;
  const cluster = L.markerClusterGroup(options);
  return {
```

AFTER:
```tsx
// Defaults for every map that clusters noise readings, so a page that passes no
// options (the Overview mini-map) is still tuned. MapPage passes its overrides.
const DEFAULT_OPTIONS: L.MarkerClusterGroupOptions = {
  maxClusterRadius: 40,
  disableClusteringAtZoom: 15,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: true,
  animate: false,
  animateAddingMarkers: false,
  removeOutsideVisibleBounds: true,
};

function createCluster(props: MarkerClusterGroupProps, context: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { options } = props;
  // chunkedLoading is forced OFF: markercluster's own chunk loop cannot be
  // cancelled, so replacing the markers mid-load would re-add stale ones or throw
  // on a removed group. NoiseMarkers chunks its own bulk adds and can cancel them.
  const cluster = L.markerClusterGroup({ ...DEFAULT_OPTIONS, ...options, chunkedLoading: false });
  return {
```

Placement note: the `return { instance: cluster, context: extendContext(…) };` lines and `updateCluster` below are unchanged. The Overview mini-map previously used markercluster's stock options (radius 80, animation on, coverage polygons on); it now gets the same tuned defaults as `/map`.

6d. `src/pages/MapPage.tsx`: drop the chunk options, which are now dead and misleading. The block is untouched HEAD text.

BEFORE (`src/pages/MapPage.tsx`, lines 168-171, verbatim):
```tsx
              removeOutsideVisibleBounds: true,
              chunkedLoading: true,
              chunkInterval: 100,  // Faster chunks (was 200ms)
              chunkDelay: 0,  // No delay between chunks (was 50ms)
```

AFTER:
```tsx
              removeOutsideVisibleBounds: true,
```

Placement note: the options object keeps its other keys (`maxClusterRadius`, `disableClusteringAtZoom`, `spiderfyOnMaxZoom`, `showCoverageOnHover`, `spiderfyDistanceMultiplier`, `zoomToBoundsOnClick`, `animate`, `animateAddingMarkers`), which override the new defaults.

**Edge cases to preserve**
- Cancellation: the effect cleanup clears the pending chunk timer and then `cluster.clearLayers()`. A filter change, a Sync or an unmount mid-load therefore leaves no stale marker, and React StrictMode's mount-unmount-mount in dev is idempotent.
- The popup follows the reading by id. A Sync that replaces the `readings` array keeps an open popup open (its `position` memo depends on the numeric lat/lng, so react-leaflet does not close and re-open it), and a filter that removes the reading closes it.
- Keyed remount: `ReadingPopup` is keyed by the reading id, so switching from one marker to another unmounts the old popup before the new one opens. The `remove` handler is detached before the popup is removed on unmount (`useEventHandlers` runs before the lifecycle effect), so switching markers does not clear the new selection. The `closeSelected` guard compares ids as a second line of defence.
- The first chunk is added synchronously in the effect. On a warm mount the cluster group has no map yet, so `addLayers` only queues the markers (`_needsClustering`), and the group's `onAdd` processes them in one pass.
- Markers are keyboard-focusable (Leaflet's default `keyboard: true`), and Enter fires `click`, which opens the popup, as before.
- The Overview mini-map keeps `<MarkerClusterGroup><NoiseMarkers readings={readings} /></MarkerClusterGroup>` unchanged; it gains the defaults from 6c.
- If `NoiseMarkers` is ever rendered outside a `MarkerClusterGroup`, `isMarkerCluster` is false and it renders no markers (it never throws).

**Acceptance criteria**
- `grep -rnE "bindPopup|bindTooltip|innerHTML|insertAdjacentHTML|divIcon" src/components/map src/pages` prints nothing.
- `grep -rn "chunkedLoading\|chunkInterval\|chunkDelay" src/pages` prints nothing; `MarkerClusterGroup.tsx` mentions `chunkedLoading: false` once.
- Manual (`/map`, All Users): the badge count equals the number of individual pins reachable at maximum zoom; clicking a pin opens ONE popup with the right location, dB, category, type, confidence and date; clicking another pin moves the popup; the X button and a map click close it, and clicking the same pin again re-opens it.
- Manual: toggle Date Range 'All time' / 'Last 7 days' three times within a second. The final marker set matches the final badge, the console shows no `TypeError`, and no marker from an earlier set reappears.
- Manual: with a popup open, press Sync. The popup stays open.
- Manual (Performance panel, same procedure as the pre-check): the longest task for the cold load and for each date switch is below 300 ms. Record the before and after numbers in the commit body.
- `npm test` passes (full suite) and `npm run build` succeeds (about 7.5 minutes; run it alone).

**Verify**
```
npx tsc -b
npx eslint src/components/map/NoiseMarkers.tsx src/components/map/MarkerClusterGroup.tsx src/pages/MapPage.tsx
npm test
npm run build
```

If this step was skipped per D5, run `npm test` and `npm run build` once at the end of Step 5 instead (master §1.3).

**Commit title:** `perf(map): bulk-add markers to the cluster group in cancellable chunks (perf-4)`

Deviation from the cluster definition: the definition and master §5 row #36 say "…so chunkedLoading applies". That wording cannot be honoured safely. markercluster's `chunkedLoading` loop is a `setTimeout` chain that cannot be cancelled, and `_addLayer` dereferences `this._map` (`leaflet.markercluster-src.js:206-300`, `:993-996`), so replacing the markers mid-load either re-adds stale ones (same group) or throws a `TypeError` (removed group). This step therefore chunks the bulk `addLayers` calls itself and pins `chunkedLoading: false`. Update master §5 row #36 to this title when this step is applied.

---

## Risks & rollback

- **Whole-file replacements (Steps 1, 2, 4).** `NoiseMarkers.tsx` and `HeatmapLayer.tsx` have been edited by clusters 04-06 before this cluster runs. The "already contained" checklists exist so nothing from those clusters is lost. If the current file holds something the checklist does not list, merge it into the AFTER text; do not discard it.
- **Behaviour change in Step 1:** an empty `userId` with the user filter on now shows nothing instead of everything. Unreachable for a signed-in user.
- **Step 2 uses browser-local days.** Asia/Colombo-explicit bucketing is bug-12 (master §7). A window computed at filter time can go stale if a tab stays open across midnight with no sync; the hourly provider sync refreshes it.
- **Step 3 depends on D1.** Under D1(A) the default flips to all readings. Under D1(B) skip 3a; the overlay still fixes the false message. Neither choice changes what any account may read (the rules allow any signed-in read, master §7).
- **Step 4 tuning is unverified visually.** The intensity maths, the band-aligned stops and the per-site averaging are covered by tests. The constants `maxZoom: 12`, `minOpacity: 0.35` and the 4-decimal site key are judgment calls grounded in the plugin source, and need a look at the real map. `leaflet.heat` remains additive between neighbouring sites, so a hot spot can still mean many readings; the legend says so.
- **Step 5** creates three `Icon` objects at import time. `btoa` is available in every supported browser and in the Node versions vitest uses, and no test imports this file.
- **Step 6 is the riskiest.** It changes how markers reach the map and how popups open. It is gated by D5 and can be skipped. Revert it alone (`git revert <step 6>`); Step 5 stays valid. Known limit: markers are added in slices of 500 one macrotask apart, so on a very slow device the last slice appears a moment after the first. That is the intended trade for never blocking the main thread.
- **Rollback.** Every step is one commit with no data, rules or app change. `git revert` the newest step first (later BEFORE anchors build on earlier AFTER text). Steps 1 and 2 share `MapPage.tsx` and `mapFilters.ts`; revert 2 before 1.

## Out of scope

- **ux-6:** the dead Search box (it only re-renders `MapPage`, now harmlessly after Step 5), the "Current location" button, and the "More filters coming soon" placeholders. No dB or category filter UI is added; the `dbRange` and `categories` options in `filterReadings` are ready for it.
- **Cluster 10:** accessibility and layout. Band glyphs and AA colours on pins (10.4), map control names and the filter-panel dialog (10.5), map sizing so the OSM attribution stays visible (10.6), phone wrapping (10.7). This cluster adds the legend at bottom-left precisely so those do not collide.
- **Cluster 11:** lazy-loading Leaflet, markercluster and leaflet.heat, and moving `leaflet.css`.
- **bug-12:** Asia/Colombo day boundaries. **ux-13:** markers outside the `maxBounds` of Sri Lanka are counted but unreachable.
- **Replacing leaflet.heat** with a per-point canvas layer like the app's `HeatmapPainter`. That would give true loudness semantics at every zoom; it is a larger change than a Medium finding warrants.
- **The provider and sync code** (cluster 05), the category taxonomy and band module (06), and `DB_CAVEAT` itself (07). This cluster only consumes them.
- **Firestore queries, indexes and rules.** None are touched or needed.
