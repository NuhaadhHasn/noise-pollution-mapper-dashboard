/**
 * Shared helpers for reading fields (cluster 04).
 *
 * Every date and coordinate read in the dashboard goes through this module.
 * Rows come back from IndexedDB as structured clones. A clone keeps a
 * Firestore Timestamp's own fields ({ seconds, nanoseconds }) but drops its
 * prototype, so `.toDate()` is gone after the round-trip (bug-1). From 04.3
 * on, the sync stores epoch-ms numbers instead; these helpers read every
 * shape either way.
 *
 * Nothing outside this file may call `.toDate()` or read `.seconds` on a
 * reading field (master playbook convention 2.10).
 *
 * Pure module: no Firebase import, so it is safe to unit-test (convention
 * 2.15).
 */

import type { NoiseReading } from '@/types/NoiseReading';

/** Largest |epoch ms| a JavaScript Date can hold; beyond it, Invalid Date. */
const MAX_DATE_MS = 8.64e15;

export interface LatLng {
  lat: number;
  lng: number;
}

/** The coordinate fields a reading (or a raw Firestore doc) may carry. */
export interface CoordinateFields {
  latitude?: unknown;
  longitude?: unknown;
}

/** The date fields a reading may carry. */
export interface DateFields {
  timestamp?: unknown;
  createdAt?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validMillis(ms: unknown): number | null {
  return isFiniteNumber(ms) && Math.abs(ms) <= MAX_DATE_MS ? ms : null;
}

function validLatLng(lat: unknown, lng: unknown): LatLng | null {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return null;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { lat, lng };
}

/**
 * Epoch milliseconds for any timestamp shape a reading field can hold, or
 * null when the value is missing or unparseable:
 * - a number (epoch ms; the stored shape from 04.3 on),
 * - an ISO-8601 string,
 * - a Date,
 * - a Firestore Timestamp, live or structured-cloned ({ seconds, nanoseconds }),
 * - any other object with toMillis() or toDate().
 * Never returns a value that would make an Invalid Date.
 */
export function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return validMillis(value);
  }
  if (typeof value === 'string') {
    return value.trim() === '' ? null : validMillis(Date.parse(value));
  }
  if (value instanceof Date) {
    return validMillis(value.getTime());
  }
  if (typeof value === 'object') {
    const ts = value as {
      seconds?: unknown;
      nanoseconds?: unknown;
      toMillis?: unknown;
      toDate?: unknown;
    };
    if (isFiniteNumber(ts.seconds)) {
      const nanos = isFiniteNumber(ts.nanoseconds) ? ts.nanoseconds : 0;
      return validMillis(ts.seconds * 1000 + Math.floor(nanos / 1e6));
    }
    if (typeof ts.toMillis === 'function') {
      return validMillis(ts.toMillis());
    }
    if (typeof ts.toDate === 'function') {
      const date: unknown = ts.toDate();
      return date instanceof Date ? validMillis(date.getTime()) : null;
    }
  }
  return null;
}

/** A Date for any timestamp shape (see toMillis), or null. Never an Invalid Date. */
export function toDate(value: unknown): Date | null {
  const ms = toMillis(value);
  return ms === null ? null : new Date(ms);
}

/**
 * The date a reading is shown, sorted and filtered by: the server
 * `timestamp`, falling back to the client-clock `createdAt` only when
 * `timestamp` is missing or unparseable (bug-8). Every production doc has a
 * `timestamp`; `createdAt` is on only 17.8% of them.
 */
export function getReadingDate(reading: DateFields): Date | null {
  return toDate(reading.timestamp) ?? toDate(reading.createdAt);
}

/**
 * A reading's coordinates as finite, in-range numbers, or null when it has
 * none. Only the flat `latitude`/`longitude` fields the app writes count:
 * all 3,374 production docs are flat, and the nested `location` shape (never
 * written by any app version) left NoiseReading in 04.3.
 */
export function getCoordinates(reading: CoordinateFields): LatLng | null {
  return validLatLng(reading.latitude, reading.longitude);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

/**
 * Map one raw Firestore document onto the plain NoiseReading DTO that the
 * dashboard stores in IndexedDB and renders (bug-1, sec-1).
 *
 * Returns null, so the doc is never cached or rendered, for a doc no app
 * version writes:
 * - `userId` is not a string;
 * - `decibelLevel` is not a finite number;
 * - `latitude`/`longitude` are not finite, in-range numbers;
 * - `soundClass`, `locationName` or `userEmail` is present but not a string
 *   (null counts as absent: the app's offline path can write a null
 *   `userEmail`).
 *
 * Otherwise `timestamp`, `createdAt` and `syncedAt` become epoch ms
 * (`timestamp` is null when unparseable; `createdAt` and `syncedAt` are
 * omitted), and only keys declared on NoiseReading are copied. `syncedAt` is
 * the server upload time current app builds stamp (data-1): the delta sync's
 * second cursor, absent on docs from older builds. `soundType` survives only as 'Pollution' or
 * 'Ambient', `confidence` only as a finite number. `deviceInfo` and any
 * unknown key are dropped. `soundCategory` is never copied: no app version
 * writes it.
 */
export function normalizeReading(id: string, data: Record<string, unknown>): NoiseReading | null {
  const { userId, decibelLevel, locationName, soundClass, soundType, confidence, userEmail } = data;

  if (typeof userId !== 'string' || !isFiniteNumber(decibelLevel)) {
    return null;
  }
  const coords = getCoordinates(data);
  if (!coords) {
    return null;
  }
  if (!isOptionalString(soundClass) || !isOptionalString(locationName) || !isOptionalString(userEmail)) {
    return null;
  }

  const reading: NoiseReading = {
    id,
    userId,
    decibelLevel,
    latitude: coords.lat,
    longitude: coords.lng,
    timestamp: toMillis(data.timestamp),
  };

  const createdAt = toMillis(data.createdAt);
  if (createdAt !== null) {
    reading.createdAt = createdAt;
  }
  const syncedAt = toMillis(data.syncedAt);
  if (syncedAt !== null) {
    reading.syncedAt = syncedAt;
  }
  if (typeof locationName === 'string') {
    reading.locationName = locationName;
  }
  if (typeof soundClass === 'string') {
    reading.soundClass = soundClass;
  }
  if (soundType === 'Pollution' || soundType === 'Ambient') {
    reading.soundType = soundType;
  }
  if (isFiniteNumber(confidence)) {
    reading.confidence = confidence;
  }
  if (typeof userEmail === 'string') {
    reading.userEmail = userEmail;
  }
  return reading;
}
