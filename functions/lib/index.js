"use strict";
/**
 * Firebase Functions Entry Point
 *
 * Automatic cache export - runs daily at 2 AM UTC
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportCacheWeekly = exports.exportCacheDaily = void 0;
var cache_export_1 = require("./cache-export");
Object.defineProperty(exports, "exportCacheDaily", { enumerable: true, get: function () { return cache_export_1.exportCacheDaily; } });
Object.defineProperty(exports, "exportCacheWeekly", { enumerable: true, get: function () { return cache_export_1.exportCacheWeekly; } });
