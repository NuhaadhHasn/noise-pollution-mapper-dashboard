/**
 * WCAG 2.x contrast helpers (a11y-5). Pure, no imports.
 */

const WHITE = '#FFFFFF';
// The dashboard's dark navy (FLUTTER_THEME_COLORS.darkBackground / textDark).
const INK = '#1E1932';

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a #RRGGBB colour. Anything else (even a missing value) counts as black. */
export function relativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(typeof hex === 'string' ? hex.trim() : '');
  if (match === null) return 0;
  const n = parseInt(match[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

/** Contrast ratio between two #RRGGBB colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * White or the dark ink, whichever reads better on `background`. Used for the
 * primary-button foreground, so Orange, Green, Blue, Teal and Red themes get
 * dark text and Purple, Pink and Indigo keep white.
 */
export function readableTextColor(background: string): string {
  return contrastRatio(WHITE, background) >= contrastRatio(INK, background) ? WHITE : INK;
}
