import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as localDb from '@/utils/db';
import * as syncManager from '@/utils/syncManager';
import type { NoiseReading } from '@/types/NoiseReading';

/**
 * ReadingsProvider - the one owner of the IndexedDB readings cache.
 *
 * Mounted ONCE in App.tsx (inside AuthProvider, around BrowserRouter), so the
 * cache is read once and synced once per session for every page, chart and
 * map layer, instead of once per component (perf-2). It is deliberately not
 * mounted per route: each route has its own ProtectedRoute element, which
 * would remount it on every navigation. Consumers call useSyncedReadings().
 */

export interface ReadingsContextValue {
  /** Every cached reading (all users). Re-read from IndexedDB after each sync. */
  readings: NoiseReading[];
  /**
   * True until there is something true to show: the first IndexedDB read
   * found rows, or (empty cache = not downloaded yet) the first sync settled.
   */
  loading: boolean;
  /** True while a Firestore sync is running. */
  syncing: boolean;
  /** The last failed cache read or sync; cleared when the next sync starts. */
  error: Error | null;
  /** Wall-clock time of the last successful sync. Display only. */
  lastSync: Date | null;
  /** True once a sync has succeeded in this session. */
  synced: boolean;
  /** Delta sync now; shares a sync already running. Never rejects: failures land in `error`. */
  refresh: () => Promise<void>;
  /** Re-download every reading and swap the cache in one step. Rejects on failure; the old cache stays. */
  forceFullSync: () => Promise<{ count: number }>;
}

interface SessionState {
  /** The account this state belongs to. State of any other account is never exposed. */
  uid: string | null;
  readings: NoiseReading[];
  loaded: boolean;
  syncing: boolean;
  error: Error | null;
  lastSync: Date | null;
  synced: boolean;
}

type SessionChanges =
  | Partial<SessionState>
  | ((previous: SessionState) => Partial<SessionState>);

const NO_READINGS: NoiseReading[] = [];

function emptySession(uid: string | null): SessionState {
  return {
    uid,
    readings: NO_READINGS,
    loaded: false,
    syncing: false,
    error: null,
    lastSync: null,
    synced: false,
  };
}

function toError(err: unknown, fallback: string): Error {
  return err instanceof Error ? err : new Error(fallback);
}

// eslint-disable-next-line react-refresh/only-export-components
export const ReadingsContext = createContext<ReadingsContextValue | null>(null);

interface ReadingsProviderProps {
  children: ReactNode;
}

export function ReadingsProvider({ children }: ReadingsProviderProps) {
  const { user } = useAuth();
  // The single gate for downloading readings. Cluster 08.1 (D1-A) changes
  // this one expression to `!!user && role === 'admin'`.
  const enabled = !!user;
  const uid = enabled && user ? user.uid : null;

  const [session, setSession] = useState<SessionState>(() => emptySession(null));
  // Bumped when the account changes or the provider unmounts: async work
  // started under an older generation drops its result.
  const generationRef = useRef(0);
  // The account the current generation loads for (read by refresh()).
  const uidRef = useRef<string | null>(null);

  const update = useCallback(
    (generation: number, forUid: string, changes: SessionChanges) => {
      if (generation !== generationRef.current) {
        return;
      }
      setSession((previous) => {
        const base = previous.uid === forUid ? previous : emptySession(forUid);
        return { ...base, ...(typeof changes === 'function' ? changes(base) : changes) };
      });
    },
    [],
  );

  const runSync = useCallback(
    async (full: boolean): Promise<syncManager.SyncResult> => {
      const forUid = uidRef.current;
      if (forUid === null) {
        throw new Error('Sign in to sync readings');
      }
      const generation = generationRef.current;
      update(generation, forUid, { syncing: true, error: null });
      try {
        const result = full
          ? await syncManager.forceFullSync()
          : await syncManager.syncNewReadings();
        // Always re-read: another tab may have synced rows into the shared cache.
        const readings = await localDb.getAllReadings();
        update(generation, forUid, {
          readings,
          loaded: true,
          syncing: false,
          synced: true,
          lastSync: result.lastSync,
        });
        return result;
      } catch (err) {
        update(generation, forUid, {
          loaded: true,
          syncing: false,
          error: toError(err, 'Failed to sync readings'),
        });
        throw err;
      }
    },
    [update],
  );

  const refresh = useCallback(async () => {
    try {
      await runSync(false);
    } catch {
      // Already in `error`; the UI renders it.
    }
  }, [runSync]);

  const forceFullSync = useCallback(async () => {
    const result = await runSync(true);
    return { count: result.totalReadings };
  }, [runSync]);

  // Whenever an account starts: read the cache, then run one background sync.
  useEffect(() => {
    uidRef.current = uid;
    if (uid === null) {
      return;
    }
    const generation = generationRef.current;
    void (async () => {
      try {
        // 1. The cache: instant, 0 Firestore reads.
        const [cached, status] = await Promise.all([
          localDb.getAllReadings(),
          syncManager.getSyncStatus(),
        ]);
        update(generation, uid, (previous) =>
          previous.synced
            ? {} // a sync already delivered fresher rows
            : {
                readings: cached,
                // An empty cache means "not downloaded yet", not "no data":
                // stay loading until the first sync settles.
                loaded: previous.loaded || cached.length > 0,
                lastSync: status.lastSync,
              },
        );
      } catch (err) {
        update(generation, uid, {
          loaded: true,
          error: toError(err, 'Failed to read the readings cache'),
        });
        return;
      }
      if (generation !== generationRef.current) {
        return;
      }
      // 2. One background sync for the whole app.
      try {
        await runSync(false);
      } catch {
        // Already in `error`.
      }
    })();
    return () => {
      generationRef.current += 1;
    };
  }, [uid, update, runSync]);

  // bug-4: a real auto-sync. While an account is signed in, one delta sync
  // every AUTO_SYNC_INTERVAL_MS, plus one when the tab becomes visible again
  // and the last successful sync (from any tab: it is read from IndexedDB) is
  // older than RESYNC_ON_VISIBLE_AFTER_MS. Each shares a sync already running.
  useEffect(() => {
    if (uid === null) {
      return;
    }
    const syncInBackground = () => {
      void runSync(false).catch(() => {
        // Already in `error`.
      });
    };
    const interval = window.setInterval(syncInBackground, syncManager.AUTO_SYNC_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void syncManager
        .getSyncStatus()
        .then(({ lastSync }) => {
          if (
            lastSync === null ||
            Date.now() - lastSync.getTime() > syncManager.RESYNC_ON_VISIBLE_AFTER_MS
          ) {
            syncInBackground();
          }
        })
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [uid, runSync]);

  const current = session.uid === uid ? session : null;
  const value = useMemo<ReadingsContextValue>(
    () => ({
      readings: current ? current.readings : NO_READINGS,
      loading: uid !== null && !(current && current.loaded),
      syncing: current ? current.syncing : false,
      error: current ? current.error : null,
      lastSync: current ? current.lastSync : null,
      synced: current ? current.synced : false,
      refresh,
      forceFullSync,
    }),
    [current, uid, refresh, forceFullSync],
  );

  return <ReadingsContext.Provider value={value}>{children}</ReadingsContext.Provider>;
}
