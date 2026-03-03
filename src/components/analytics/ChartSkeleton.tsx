import { Skeleton } from '../ui/skeleton';

interface ChartSkeletonProps {
  title?: string;
  height?: string;
  showLegend?: boolean;
}

export function ChartSkeleton({
  height = 'h-64',
  showLegend = false
}: Omit<ChartSkeletonProps, 'title'>) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-32" />
        {showLegend && (
          <div className="flex gap-2">
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
        )}
      </div>

      {/* Chart Area */}
      <div className={`${height} w-full`}>
        <Skeleton className="h-full w-full rounded-lg" />
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-4">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

export default ChartSkeleton;
