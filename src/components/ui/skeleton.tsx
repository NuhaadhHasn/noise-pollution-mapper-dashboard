import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  animation?: 'shimmer' | 'pulse' | 'none';
}

export function Skeleton({ className, animation = 'shimmer' }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-gray-200 dark:bg-gray-700 rounded',
        animation === 'shimmer' && 'animate-shimmer',
        animation === 'pulse' && 'animate-pulse',
        animation === 'none' && '',
        className
      )}
    />
  );
}

export default Skeleton;
