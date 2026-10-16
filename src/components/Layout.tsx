import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface LayoutProps {
  children: React.ReactNode;
}

// Tailwind's `lg` breakpoint. From here up the sidebar is a persistent column;
// below it the sidebar is a drawer.
const DESKTOP_QUERY = '(min-width: 1024px)';

function isDesktopViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches;
}

// A closed sidebar is inert, so focus that was inside it must be handed to a
// control that is still visible: the header menu button of the current layout.
function focusMenuButton(): void {
  const id = isDesktopViewport() ? 'sidebar-toggle-desktop' : 'sidebar-toggle-mobile';
  window.requestAnimationFrame(() => document.getElementById(id)?.focus());
}

const NAV_ITEMS = [
  { to: '/dashboard', icon: '📊', label: 'Dashboard' },
  { to: '/map', icon: '📍', label: 'Map' },
  { to: '/analytics', icon: '📈', label: 'Analytics' },
] as const;

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, isAuthenticated } = useAuth();
  const { isDarkMode, theme, setTheme, primaryColor, setPrimaryColor } = useTheme();
  // Open by default from lg up (a persistent column); closed below lg (a drawer).
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => isDesktopViewport());

  // Crossing the lg breakpoint resets the sidebar to that layout's default.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsSidebarOpen(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Esc closes the drawer. Not on desktop, where the sidebar is a column, and
  // not when another layer (a Radix menu or dialog) already consumed the key.
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isDesktopViewport()) return;
      setIsSidebarOpen(false);
      focusMenuButton();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isSidebarOpen]);

  // Choosing a destination closes the drawer on phones and tablets.
  const closeDrawerOnNavigate = () => {
    if (isDesktopViewport()) return;
    setIsSidebarOpen(false);
    focusMenuButton();
  };

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
      {/* Mobile Overlay - closes sidebar when tapped; Esc does the same from the keyboard */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          aria-hidden="true"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar. While closed it is inert: out of the tab order and hidden from assistive technology. */}
      <aside
        id="app-sidebar"
        inert={!isSidebarOpen}
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-[45] flex flex-col border-r transition-all duration-300 overflow-hidden',
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
            aria-label="Close navigation menu"
            onClick={() => {
              setIsSidebarOpen(false);
              focusMenuButton();
            }}
            className={cn(
              'transition-colors',
              isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <span aria-hidden="true">✕</span>
          </Button>
        </div>

        <nav aria-label="Primary" className="flex-1 p-4 space-y-2 overflow-hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeDrawerOnNavigate}
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: 'ghost' }),
                  'w-full justify-start transition-colors whitespace-nowrap',
                  isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100',
                  isActive && (isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900')
                )
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
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
                aria-label="Light theme"
                aria-pressed={theme === 'light'}
                onClick={() => {
                  console.log('[Layout] Setting theme to light');
                  setTheme('light');
                }}
                className="flex-1"
              >
                <span aria-hidden="true">☀️</span>
              </Button>
              <Button
                size="sm"
                variant={theme === 'dark' ? 'default' : 'outline'}
                aria-label="Dark theme"
                aria-pressed={theme === 'dark'}
                onClick={() => {
                  console.log('[Layout] Setting theme to dark');
                  setTheme('dark');
                }}
                className="flex-1"
              >
                <span aria-hidden="true">🌙</span>
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
                    aria-label={`${color} theme colour`}
                    aria-pressed={isSelected}
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
              id="sidebar-toggle-mobile"
              variant="ghost"
              size="sm"
              aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isSidebarOpen}
              aria-controls="app-sidebar"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={cn(
                'transition-colors lg:hidden',
                isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <span aria-hidden="true">☰</span>
            </Button>

            {/* Desktop Menu Button - only visible when sidebar closed */}
            {!isSidebarOpen && (
              <Button
                id="sidebar-toggle-desktop"
                variant="ghost"
                size="sm"
                aria-label="Open navigation menu"
                aria-expanded={false}
                aria-controls="app-sidebar"
                onClick={() => setIsSidebarOpen(true)}
                className={cn(
                  'transition-colors hidden lg:block',
                  isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <span aria-hidden="true">☰</span>
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

        {/* Content Area. sec-1: a page that throws while rendering shows the
            boundary's notice here while the header and sidebar keep working.
            Keyed by path, so navigating to another page clears the error. */}
        <main className="flex-1 overflow-auto p-6">
          <ErrorBoundary key={location.pathname}>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
