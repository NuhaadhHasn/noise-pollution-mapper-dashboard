import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FLUTTER_THEME_COLORS } from '@/utils/themeConstants';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { user, signOut, isAuthenticated } = useAuth();
  const { isDarkMode, theme, setTheme, primaryColor, setPrimaryColor } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Start closed on mobile

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const themeColors = Object.keys(FLUTTER_THEME_COLORS.themeColors);

  if (!isAuthenticated) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile Overlay - closes sidebar when tapped */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-300 overflow-hidden',
          isSidebarOpen ? 'w-64' : 'w-0',
          isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white border-gray-200'
        )}
      >
        <div className={cn(
          'flex items-center justify-between p-4 h-16 border-b transition-colors whitespace-nowrap',
          isDarkMode ? 'border-gray-700' : 'border-gray-200'
        )}>
          <span className={cn(
            'text-lg font-bold transition-colors',
            isDarkMode ? 'text-white' : 'text-gray-900'
          )}>🌍 Noise Mapper</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSidebarOpen(false)}
            className={cn(
              'transition-colors',
              isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            ✕
          </Button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-hidden">
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start transition-colors whitespace-nowrap',
              isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
            )}
            onClick={() => navigate('/dashboard')}
          >
            📊 Dashboard
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start transition-colors whitespace-nowrap',
              isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
            )}
            onClick={() => navigate('/map')}
          >
            📍 Map
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start transition-colors whitespace-nowrap',
              isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
            )}
            onClick={() => navigate('/analytics')}
          >
            📈 Analytics
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start transition-colors whitespace-nowrap',
              isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
            )}
            disabled
          >
            📊 Reports (Coming Soon)
          </Button>
        </nav>

        {/* Theme Settings */}
        <div className={cn(
          'p-4 border-t space-y-4 transition-colors overflow-hidden',
          isDarkMode ? 'border-gray-700' : 'border-gray-200'
        )}>
          <div className="space-y-2">
            <p className={cn(
              'text-xs transition-colors',
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            )}>Theme Mode</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => {
                  console.log('[Layout] Setting theme to light');
                  setTheme('light');
                }}
                className="flex-1"
              >
                ☀️
              </Button>
              <Button
                size="sm"
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => {
                  console.log('[Layout] Setting theme to dark');
                  setTheme('dark');
                }}
                className="flex-1"
              >
                🌙
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className={cn(
              'text-xs transition-colors',
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            )}>Primary Color</p>
            <div className="grid grid-cols-4 gap-2">
              {themeColors.map((color) => {
                const colorHex = FLUTTER_THEME_COLORS.themeColors[color as keyof typeof FLUTTER_THEME_COLORS.themeColors];
                const isSelected = primaryColor === color;
                return (
                  <Button
                    key={color}
                    size="sm"
                    variant={isSelected ? 'default' : 'outline'}
                    onClick={() => {
                      console.log('[Layout] Setting primary color to:', color);
                      setPrimaryColor(color);
                    }}
                    className="w-8 h-8 p-0 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: isSelected ? colorHex : 'transparent',
                      borderColor: colorHex,
                    }}
                    title={color}
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: colorHex }}
                    />
                  </Button>
                );
              })}
            </div>
          </div>
          {/* Theme color preview - shows current primary color */}
          <div className="mt-2 flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md shadow-sm"
              style={{
                backgroundColor: FLUTTER_THEME_COLORS.themeColors[primaryColor as keyof typeof FLUTTER_THEME_COLORS.themeColors],
              }}
            />
            <span className={cn(
              'text-xs transition-colors',
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            )}>
              {primaryColor} ({FLUTTER_THEME_COLORS.themeColors[primaryColor as keyof typeof FLUTTER_THEME_COLORS.themeColors]})
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className={cn(
          'flex items-center justify-between p-4 h-16 border-b transition-colors',
          isDarkMode ? 'border-gray-700 bg-[#2D2640]' : 'border-gray-200 bg-white'
        )}>
          <div className="flex items-center gap-4">
            {/* Mobile Menu Button - always visible on mobile */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={cn(
                'transition-colors lg:hidden',
                isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              ☰
            </Button>
            
            {/* Desktop Menu Button - only visible when sidebar closed */}
            {!isSidebarOpen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(true)}
                className={cn(
                  'transition-colors hidden lg:block',
                  isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                ☰
              </Button>
            )}
            
            <h1 className={cn(
              'text-base sm:text-xl font-bold transition-colors',
              isDarkMode ? 'text-white' : 'text-gray-900'
            )}>Urban Noise Pollution Mapper</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={cn(
                  'transition-colors text-xs sm:text-sm',
                  isDarkMode ? 'text-white' : 'text-gray-900'
                )}>
                  <span className="hidden sm:inline">👤</span>
                  <span className="sm:hidden">👤</span>
                  <span className="hidden md:inline">{user?.email || 'User'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={cn(
                'w-56 border shadow-lg',
                isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white border-gray-200'
              )}>
                <DropdownMenuLabel className={cn(
                  'font-semibold',
                  isDarkMode ? 'text-white' : 'text-gray-900'
                )}>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator className={cn(
                  isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                )} />
                <DropdownMenuItem onClick={handleSignOut} className={cn(
                  'cursor-pointer',
                  isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'
                )}>
                  🚪 Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
