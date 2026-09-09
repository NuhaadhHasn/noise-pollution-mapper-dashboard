"use strict";
/**
 * Automatic Cache Export - Cloud Function
 *
 * Runs EVERY DAY at 2:00 AM UTC automatically
 * Exports ALL noise readings to Firebase Storage
 * NO manual intervention needed!
 *
 * Users automatically get fresh cache data!
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportCacheWeekly = exports.exportCacheDaily = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = __importStar(require("firebase-functions/logger"));
const admin = __importStar(require("firebase-admin"));
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
function maskAuthor(value) {
    if (typeof value !== "string" || !value.includes("@")) {
        return typeof value === "string" && value.length > 0 ? value : "Anonymous";
    }
    const parts = value.split("@");
    const local = parts[0];
    const prefix = local.length > 3 ? local.slice(0, 3) : local;
    return `${prefix}***@${parts.slice(1).join("@")}`;
}
/** Shapes one Firestore doc for export, masking the author label. */
function toExportRow(doc) {
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
exports.exportCacheDaily = (0, scheduler_1.onSchedule)({
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
    }
    catch (error) {
        logger.error("❌ Cache export failed:", error);
        throw error;
    }
});
/**
 * Weekly Full Export (Backup)
 * Runs every Monday at 3:00 AM UTC
 */
exports.exportCacheWeekly = (0, scheduler_1.onSchedule)({
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
    }
    catch (error) {
        logger.error("❌ Weekly cache export failed:", error);
        throw error;
    }
});
