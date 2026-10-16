import { describe, expect, it } from 'vitest';
import { authorLabel } from '@/lib/authorLabel';

describe('authorLabel', () => {
  it('returns a label the app already masked, unchanged', () => {
    expect(authorLabel('abc***@example.com')).toBe('abc***@example.com');
    expect(authorLabel('ab***@example.com')).toBe('ab***@example.com');
  });

  it('returns a display name unchanged', () => {
    expect(authorLabel('Nuhaadh')).toBe('Nuhaadh');
    expect(authorLabel('Jo Smith')).toBe('Jo Smith');
  });

  it('passes Deleted User and Anonymous through', () => {
    expect(authorLabel('Deleted User')).toBe('Deleted User');
    expect(authorLabel('Anonymous')).toBe('Anonymous');
  });

  it('returns Anonymous when the label is missing, blank or not a string', () => {
    expect(authorLabel(undefined)).toBe('Anonymous');
    expect(authorLabel(null)).toBe('Anonymous');
    expect(authorLabel('')).toBe('Anonymous');
    expect(authorLabel('   ')).toBe('Anonymous');
    expect(authorLabel(42 as unknown as string)).toBe('Anonymous');
  });

  it('re-masks a raw address to two characters plus ***', () => {
    expect(authorLabel('lochana@example.com')).toBe('lo***@example.com');
    expect(authorLabel('john+tag@sub.example.co.uk')).toBe('jo***@sub.example.co.uk');
  });

  it('keeps a one-character local part', () => {
    expect(authorLabel('a@example.com')).toBe('a***@example.com');
  });

  it('never returns the full local part of a raw address', () => {
    expect(authorLabel('lochana@example.com')).not.toContain('lochana');
  });

  it('is idempotent', () => {
    const once = authorLabel('lochana@example.com');
    expect(authorLabel(once)).toBe(once);
  });

  it('trims surrounding whitespace', () => {
    expect(authorLabel('  abc***@example.com ')).toBe('abc***@example.com');
    expect(authorLabel(' lochana@example.com')).toBe('lo***@example.com');
  });
});
