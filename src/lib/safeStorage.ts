/**
 * localStorage that never throws (bug-11).
 *
 * Reading or writing localStorage throws in a private window, with site data
 * blocked, with storage disabled by policy, or when the quota is full. An
 * unguarded call in a provider's first render takes the whole app down, so
 * every localStorage use in src goes through this helper. A failed read is
 * "nothing stored" (null); a failed write or removal is reported by the return
 * value and otherwise ignored, because a preference that cannot be saved must
 * not break the page.
 *
 * Pure module: the store is resolved lazily, so it is unit-tested with a fake.
 */

export interface SafeStorage {
  /** The stored string, or null when absent or storage is unavailable. */
  get(key: string): string | null;
  /** True when the value was stored. */
  set(key: string, value: string): boolean;
  /** True when the call succeeded (also true when the key was absent). */
  remove(key: string): boolean;
}

/**
 * Wraps a store. `resolve` is called on every use, because even reading the
 * `localStorage` property can throw (a SecurityError when storage is blocked).
 */
export function createSafeStorage(resolve: () => Storage): SafeStorage {
  return {
    get(key) {
      try {
        return resolve().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        resolve().setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        resolve().removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const safeStorage: SafeStorage = createSafeStorage(() => window.localStorage);
