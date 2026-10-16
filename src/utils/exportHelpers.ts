import type { NoiseReading } from '@/types/NoiseReading';
import { format } from 'date-fns';
import { authorLabel } from '@/lib/authorLabel';
import { categoryLabel, confidenceOf, confidencePercent } from '@/lib/categories';
import { getCoordinates, getReadingDate } from '@/lib/readings';
import { DB_CAVEAT, noiseBand } from '@/lib/noiseBands';

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
export function buildCsv(data: NoiseReading[]): string {
  // CSV Header
  const headers = [
    'Timestamp',
    'Location',
    'Latitude',
    'Longitude',
    'Noise Level (dB, uncalibrated estimate)',
    'Category',
    'Type',
    'Confidence (%)',
    'Contributor'
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
      csvCell(authorLabel(reading.userEmail))
    ].join(',');
  });

  return [headers.map((header) => csvCell(header)).join(','), ...rows].join('\n');
}

/**
 * Export noise readings to CSV format (Excel-compatible)
 */
export function exportToCSV(data: NoiseReading[], filename: string = 'noise_readings') {
  if (!data || data.length === 0) {
    console.warn('[exportToCSV] No data to export');
    return;
  }

  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const csvWithBOM = BOM + buildCsv(data);

  // Download file
  downloadFile(csvWithBOM, `${filename}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`, 'text/csv;charset=utf-8;');
}

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
      version: '2.6.0',
      note: DB_CAVEAT
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
      contributor: authorLabel(reading.userEmail),
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

/**
 * Helper: Format a reading's date for export ('Unknown' when it has none)
 */
function formatExportTimestamp(reading: NoiseReading): string {
  const date = getReadingDate(reading);
  return date ? format(date, 'yyyy-MM-dd HH:mm:ss') : 'Unknown';
}

/**
 * Helper: Extract coordinates through the shared getCoordinates helper
 */
function extractCoordinates(reading: NoiseReading): { latitude: number; longitude: number } | null {
  const coords = getCoordinates(reading);
  return coords ? { latitude: coords.lat, longitude: coords.lng } : null;
}

/**
 * Helper: Trigger browser download
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.log(`[downloadFile] Downloaded: ${filename}`);
}
