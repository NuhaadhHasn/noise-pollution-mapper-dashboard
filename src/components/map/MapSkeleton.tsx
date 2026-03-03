import { Skeleton } from '../ui/skeleton';
import { MapPin, Loader2 } from 'lucide-react';

interface MapSkeletonProps {
  showHeader?: boolean;
  showControls?: boolean;
}

export function MapSkeleton({ showHeader = true, showControls = true }: MapSkeletonProps) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
      {/* Header */}
      {showHeader && (
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-32" />
            </div>
            {showControls && (
              <Skeleton className="h-8 w-24 rounded-md" />
            )}
          </div>
        </div>
      )}

      {/* Map Area */}
      <div className="relative h-[600px] w-full bg-muted">
        {/* Loading Indicator */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        </div>

        {/* Fake Map Markers (for visual effect) */}
        <div className="absolute top-1/4 left-1/4">
          <MapPin className="w-6 h-6 text-muted-foreground/50" />
        </div>
        <div className="absolute top-1/3 left-1/2">
          <MapPin className="w-6 h-6 text-muted-foreground/50" />
        </div>
        <div className="absolute top-1/2 left-1/3">
          <MapPin className="w-6 h-6 text-muted-foreground/50" />
        </div>
        <div className="absolute bottom-1/3 right-1/4">
          <MapPin className="w-6 h-6 text-muted-foreground/50" />
        </div>
        <div className="absolute bottom-1/4 right-1/3">
          <MapPin className="w-6 h-6 text-muted-foreground/50" />
        </div>

        {/* Skeleton Overlay */}
        <Skeleton className="absolute inset-0 opacity-20" animation="shimmer" />
      </div>
    </div>
  );
}

export default MapSkeleton;
