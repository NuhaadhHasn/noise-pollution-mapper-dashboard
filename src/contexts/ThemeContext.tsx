import { createContext, useContext, useEffect, useState } from 'react';
import { FLUTTER_THEME_COLORS } from '@/utils/themeConstants';
import { readableTextColor } from '@/lib/contrast';
import { safeStorage } from '@/lib/safeStorage';

type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  primaryColor: string;
  setTheme: (theme: Theme) => void;
  setPrimaryColor: (color: string) => void;
  isDarkMode: boolean;
  getBackgroundColor: () => string;
  getCardColor: () => string;
  getTextColor: () => string;
};

const initialState: ThemeProviderState = {
  theme: 'dark', // Default to dark mode like Flutter app
  primaryColor: 'Purple', // Default to Purple like Flutter app
  setTheme: () => null,
  setPrimaryColor: () => null,
  isDarkMode: true,
  getBackgroundColor: () => FLUTTER_THEME_COLORS.darkBackground,
  getCardColor: () => FLUTTER_THEME_COLORS.darkPurple,
  getTextColor: () => FLUTTER_THEME_COLORS.textWhite,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

/**
 * Convert hex color to CSS color that can be used in OKLCH context
 * For Tailwind shadcn/ui compatibility, we set both:
 * 1. --primary-color as the hex value (for direct use)
 * 2. --primary as oklch() using the hex value
 */
function hexToCssColor(hex: string): { hex: string; oklch: string } {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Parse hex to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Convert RGB to OKLCH using proper formula
  // First, normalize RGB to 0-1 range
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;
  
  // Convert sRGB to linear RGB
  const rl = rs <= 0.04045 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const gl = gs <= 0.04045 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const bl = bs <= 0.04045 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
  
  // Convert linear RGB to XYZ (D65 illuminant)
  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
  const z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;
  
  // Convert XYZ to OKLCH
  // Using simplified matrix approximation
  const l = 0.210454 * x + 0.793617 * y - 0.004072 * z;
  const a = 1.977998 * x - 2.428592 * y + 0.450594 * z;
  const bVal = 0.025904 * x + 0.782771 * y - 0.808676 * z;
  
  // Calculate chroma and hue
  const c = Math.sqrt(a * a + bVal * bVal);
  let h = Math.atan2(bVal, a) * (180 / Math.PI);
  if (h < 0) h += 360;
  
  const oklch = `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
  
  return { hex: `#${hex}`, oklch };
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'noise-mapper-theme',
  ...props
}: ThemeProviderProps) {
  // bug-11: storage can throw (private window, blocked site data), and this
  // runs during the first render, so it goes through safeStorage.
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = safeStorage.get(storageKey);
    return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : defaultTheme;
  });

  const [primaryColor, setPrimaryColor] = useState<string>(() => {
    return safeStorage.get(`${storageKey}-primaryColor`) || 'Purple';
  });

  // Apply theme to document
  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';

      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }

    // Store theme preference
    safeStorage.set(storageKey, theme);
  }, [theme, storageKey]);

  // Apply primary color to CSS variable
  useEffect(() => {
    const color = FLUTTER_THEME_COLORS.themeColors[primaryColor as keyof typeof FLUTTER_THEME_COLORS.themeColors];
    if (color) {
      // Convert hex to OKLCH for proper Tailwind integration
      const { oklch } = hexToCssColor(color);
      // Set BOTH OKLCH (for Tailwind bg-primary) and hex (for direct use)
      document.documentElement.style.setProperty('--primary-color', oklch);
      document.documentElement.style.setProperty('--primary-color-hex', color);
      document.documentElement.style.setProperty('--primary-foreground-hex', readableTextColor(color));
      safeStorage.set(`${storageKey}-primaryColor`, primaryColor);
      console.log('[ThemeContext] Applied primary color:', primaryColor, color, '→', oklch);
    }
  }, [primaryColor, storageKey]);

  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const getBackgroundColor = () => {
    return isDarkMode
      ? FLUTTER_THEME_COLORS.darkBackground
      : FLUTTER_THEME_COLORS.lightBackground;
  };

  const getCardColor = () => {
    return isDarkMode
      ? FLUTTER_THEME_COLORS.darkPurple
      : FLUTTER_THEME_COLORS.lightCardBackground;
  };

  const getTextColor = () => {
    return isDarkMode
      ? FLUTTER_THEME_COLORS.textWhite
      : FLUTTER_THEME_COLORS.textDark;
  };

  const value = {
    theme,
    primaryColor,
    setTheme: (newTheme: Theme) => {
      safeStorage.set(storageKey, newTheme);
      setTheme(newTheme);
      console.log('[ThemeContext] Theme changed to:', newTheme);
    },
    setPrimaryColor: (color: string) => {
      safeStorage.set(`${storageKey}-primaryColor`, color);
      setPrimaryColor(color);
      console.log('[ThemeContext] Primary color changed to:', color);
    },
    isDarkMode,
    getBackgroundColor,
    getCardColor,
    getTextColor,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
