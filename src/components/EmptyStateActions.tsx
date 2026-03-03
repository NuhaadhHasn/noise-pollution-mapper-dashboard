/* eslint-disable react-refresh/only-export-components */
import { Filter, Calendar, MapPin, BarChart3 } from 'lucide-react';

// Preset components for common actions
export const EmptyStateActions = {
  ClearFilters: ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
    >
      <Filter className="w-4 h-4" />
      Clear Filters
    </button>
  ),

  AdjustDateRange: ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
    >
      <Calendar className="w-4 h-4" />
      Adjust Date Range
    </button>
  ),

  ZoomOut: ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
    >
      <MapPin className="w-4 h-4" />
      Zoom Out
    </button>
  ),

  ViewAnalytics: ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
    >
      <BarChart3 className="w-4 h-4" />
      View Analytics
    </button>
  ),
};

export default EmptyStateActions;
