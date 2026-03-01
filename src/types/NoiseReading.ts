import { Timestamp } from 'firebase/firestore';

export interface NoiseReading {
  id: string;
  userId: string;
  decibelLevel: number;
  // Support both flat structure (mobile app) and nested structure
  latitude?: number;
  longitude?: number;
  location?: {
    latitude: number;
    longitude: number;
  } | {
    lat: number;
    lng: number;
  } | {
    coordinates: [number, number]; // [lng, lat]
  };
  locationName?: string;
  soundCategory?: string;
  soundClass?: string;  // Mobile app uses soundClass
  soundType?: 'Pollution' | 'Ambient' | 'Both' | 'Unknown';
  confidence: number;
  timestamp: Timestamp;
  createdAt?: Timestamp;
}
