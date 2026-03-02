import { useState, useEffect } from 'react';
import { Database, Download, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import * as cacheDownloader from '@/utils/cacheDownloader';

interface CacheStatusProps {
  onCacheDownloaded?: (result: {
    totalReadings: number;
    metadata: cacheDownloader.CacheMetadata;
  }) => void;
}

/**
 * CacheStatus - Shows cache status and provides download button
 * 
 * States:
 * - Not downloaded: Show download button
 * - Downloading: Show progress dialog
 * - Downloaded (current): Show up-to-date status
 * - Downloaded (outdated): Show update button
 */
export function CacheStatus({ onCacheDownloaded }: CacheStatusProps) {
  const { isDarkMode } = useTheme();
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isOutdated, setIsOutdated] = useState(false);
  const [metadata, setMetadata] = useState<cacheDownloader.CacheMetadata | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<cacheDownloader.DownloadProgress>({
    status: 'downloading',
    progress: 0,
  });

  async function checkCacheStatus() {
    const downloaded = await cacheDownloader.isCacheDownloaded();
    const outdated = await cacheDownloader.isCacheOutdated();
    const meta = await cacheDownloader.getCacheMetadata();

    setIsDownloaded(downloaded);
    setIsOutdated(outdated);
    setMetadata(meta);
  }

  // Check cache status on mount
  useEffect(() => {
    checkCacheStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDownload() {
    setShowDialog(true);
    setIsDownloading(true);
    setProgress({ status: 'downloading', progress: 0 });

    try {
      const result = await cacheDownloader.downloadAndImportCache((progress) => {
        setProgress(progress);
      });

      // Cache download complete
      setIsDownloaded(true);
      setIsOutdated(false);
      setMetadata(result.metadata);
      setIsDownloading(false);

      if (onCacheDownloaded) {
        onCacheDownloaded(result);
      }

      // Auto-close dialog after 2 seconds
      setTimeout(() => {
        setShowDialog(false);
      }, 2000);
    } catch (error) {
      console.error('Cache download failed:', error);
      setProgress({
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Download failed',
      });
      setIsDownloading(false);
    }
  }

  // Render button based on status
  function renderButton() {
    if (!isDownloaded || isOutdated) {
      return (
        <Button
          variant="default"
          size="sm"
          onClick={handleDownload}
          disabled={isDownloading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isDownloading ? (
            <>
              <Loader className="h-4 w-4 mr-2 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              {isOutdated ? 'Update Cache' : 'Download All Readings'}
            </>
          )}
        </Button>
      );
    }

    // Downloaded and current
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
        isDarkMode ? 'bg-[#2D2640]/95' : 'bg-white/95'
      } backdrop-blur-sm shadow-lg`}>
        <Database className={`h-3.5 w-3.5 ${
          isDarkMode ? 'text-green-400' : 'text-green-600'
        }`} />
        <span className={`text-xs font-medium ${
          isDarkMode ? 'text-gray-300' : 'text-gray-700'
        }`}>
          {metadata?.totalReadings || 0} readings
        </span>
        <CheckCircle className={`h-3.5 w-3.5 ${
          isDarkMode ? 'text-green-400' : 'text-green-600'
        }`} />
      </div>
    );
  }

  return (
    <>
      {/* Cache Status Button */}
      {renderButton()}

      {/* Download Progress Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className={`max-w-md ${
          isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white'
        }`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              {progress.status === 'complete' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : progress.status === 'error' ? (
                <AlertCircle className="h-5 w-5 text-red-500" />
              ) : (
                <Database className="h-5 w-5 text-blue-500" />
              )}
              {progress.status === 'downloading' && 'Downloading Cache...'}
              {progress.status === 'importing' && 'Importing to Database...'}
              {progress.status === 'complete' && 'Download Complete!'}
              {progress.status === 'error' && 'Download Failed'}
            </DialogTitle>
            
            <DialogDescription className={`pt-2 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              {progress.status === 'downloading' && (
                <div className="space-y-3">
                  <p>Downloading all noise readings from Firebase Storage...</p>
                  <Progress value={progress.progress} className="w-full" />
                  <p className="text-xs text-center">
                    {progress.loadedBytes && progress.totalBytes
                      ? `${((progress.loadedBytes / 1024 / 1024).toFixed(1))} MB / ${((progress.totalBytes / 1024 / 1024).toFixed(1))} MB`
                      : `${progress.progress}%`}
                  </p>
                </div>
              )}
              
              {progress.status === 'importing' && (
                <div className="space-y-3">
                  <p>Importing readings to local database...</p>
                  <Progress value={progress.progress} className="w-full" />
                  <p className="text-xs text-center">{progress.progress}%</p>
                </div>
              )}
              
              {progress.status === 'complete' && (
                <div className="space-y-3">
                  <p className="text-green-600 dark:text-green-400 font-medium">
                    ✓ Successfully downloaded {metadata?.totalReadings || 0} readings!
                  </p>
                  <p className="text-sm">
                    Cache version: {metadata?.version || 'Unknown'}
                  </p>
                </div>
              )}
              
              {progress.status === 'error' && (
                <div className="space-y-3">
                  <p className="text-red-600 dark:text-red-400">
                    {progress.error || 'An error occurred during download'}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDialog(false)}
                    className="w-full"
                  >
                    Close
                  </Button>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {(progress.status === 'downloading' || progress.status === 'importing') && (
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDialog(false)}
                disabled={isDownloading}
                className={isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : ''}
              >
                Cancel
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
