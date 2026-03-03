import { cn } from '../lib/utils';
import {
  Database,
  MapPin,
  Search,
  Inbox,
  AlertCircle
} from 'lucide-react';

interface EmptyStateProps {
  variant?: 'no-data' | 'no-results' | 'no-markers' | 'generic' | 'error';
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

const variantConfig = {
  'no-data': {
    icon: Database,
    title: 'No Data Yet',
    description: 'No noise readings found in the selected date range or location.',
  },
  'no-results': {
    icon: Search,
    title: 'No Results Found',
    description: 'Try adjusting your search or filter criteria.',
  },
  'no-markers': {
    icon: MapPin,
    title: 'No Markers in View',
    description: 'No noise readings in the current map view. Try zooming out or panning to a different area.',
  },
  'generic': {
    icon: Inbox,
    title: 'Nothing Here',
    description: 'There is no content to display at the moment.',
  },
  'error': {
    icon: AlertCircle,
    title: 'Error Loading Data',
    description: 'We encountered an error while loading the data. Please try again.',
  },
};

export function EmptyState({
  variant = 'generic',
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  const config = variantConfig[variant];
  const IconComponent = icon ? null : config.icon;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center min-h-[300px] p-8 text-center',
        className
      )}
    >
      {/* Icon */}
      <div className="mb-6">
        {icon ? (
          icon
        ) : (
          <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-muted">
            {IconComponent && <IconComponent className="w-8 h-8 text-muted-foreground" />}
          </div>
        )}
      </div>

      {/* Title */}
      {title && (
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {title}
        </h3>
      )}

      {/* Description */}
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          {description}
        </p>
      )}

      {/* Action */}
      {action && (
        <div className="flex gap-3">
          {action}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
