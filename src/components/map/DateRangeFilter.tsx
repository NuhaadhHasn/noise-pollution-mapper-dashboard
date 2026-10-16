import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DATE_PRESETS, type DatePresetId } from '@/lib/mapFilters';

interface DateRangeFilterProps {
  /** The active preset. MapPage owns it, so this control always matches the map (bug-6). */
  value: DatePresetId;
  onChange: (preset: DatePresetId) => void;
}

/**
 * DateRangeFilter - Filter readings by date range
 *
 * Features:
 * - Preset options (7/30/90 days, All time) from src/lib/mapFilters.ts
 * - Controlled: no selection of its own, so closing and reopening the filter
 *   panel can never show a different range from the one the map applies
 * - Works with cached data (no extra Firestore reads)
 */
export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const { isDarkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const selected = DATE_PRESETS.find((preset) => preset.id === value);

  function handleSelect(id: DatePresetId) {
    setIsOpen(false);
    onChange(id);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-start text-left font-normal ${
            isDarkMode
              ? 'border-gray-600 text-gray-300 hover:bg-gray-800'
              : ''
          }`}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {selected ? selected.label : 'Select date range'}
        </Button>
      </PopoverTrigger>

      <PopoverContent className={`w-56 z-[9999] ${
        isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white'
      }`}>
        <div className="space-y-1">
          {DATE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="ghost"
              className={`w-full justify-start font-normal ${
                preset.id === value
                  ? isDarkMode
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-200 text-gray-900'
                  : isDarkMode
                    ? 'text-gray-300 hover:bg-gray-800'
                    : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => handleSelect(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
