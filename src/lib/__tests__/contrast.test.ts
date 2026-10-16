import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextColor, relativeLuminance } from '../contrast';
import { NOISE_BANDS } from '../noiseBands';
import { FLUTTER_THEME_COLORS } from '@/utils/themeConstants';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#4CAF50', '#4CAF50')).toBeCloseTo(1, 5);
  });

  it('treats a malformed or missing colour as black', () => {
    expect(relativeLuminance('not-a-colour')).toBe(0);
    expect(relativeLuminance(undefined as unknown as string)).toBe(0);
  });
});

describe('readableTextColor', () => {
  it('picks the better of white and the dark ink for every theme colour', () => {
    const picked = Object.fromEntries(
      Object.entries(FLUTTER_THEME_COLORS.themeColors).map(([name, hex]) => [
        name,
        readableTextColor(hex),
      ])
    );
    expect(picked).toEqual({
      Purple: '#FFFFFF',
      Green: '#1E1932',
      Blue: '#1E1932',
      Orange: '#1E1932',
      Pink: '#FFFFFF',
      Teal: '#1E1932',
      Red: '#1E1932',
      Indigo: '#FFFFFF',
    });
  });
});

describe('noise band badges', () => {
  it('every band text colour reaches WCAG AA (4.5:1) on its band colour', () => {
    for (const band of Object.values(NOISE_BANDS)) {
      expect(contrastRatio(band.textColor, band.color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('each band has its own glyph shape', () => {
    const shapes = Object.values(NOISE_BANDS).map((band) => band.glyph);
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
