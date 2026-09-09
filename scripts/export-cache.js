/**
 * Export All Noise Readings to Cache File
 * 
 * This script exports ALL noise readings from Firestore
 * and saves them to a JSON file for caching in Firebase Storage.
 * 
 * Usage:
 *   node scripts/export-cache.js
 * 
 * Output:
 *   cache/noise-readings-master-cache.json
 */

import admin from 'firebase-admin';
import fs from 'fs';

// PRIVACY (audit sec-2): never export a raw userEmail. Mirrors
// FirebaseService.authorLabel() for addresses; a value with no '@' is
// already a display name and is passed through unchanged. Stored values were
// backfilled to masked form on 2026-09-09, so this is normally a no-op; it
// stays as defence in depth for offline-queue entries written by a
// pre-masking build of the app.
function maskAuthor(value) {
  if (typeof value !== 'string' || !value.includes('@')) {
    return typeof value === 'string' && value.length > 0 ? value : 'Anonymous';
  }
  const parts = value.split('@');
  const local = parts[0];
  const prefix = local.length > 3 ? local.slice(0, 3) : local;
  return prefix + '***@' + parts.slice(1).join('@');
}

import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin SDK
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

// Check if service account key exists
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: serviceAccountKey.json not found!');
  console.error('');
  console.error('To get your service account key:');
  console.error('1. Go to Firebase Console → Project Settings → Service Accounts');
  console.error('2. Click "Generate New Private Key"');
  console.error('3. Save the JSON file as "serviceAccountKey.json" in the project root');
  console.error('');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Configuration
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const OUTPUT_FILE = path.join(CACHE_DIR, 'noise-readings-master-cache.json');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log('✓ Created cache directory');
}

async function exportAllReadings() {
  console.log('🚀 Starting export of all noise readings...');
  console.log('');
  
  const startTime = Date.now();
  
  try {
    // Get all noise readings
    console.log('📥 Fetching readings from Firestore...');
    const snapshot = await db.collection('noise_readings').get();
    
    const readings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      userEmail: maskAuthor(doc.data().userEmail),
    }));
    
    console.log(`✓ Fetched ${readings.length} readings`);
    
    // Create cache metadata
    const cacheData = {
      version: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      exportedAt: new Date().toISOString(),
      totalReadings: readings.length,
      readings: readings,
    };
    
    // Save to JSON file
    console.log('');
    console.log('💾 Saving to cache file...');
    const jsonContent = JSON.stringify(cacheData, null, 2);
    fs.writeFileSync(OUTPUT_FILE, jsonContent, 'utf8');
    
    // Calculate file size
    const fileSize = fs.statSync(OUTPUT_FILE).size;
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('✅ Export completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Total readings: ${readings.length}`);
    console.log(`   File size: ${fileSizeMB} MB`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Output: ${OUTPUT_FILE}`);
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. Upload to Firebase Storage:');
    console.log(`      firebase storage:upload ${OUTPUT_FILE} --bucket noise-pollution-mapper-9ad3d.appspot.com`);
    console.log('');
    console.log('   2. Or manually upload via Firebase Console:');
    console.log('      Storage → Upload file → noise-readings-master-cache.json');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Export failed:', error.message);
    console.error('');
    process.exit(1);
  } finally {
    // Clean up
    process.exit(0);
  }
}

// Run export
exportAllReadings();
