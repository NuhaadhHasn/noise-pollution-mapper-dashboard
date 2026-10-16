import { useState } from 'react';
import { Users, User, AlertCircle } from 'lucide-react';
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

interface UserFilterToggleProps {
  showAllUsers: boolean;
  onFilterChange?: (showAllUsers: boolean) => void;
}

/**
 * UserFilterToggle - Toggle between "My Readings Only" and "All Users"
 * 
 * My Readings Only: shows only the readings you recorded.
 * All Users: shows readings from every contributor.
 * Both modes are a view filter over the readings already synced to this
 * browser; neither is an access control.
 */
export function UserFilterToggle({ showAllUsers, onFilterChange }: UserFilterToggleProps) {
  const { isDarkMode } = useTheme();
  const [showDialog, setShowDialog] = useState(false);

  function handleToggle() {
    const newValue = !showAllUsers;
    
    // Show custom dialog when switching to "All Users"
    if (newValue) {
      setShowDialog(true);
    } else {
      // Switching back to "My Readings" - no confirmation needed
      if (onFilterChange) {
        onFilterChange(false);
      }
    }
  }

  function handleConfirmAllUsers() {
    setShowDialog(false);
    if (onFilterChange) {
      onFilterChange(true);
    }
  }

  function handleCancel() {
    setShowDialog(false);
  }

  return (
    <>
      {/* Toggle Button */}
      <Button
        variant={showAllUsers ? "default" : "outline"}
        size="sm"
        onClick={handleToggle}
        className={`h-8 px-3 text-xs font-medium transition-all ${
          showAllUsers
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : isDarkMode
              ? 'border-gray-600 text-gray-300 hover:bg-gray-800'
              : 'border-gray-300 text-gray-700 hover:bg-gray-100'
        }`}
        title={showAllUsers ? 'Showing all users readings' : 'Showing only my readings'}
      >
        {showAllUsers ? (
          <Users className="h-4 w-4 mr-1.5" />
        ) : (
          <User className="h-4 w-4 mr-1.5" />
        )}
        {showAllUsers ? 'All Users' : 'My Readings Only'}
      </Button>

      {/* Custom Confirmation Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className={`max-w-md z-[9999] ${
          isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white'
        }`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              <AlertCircle className="h-5 w-5 text-blue-500" />
              Switch to All Users Mode?
            </DialogTitle>
            <DialogDescription className={`pt-2 space-y-3 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              <p>
                This will show noise readings from <strong>all contributors</strong> instead of just your own. They are already in this browser, so nothing is downloaded: this only changes which readings the map shows.
              </p>
              
              <p className={`text-sm ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}>
                You can switch back to "My Readings Only" at any time.
              </p>
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleCancel}
              className={isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : ''}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleConfirmAllUsers}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Users className="h-4 w-4 mr-2" />
              Show All Users
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
