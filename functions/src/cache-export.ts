/**
 * Automatic Cache Export - Cloud Function
 * 
 * Runs EVERY DAY at 2:00 AM UTC automatically
 * Exports ALL noise readings to Firebase Storage
 * NO manual intervention needed!
 * 
 * Users automatically get fresh cache data!
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

/**
 * PRIVACY (audit sec-2): noise_readings.userEmail must leave Firestore only as
 * a MASKED author label, never a raw address. The exported cache is served to
 * every authenticated dashboard user, and an earlier copy of it was committed
 * to a public git repo, publishing 4 real addresses correlated with precise
 * location trails for ~6 months.
 *
 * The stored values were backfilled to masked form on 2026-09-09, so in the
 * normal case this is a no-op. It stays as defence in depth because the
 * offline-sync path can still land a raw address for a queue entry written by
 * a pre-masking build of the app (documented accepted residual, playbook 4.2).
 *
 * Follows FirebaseService.authorLabel() in the Flutter app
 * (lib/services/firebase_service.dart) for addresses, with one deliberate
 * difference: a stored value with no "@" is ALREADY a display name (that is
 * what authorLabel returns when displayName is set), so it is passed through
 * unchanged rather than collapsed to "Anonymous".
 */
function maskAuthor(value: unknown): string {
  if (typeof value !== "string" || !value.includes("@")) {
    return typeof value === "string" && value.length > 0 ? value : "Anonymous";
  }
  const parts = value.split("@");
  const local = parts[0];
  const prefix = local.length > 3 ? local.slice(0, 3) : local;
  return `${prefix}***@${parts.slice(1).join("@")}`;
}

/** Shapes one Firestore doc for export, masking the author label. */
function toExportRow(doc: admin.firestore.QueryDocumentSnapshot) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    userEmail: maskAuthor(data.userEmail),
  };
}

/**
 * Daily Cache Export
 * Runs every day at 2:00 AM UTC
 */
export const exportCacheDaily = onSchedule({
  schedule: "0 2 * * *", // 2:00 AM UTC daily
  timeZone: "UTC",
  retryCount: 3,
  region: "us-central1"
}, async (event) => {
  logger.info("🚀 Starting automatic cache export", {
    scheduleTime: event.scheduleTime,
    jobName: event.jobName
  });

  try {
    // Fetch ALL noise readings
    logger.info("📥 Fetching all noise readings from Firestore...");
    const snapshot = await db.collection("noise_readings").get();
    
    const readings = snapshot.docs.map(toExportRow);

    logger.info(`✓ Fetched ${readings.length} readings`);

    // Create cache metadata
    const cacheData = {
      version: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      exportedAt: new Date().toISOString(),
      totalReadings: readings.length,
      readings: readings,
    };

    // Save to Firebase Storage
    const fileName = "cache/noise-readings-master-cache.json";
    const file = bucket.file(fileName);
    
    logger.info(`💾 Uploading to Firebase Storage: ${fileName}`);
    await file.save(JSON.stringify(cacheData, null, 2), {
      contentType: "application/json",
      metadata: {
        metadata: {
          version: cacheData.version,
          totalReadings: cacheData.totalReadings.toString(),
          exportedAt: cacheData.exportedAt,
        },
      },
      predefinedAcl: "projectPrivate",
    });

    logger.info("✅ Cache export completed successfully!", {
      totalReadings: readings.length,
      version: cacheData.version,
      fileName: fileName
    });

    // Make file publicly accessible to authenticated users
    await file.makePublic();

    logger.info("🌐 Cache file is now available for download");

  } catch (error) {
    logger.error("❌ Cache export failed:", error);
    throw error;
  }
});

/**
 * Weekly Full Export (Backup)
 * Runs every Monday at 3:00 AM UTC
 */
export const exportCacheWeekly = onSchedule({
  schedule: "0 3 * * 1", // 3:00 AM UTC every Monday
  timeZone: "UTC",
  retryCount: 3,
  region: "us-central1"
}, async (event) => {
  logger.info("🚀 Starting weekly full cache export", {
    scheduleTime: event.scheduleTime
  });

  try {
    // Same as daily export, but with more logging
    const snapshot = await db.collection("noise_readings").get();
    const readings = snapshot.docs.map(toExportRow);

    const cacheData = {
      version: new Date().toISOString().split('T')[0],
      exportedAt: new Date().toISOString(),
      totalReadings: readings.length,
      readings: readings,
    };

    const fileName = "cache/noise-readings-master-cache.json";
    const file = bucket.file(fileName);
    
    await file.save(JSON.stringify(cacheData, null, 2), {
      contentType: "application/json",
      metadata: {
        metadata: {
          version: cacheData.version,
          totalReadings: cacheData.totalReadings.toString(),
          exportedAt: cacheData.exportedAt,
          exportType: "weekly",
        },
      },
      predefinedAcl: "projectPrivate",
    });

    await file.makePublic();

    logger.info("✅ Weekly cache export completed", {
      totalReadings: readings.length,
      version: cacheData.version
    });

  } catch (error) {
    logger.error("❌ Weekly cache export failed:", error);
    throw error;
  }
});
