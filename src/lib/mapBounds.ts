/**
 * The area the map is locked to (Leaflet maxBounds). One definition, shared by
 * the map container, the "Current location" button and the out-of-bounds count
 * (ux-6, ux-13). Pure: no Leaflet import, so it is unit-tested directly.
 */

/** [south-west, north-east] corners as [lat, lng]. */
export const SRI_LANKA_BOUNDS: [[number, number], [number, number]] = [
  [5.9, 79.5], // South-west corner
  [9.9, 82.0], // North-east corner
];

export const SRI_LANKA_CENTER: [number, number] = [7.8731, 80.7718];

/** True when the position lies inside the Sri Lanka map area (edges included). */
export function isWithinBounds(lat: number, lng: number): boolean {
  const [[south, west], [north, east]] = SRI_LANKA_BOUNDS;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}
