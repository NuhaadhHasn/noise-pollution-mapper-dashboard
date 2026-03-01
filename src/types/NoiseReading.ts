import { Timestamp } from 'firebase/firestore';

export interface NoiseReading {
  id: string;
  userId: string;
  decibelLevel: number;
  location: {
    latitude: number;
    longitude: number;
  } | {
    lat: number;
    lng: number;
  } | {
    coordinates: [number, number]; // [lng, lat]
  };
  locationName?: string;
  soundCategory: string;
  soundType?: 'Pollution' | 'Ambient' | 'Both' | 'Unknown';
  confidence: number;
  timestamp: Timestamp;
  createdAt?: Timestamp;
}
