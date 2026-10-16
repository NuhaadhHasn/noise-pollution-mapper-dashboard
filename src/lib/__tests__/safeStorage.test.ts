import { describe, expect, it } from 'vitest';
import { createSafeStorage } from '@/lib/safeStorage';

function memoryStore(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

function throwingStore(): Storage {
  const fail = () => {
    throw new DOMException('blocked', 'SecurityError');
  };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail };
}

describe('createSafeStorage with a working store', () => {
  it('reads, writes and removes', () => {
    const store = memoryStore();
    const storage = createSafeStorage(() => store);
    expect(storage.get('k')).toBeNull();
    expect(storage.set('k', 'v')).toBe(true);
    expect(storage.get('k')).toBe('v');
    expect(storage.remove('k')).toBe(true);
    expect(storage.get('k')).toBeNull();
  });
});

describe('createSafeStorage with a store that throws', () => {
  it('reads as nothing stored, and reports failed writes and removals', () => {
    const storage = createSafeStorage(throwingStore);
    expect(storage.get('k')).toBeNull();
    expect(storage.set('k', 'v')).toBe(false);
    expect(storage.remove('k')).toBe(false);
  });

  it('survives the store itself being unreachable (property access throws)', () => {
    const storage = createSafeStorage(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(storage.get('k')).toBeNull();
    expect(storage.set('k', 'v')).toBe(false);
    expect(storage.remove('k')).toBe(false);
  });

  it('reports a full quota as a failed write', () => {
    const full = memoryStore();
    full.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const storage = createSafeStorage(() => full);
    expect(storage.set('k', 'v')).toBe(false);
  });
});
