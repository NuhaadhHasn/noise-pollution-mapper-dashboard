/**
 * Firebase Configuration
 * Project: Urban Noise Pollution Mapper Dashboard
 * Firebase Project ID: noise-pollution-mapper-9ad3d
 * Region: asia-south1 (Mumbai)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore'; // Changed from 'firebase/firestore/lite' to support onSnapshot

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth: any = getAuth(app);
export const db: any = getFirestore(app);

// Export the app for use in other modules
export default app;
