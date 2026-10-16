import type { NoiseReading } from '@/types/NoiseReading';
import type { UserInfo } from '@/services/userService';
import { format } from 'date-fns';
import { getCoordinates, getReadingDate } from '@/lib/readings';

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
      `"${reading.soundCategory || reading.soundClass || 'Unknown'}"`,
      `"${reading.soundType || 'Unknown'}"`,
      ((reading.confidence || 0) * 100).toFixed(2),
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
        soundCategory: reading.soundCategory || reading.soundClass || 'Unknown',
        soundType: reading.soundType || 'Unknown',
        confidence: reading.confidence || 0
      },
      userId: reading.userId || 'Unknown'
    }))
  };

  // Pretty-print JSON
  const jsonContent = JSON.stringify(exportData, null, 2);

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
