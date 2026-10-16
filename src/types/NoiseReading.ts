/**
 * A noise reading as the dashboard stores it in IndexedDB and holds in
 * memory. This is NOT the raw Firestore document: every doc passes through
 * normalizeReading() (src/lib/readings.ts) first. Firestore Timestamps
 * become epoch milliseconds, malformed docs are dropped, and only these keys
 * are kept (no deviceInfo, no unknown keys).
 */
export interface NoiseReading {
  id: string;
  userId: string;
  userEmail?: string;          // masked author label the app writes (sec-2); 07 displays it
  decibelLevel: number;        // finite; normalizeReading drops docs otherwise
  latitude: number;            // finite, -90..90; dropped otherwise
  longitude: number;           // finite, -180..180; dropped otherwise
  locationName?: string;
  soundCategory?: string;      // never written by any app version; kept ONLY until 06.3 removes it
  soundClass?: string;         // raw app value; absent = unclassified
  soundType?: 'Pollution' | 'Ambient';
  confidence?: number;         // absent when unclassified
  timestamp: number | null;    // epoch ms (server clock)
  createdAt?: number | null;   // epoch ms (client clock; on 17.8% of docs)
}
