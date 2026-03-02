/**
 * Firebase Functions Entry Point
 * 
 * Automatic cache export - runs daily at 2 AM UTC
 */

export { exportCacheDaily, exportCacheWeekly } from "./cache-export";
