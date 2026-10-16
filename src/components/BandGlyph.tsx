import { noiseBand, type BandGlyphShape } from '@/lib/noiseBands';

interface BandGlyphProps {
  shape: BandGlyphShape;
  className?: string;
}

/** The band's shape, drawn in the surrounding text colour. Decorative: the band label is always next to it. */
export function BandGlyph({ shape, className }: BandGlyphProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="10"
      height="10"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {shape === 'circle' && <circle cx="8" cy="8" r="5" />}
      {shape === 'square' && <rect x="3" y="3" width="10" height="10" />}
      {shape === 'triangle' && <path d="M8 2.5 L14 13.5 H2 Z" />}
    </svg>
  );
}

/** dB badge: band colour, AA text colour, glyph and the band word, e.g. "58.2 dB (Moderate)". */
export function DbBadge({ decibels }: { decibels: number }) {
  const band = noiseBand(decibels);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold"
      style={{ backgroundColor: band.color, color: band.textColor }}
    >
      <BandGlyph shape={band.glyph} />
      {decibels.toFixed(1)} dB ({band.label})
    </span>
  );
}
