import { useState, useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import type { NoiseReading } from '@/types/NoiseReading';
import type { UserInfo } from '@/services/userService';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface DataTableProps {
  data: NoiseReading[];
  userMap?: Map<string, UserInfo>;
}

type SortField = 'timestamp' | 'locationName' | 'decibelLevel' | 'soundCategory' | 'soundType' | 'confidence';
type SortDirection = 'asc' | 'desc';

interface SortIconProps {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}

function SortIcon({ field, sortField, sortDirection }: SortIconProps) {
  if (sortField !== field) return null;
  return sortDirection === 'asc' ? (
    <ChevronUp className="w-3 h-3 ml-1 inline" />
  ) : (
    <ChevronDown className="w-3 h-3 ml-1 inline" />
  );
}

export function DataTable({ data, userMap }: DataTableProps) {
  const { isDarkMode, getCardColor } = useTheme();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Sort and paginate data
  const processedData = useMemo(() => {
    // Sort
    const sorted = [...data].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortField) {
        case 'timestamp':
          aVal = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
          bVal = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
          break;
        case 'locationName':
          aVal = a.locationName || '';
          bVal = b.locationName || '';
          break;
        case 'decibelLevel':
          aVal = a.decibelLevel;
          bVal = b.decibelLevel;
          break;
        case 'soundCategory':
          aVal = a.soundCategory || a.soundClass || '';
          bVal = b.soundCategory || b.soundClass || '';
          break;
        case 'soundType':
          aVal = a.soundType || '';
          bVal = b.soundType || '';
          break;
        case 'confidence':
          aVal = a.confidence || 0;
          bVal = b.confidence || 0;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    // Paginate
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return sorted.slice(startIndex, endIndex);
  }, [data, sortField, sortDirection, currentPage, rowsPerPage]);

  // Calculate pagination
  const totalPages = Math.ceil(data.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage + 1;
  const endIndex = Math.min(currentPage * rowsPerPage, data.length);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Get noise level color
  const getNoiseLevelColor = (dB: number) => {
    if (dB < 50) return isDarkMode ? '#4CAF50' : '#4CAF50';
    if (dB <= 70) return isDarkMode ? '#FF9800' : '#FF9800';
    return isDarkMode ? '#F44336' : '#F44336';
  };

  // Get noise level label
  const getNoiseLevelLabel = (dB: number) => {
    if (dB < 50) return 'Low';
    if (dB <= 70) return 'Moderate';
    return 'High';
  };

  return (
    <div className="space-y-4">
      {/* Table */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{
          backgroundColor: getCardColor(),
          borderColor: isDarkMode ? '#4A4458' : '#E0E0E0'
        }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('timestamp')}
              >
                Timestamp <SortIcon field="timestamp" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('locationName')}
              >
                Location <SortIcon field="locationName" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('decibelLevel')}
              >
                Noise Level (dB) <SortIcon field="decibelLevel" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('soundCategory')}
              >
                Category <SortIcon field="soundCategory" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('soundType')}
              >
                Type <SortIcon field="soundType" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('confidence')}
              >
                Confidence <SortIcon field="confidence" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
              <TableHead>User Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="text-gray-500">
                    No data available
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              processedData.map((reading) => (
                <TableRow
                  key={reading.id}
                  className="transition-colors"
                  style={{
                    borderLeft: `4px solid ${getNoiseLevelColor(reading.decibelLevel)}`
                  }}
                >
                  <TableCell className={cn('font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
                    {reading.timestamp?.toDate
                      ? reading.timestamp.toDate().toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'N/A'}
                  </TableCell>
                  <TableCell className={cn(isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
                    {reading.locationName || 'Unknown'}
                  </TableCell>
                  <TableCell>
                    <span
                      className="px-2 py-1 rounded text-xs font-semibold text-white"
                      style={{ backgroundColor: getNoiseLevelColor(reading.decibelLevel) }}
                    >
                      {reading.decibelLevel.toFixed(1)} dB ({getNoiseLevelLabel(reading.decibelLevel)})
                    </span>
                  </TableCell>
                  <TableCell className={cn(isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
                    {reading.soundCategory || reading.soundClass || 'Unknown'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium",
                        reading.soundType === 'Pollution'
                          ? 'bg-red-100 text-red-800'
                          : reading.soundType === 'Ambient'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      )}
                    >
                      {reading.soundType || 'Unknown'}
                    </span>
                  </TableCell>
                  <TableCell className={cn(isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(reading.confidence || 0) * 100}%`,
                            backgroundColor: reading.confidence > 0.7 ? '#4CAF50' : reading.confidence > 0.4 ? '#FF9800' : '#F44336'
                          }}
                        />
                      </div>
                      <span>{((reading.confidence || 0) * 100).toFixed(0)}%</span>
                    </div>
                  </TableCell>
                  <TableCell className={cn(isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
                    {userMap?.get(reading.userId)?.email || reading.userId || 'Unknown'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between">
        {/* Rows per page */}
        <div className="flex items-center gap-2">
          <span className={cn('text-sm', isDarkMode ? 'text-gray-400' : 'text-gray-600')}>
            Rows per page:
          </span>
          <select
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className={cn(
              'px-2 py-1 rounded border text-sm',
              isDarkMode
                ? 'bg-gray-800 border-gray-700 text-white'
                : 'bg-white border-gray-300 text-gray-900'
            )}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {/* Showing X of Y */}
        <div className={cn('text-sm', isDarkMode ? 'text-gray-400' : 'text-gray-600')}>
          Showing {startIndex} to {endIndex} of {data.length} readings
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="px-2"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className={cn('text-sm px-2', isDarkMode ? 'text-gray-400' : 'text-gray-600')}>
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="px-2"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
