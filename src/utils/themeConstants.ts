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

// Sound Categories (14 Categories - Session 29)
export const SOUND_CATEGORIES = {
  // Pollution Categories
  Traffic: {
    name: 'Traffic',
    icon: 'car',
    color: '#FF5252',
    type: 'Pollution',
    badge: 'Red',
  },
  'Tuk-tuk': {
    name: 'Tuk-tuk',
    icon: 'motorcycle',
    color: '#FF7043',
    type: 'Pollution',
    badge: 'Orange',
  },
  Construction: {
    name: 'Construction',
    icon: 'hammer',
    color: '#FFA726',
    type: 'Pollution',
    badge: 'Orange',
  },
  Sirens: {
    name: 'Sirens',
    icon: 'bell-ring',
    color: '#EF5350',
    type: 'Pollution',
    badge: 'Red',
  },
  Machinery: {
    name: 'Machinery',
    icon: 'cog',
    color: '#FF6E40',
    type: 'Pollution',
    badge: 'Orange',
  },
  Alarm: {
    name: 'Alarm',
    icon: 'alarm',
    color: '#F44336',
    type: 'Pollution',
    badge: 'Red',
  },
  Transport: {
    name: 'Transport',
    icon: 'train',
    color: '#E53935',
    type: 'Pollution',
    badge: 'Red',
  },

  // Ambient Categories
  Music: {
    name: 'Music',
    icon: 'music',
    color: '#42A5F5',
    type: 'Ambient',
    badge: 'Blue',
  },
  Nature: {
    name: 'Nature',
    icon: 'tree',
    color: '#66BB6A',
    type: 'Ambient',
    badge: 'Green',
  },
  Animals: {
    name: 'Animals',
    icon: 'paw',
    color: '#8BC34A',
    type: 'Ambient',
    badge: 'Lime',
  },
  Domestic: {
    name: 'Domestic',
    icon: 'home',
    color: '#9CCC65',
    type: 'Ambient',
    badge: 'Lime',
  },
  'Body Sounds': {
    name: 'Body Sounds',
    icon: 'lungs',
    color: '#7CB342',
    type: 'Ambient',
    badge: 'Lime',
  },

  // Both/Other
  Speech: {
    name: 'Speech',
    icon: 'message-circle',
    color: '#AB47BC',
    type: 'Both',
    badge: 'Purple',
  },
  Other: {
    name: 'Other',
    icon: 'help-circle',
    color: '#9E9E9E',
    type: 'Unclassified',
    badge: 'Gray',
  },
};

// dB Thresholds (ALIGNED WITH FLUTTER APP)
export const DB_THRESHOLDS = {
  low: 50, // < 50 dB = Quiet
  moderate: 70, // 50-70 dB = Moderate
  // > 70 dB = Loud
};

// Get noise level label and color based on dB
export function getNoiseLevel(decibels: number): {
  level: 'low' | 'moderate' | 'high';
  label: string;
  color: string;
} {
  if (decibels < DB_THRESHOLDS.low) {
    return {
      level: 'low',
      label: 'Quiet',
      color: FLUTTER_THEME_COLORS.lowNoise,
    };
  }
  if (decibels <= DB_THRESHOLDS.moderate) {
    return {
      level: 'moderate',
      label: 'Moderate',
      color: FLUTTER_THEME_COLORS.moderateNoise,
    };
  }
  return {
    level: 'high',
    label: 'Loud',
    color: FLUTTER_THEME_COLORS.highNoise,
  };
}
