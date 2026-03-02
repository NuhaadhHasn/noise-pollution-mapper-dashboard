/**
 * Export Cache to Firestore
 * 
 * Simpler alternative to Storage - stores cache directly in Firestore
 * NO Firebase Storage needed!
 * 
 * Usage:
 *   node scripts/export-cache-to-firestore.js
 */

import admin from 'firebase-admin';
import fs from 'fs';
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

async function exportCacheToFirestore() {
  console.log('🚀 Starting cache export to Firestore...');
  console.log('');
  
  const startTime = Date.now();
  
  try {
    // Get all noise readings
    console.log('📥 Fetching readings from Firestore...');
    const snapshot = await db.collection('noise_readings').get();
    
    const readings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    console.log(`✓ Fetched ${readings.length} readings`);
    
    // Create cache document
    const cacheData = {
      version: new Date().toISOString().split('T')[0],
      exportedAt: new Date().toISOString(),
      totalReadings: readings.length,
      readings: readings,
      type: 'full_cache'
    };
    
    // Save to Firestore
    console.log('');
    console.log('💾 Saving cache to Firestore...');
    console.log('⚠️  Note: Firestore has 1MB document limit');
    console.log('📊 Cache size estimate: ~' + Math.round(JSON.stringify(cacheData).length / 1024) + ' KB');
    
    if (JSON.stringify(cacheData).length > 1000000) {
      console.log('');
      console.log('❌ Cache is too large for single Firestore document (>1MB)');
      console.log('💡 Solution: Use Firebase Storage instead or split into multiple documents');
      console.log('');
      console.log('To use Storage instead, run:');
      console.log('  1. Upload manually via Firebase Console');
      console.log('  2. Storage → Upload file → cache/noise-readings-master-cache.json');
      console.log('');
      return;
    }
    
    await db.collection('cache').doc('noise_readings_full').set(cacheData);
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('✅ Cache export to Firestore completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Total readings: ${readings.length}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Collection: cache`);
    console.log(`   Document: noise_readings_full`);
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. Update app to read from Firestore cache instead of Storage');
    console.log('   2. Users will automatically get cache from Firestore');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Export failed:', error.message);
    console.error('');
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run export
exportCacheToFirestore();
