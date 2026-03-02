import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DateRangeFilterProps {
  onDateRangeChange?: (range: { start: Date; end: Date } | null) => void;
}

interface DateRangeOption {
  label: string;
  days: number | null; // null = all time
}

const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
];

/**
 * DateRangeFilter - Filter readings by date range
 * 
 * Features:
 * - Preset options (7/30/90 days, All time)
 * - Clear visual indication of selected range
 * - Works with cached data (no extra Firestore reads)
 */
export function DateRangeFilter({ onDateRangeChange }: DateRangeFilterProps) {
  const { isDarkMode } = useTheme();
  const [selectedOption, setSelectedOption] = useState<DateRangeOption>(DATE_RANGE_OPTIONS[3]); // Default: All time
  const [isOpen, setIsOpen] = useState(false);

  function handleSelect(option: DateRangeOption) {
    setSelectedOption(option);
    setIsOpen(false);
    
    if (onDateRangeChange) {
      if (option.days === null) {
        // All time - no filter
        onDateRangeChange(null);
      } else {
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - option.days);
        
        onDateRangeChange({
          start: startDate,
          end: endDate,
        });
      }
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-start text-left font-normal ${
            !selectedOption && 'text-muted-foreground'
          } ${
            isDarkMode
              ? 'border-gray-600 text-gray-300 hover:bg-gray-800'
              : ''
          }`}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {selectedOption ? selectedOption.label : 'Select date range'}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className={`w-56 z-[9999] ${
        isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white'
      }`}>
        <div className="space-y-1">
          {DATE_RANGE_OPTIONS.map((option) => (
            <Button
              key={option.label}
              variant="ghost"
              className={`w-full justify-start font-normal ${
                selectedOption?.label === option.label
                  ? isDarkMode
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-200 text-gray-900'
                  : isDarkMode
                    ? 'text-gray-300 hover:bg-gray-800'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => handleSelect(option)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
