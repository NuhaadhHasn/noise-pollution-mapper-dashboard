/**
 * Theme Constants - Aligned with Flutter Mobile App
 * These colors MUST match app_theme.dart exactly
 */

export const FLUTTER_THEME_COLORS = {
  // Primary theme colors (8 options - matches Flutter app)
  themeColors: {
    Purple: '#6C63FF',
    Green: '#4CAF50',
    Blue: '#2196F3',
    Orange: '#FF9800',
    Pink: '#E91E63',
    Teal: '#009688',
    Red: '#F44336',
    Indigo: '#3F51B5',
  },

  // Dark theme backgrounds
  darkBackground: '#1E1932', // Main screen background
  darkPurple: '#2D2640', // AppBar, cards
  cardBackground: '#322E4A', // Card surfaces

  // Light theme backgrounds
  lightBackground: '#F5F5F5', // Main screen background
  lightCardBackground: '#FFFFFF', // Card surfaces

  // Text colors
  textWhite: '#FFFFFF',
  textGray: '#B8B5C8',
  textDark: '#1E1932',
  textLightGray: '#6B6B6B',

  // Noise level colors (MATCH FLUTTER APP EXACTLY)
  lowNoise: '#4CAF50', // Green: < 50 dB
  moderateNoise: '#FF9800', // Orange: 50-70 dB
  highNoise: '#F44336', // Red: > 70 dB
};
