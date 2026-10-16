import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

// Smoke test of a pure module. It proves the runner, the '@' alias and the
// node environment work, without touching Firebase.
describe('cn', () => {
  it('joins class names with a single space', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('returns an empty string when given nothing', () => {
    expect(cn()).toBe('')
  })

  it('skips falsy values', () => {
    expect(cn('a', undefined, null, false, '', 'b')).toBe('a b')
  })

  it('accepts arrays and conditional objects', () => {
    expect(cn(['a', { b: true, c: false }], 'd')).toBe('a b d')
  })

  it('lets the later conflicting Tailwind class win', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
  })

  it('keeps Tailwind classes that do not conflict', () => {
    expect(cn('p-2', 'px-4')).toBe('p-2 px-4')
    expect(cn('text-red-500', 'text-sm')).toBe('text-red-500 text-sm')
  })
})
