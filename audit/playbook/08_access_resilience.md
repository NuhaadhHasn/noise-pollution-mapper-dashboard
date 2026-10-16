# Playbook 08 — Access Control, Render Resilience & Login

This cluster covers three defects:

- **Who may use the research dashboard.** Any account that self-registers in the app can open the dashboard and export every reading with one click.
- **What happens when one reading cannot be rendered.** Only the maps have an error boundary. One malformed document therefore blanks `/dashboard` and `/analytics` for every viewer.
- **The login form.** It shows raw Firebase error strings with no live region. The password toggle is unlabeled and cannot be reached by keyboard. There is no heading, no `autoComplete` and no password reset.

**Execute steps in order. Each step is exactly one commit. Gate every step on `npx tsc -b` (0 errors) and on `npx eslint <the files the step changed>` (0 errors, no new warnings). Step 3 also runs `npx vitest run src/lib/__tests__/authErrors.test.ts`. Run `npm test` and `npm run build` ONCE, at the end of Step 3 (master playbook §1.3).**

All BEFORE blocks below were copied verbatim from the working tree on 2026-10-15 (dashboard HEAD `353bbdd`), with one class of exception, which each such block marks "as left by NN.k".

- **Why the exception exists.** Before this cluster runs, cluster 05 edits `AnalyticsPage.tsx`, `DashboardPage.tsx`, `LoginPage.tsx` and `AuthContext.tsx` and creates `ReadingsContext.tsx`; cluster 07 also edits `AnalyticsPage.tsx`. A block in a region they changed is their AFTER text, not HEAD text, so it does NOT match a checkout of `353bbdd`.
- **Blocks marked "at HEAD".** These sit in regions no earlier cluster touches, so they match both HEAD and the post-07 tree. Their line numbers are HEAD numbers and drift; match on text only.
- **How every block was checked.** The 05 and 07 specs, then this one, were applied in order to a scratch copy of these files. Each BEFORE was asserted to occur exactly once in its file at that point. This was done for both the D1(A) path and the D1(B) path. The final files were then parsed without syntax errors.
- **If a BEFORE block does not match, STOP.** Check master §4.5, §4.9 and §4.10, then apply the step semantically. Never revert another cluster's work.

Environment facts (verified):

- **Line endings.** Dashboard HEAD is `353bbdd`. Every file this spec touches is LF in the index and in the working tree (`git ls-files --eol`: `i/lf w/lf`). Write the new files with LF.
  - Two lines inside the D1(B) block 1B-g end in a space: `<a ` and the `href="mailto:…" ` line (`LoginPage.tsx:258-259`). The spaces are part of the anchor.
- **Versions** (`package.json` / installed):
  - `react` and `react-dom` `^19.2.0` (19.2.4).
  - `react-router-dom` `^7.13.1` (7.13.1); it provides `useLocation` and `Navigate`.
  - `firebase` `^12.10.0` (12.10.0). `doc` and `getDoc` come from `firebase/firestore`; `sendPasswordResetEmail` and `signInWithEmailAndPassword` come from `firebase/auth`.
  - `lucide-react` `^0.575.0` (0.575.0). `ShieldAlert`, `LogOut`, `Mail`, `RefreshCcw` and `AlertTriangle` all exist under `node_modules/lucide-react/dist/esm/icons/`.
  - `typescript` `~5.9.3` (5.9.3); `tailwindcss` `^4.2.1`; `eslint-plugin-react-hooks` `^7.0.1` (7.0.1); `eslint-plugin-react-refresh` `^0.4.24` (0.4.26).
  - After 01.1: `vitest` 4.1.11, with `environment: 'node'`, include glob `src/**/*.test.{ts,tsx}` and no jsdom.
- **React 19 error handling.**
  - A render error that no class boundary catches unmounts the whole root. That is the verified sec-1 mechanism.
  - Boundaries do NOT catch errors thrown in event handlers or promise callbacks. The export `onClick` sink (`exportHelpers.ts:73`) is therefore closed by 04.3's `normalizeReading()`, not here.
- **`eslint.config.js`.**
  - It extends `reactHooks.configs.flat.recommended`, which includes the React Compiler rules. `set-state-in-effect` forbids a synchronous setState in an effect body, so the role read below sets state only inside its `getDoc` promise callbacks.
  - It extends `reactRefresh.configs.vite`, which runs `only-export-components`. `ErrorBoundary.tsx` will export only components: the class, `CardBoundary` and the default export.
- **`tsconfig.app.json`.**
  - `strict: false`, `verbatimModuleSyntax: true`, `erasableSyntaxOnly: true`.
  - `include: ["src"]`, so `tsc -b` type-checks the new test file.
  - Cluster 12 later enables `strict`, so the code below narrows nulls explicitly.
- **`src/config/firebase.ts`** exports `auth: any` and `db: any`. 12.1 types them as `Auth` and `Firestore`; nothing below depends on `any`.
- **Theme.**
  - `ThemeProvider` puts `dark` or `light` on `<html>` (`ThemeContext.tsx:22-32`), and `index.css:9` declares `@custom-variant dark (&:is(.dark *))`. `dark:` classes therefore work, as the existing `ErrorBoundary.tsx` already relies on.
  - The root fallback in `main.tsx` sits OUTSIDE `ThemeProvider`, `AuthProvider` and `BrowserRouter`. It must not call `useTheme()`, `useAuth()` or any router hook (master §4.10).
- **UI primitives.**
  - `src/components/ui/button.tsx` supports `asChild` (radix `Slot.Root`). Its base classes add `gap-2` and size SVG children to `size-4`.
  - `CardTitle` (`ui/card.tsx:31-38`) renders a `<div>`. Tailwind's preflight resets `h1` to `font-size: inherit; font-weight: inherit; margin: 0`, so an `<h1>` nested inside it looks unchanged.
- **Routing.**
  - Every route has its own `ProtectedRoute` element (`routes.tsx:22-45`). React still reconciles the matched element in place, so `ProtectedRoute` and `Layout` keep their state across navigation (the sidebar state survives it). That is why the `Layout` boundary is keyed by path.
  - The providers are mounted once in `App.tsx`: `ThemeProvider` › `AuthProvider` › `ReadingsProvider` › `BrowserRouter` (05.3c).
- **Production** (the 2026-10-16 probe):
  - `users` has 5 docs. Exactly one has `role: 'admin'` (the owner).
  - Firebase Auth has 7 users and 0 custom claims. 2 of those Auth users have no `users` doc.
- **Rules.**
  - Today `users/{userId}` read is `isOwner(userId) || isAdmin()` (`firestore.rules:157`). After 02.4 it is owner-only. Either way, the caller's own `getDoc` is allowed, and a missing doc is a normal not-found result, not an error.
  - `create` forbids a `role` field and `update` requires `role` unchanged (`firestore.rules:163-173`). 02.4 keeps both, and they are what make this gate honest.
- **Read-only browser** (master §2.4). This cluster adds:
  - one Firestore READ, a `getDoc` of the caller's own profile;
  - one Auth call, `sendPasswordResetEmail`.
  
  It adds no Firestore write, no `onSnapshot`, no query and no index.

---

## Owner decision D1 (settle before Step 1; master §3.4)

| Option | Gate | `ReadingsProvider` | Login copy | Sub-steps |
|---|---|---|---|---|
| **(A) Admin-only — default** | `ProtectedRoute` renders a no-access page unless the signed-in account's own `users/{uid}.role === 'admin'` | `enabled = !!user && role === 'admin'`, so non-admins never download readings | "Sign in with a dashboard administrator account"; "Need dashboard access? Request access" (the mailto stays) | 1a–1i |
| (B) Community-wide viewing | `ProtectedRoute` is unchanged | stays `!!user` | "Sign in with your Noise Mapper app account"; the "Request access" link is removed | 1a–1d, then 1B-a–1B-g instead of 1e–1i |

Under both options:
- The role is read the same way (1a–1d).
- **Granting another admin is manual action M3** (console or Admin SDK, after an owner "yes"). Browser code never grants it.
- 02.4 makes `users` owner-read only. Nothing in this cluster lists `users`.

**Tell the owner before pushing a D1(A) build.** It locks out every non-admin at once (master §4.15).

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| sec-4 | UNVERIFIED (Medium, confidence medium; cross-repo) | `ProtectedRoute.tsx:25` `if (!isAuthenticated)` is the only gate, and nothing in `src` checks a role. So any account that can sign up in the app, or through the Auth REST API with the public web key, can open the dashboard. From there it can export every reading with coordinates in one click (`AnalyticsPage.tsx:121`, `:132`). Meanwhile the copy implies gated access (`LoginPage.tsx:149` "research dashboard", `:258-264` "Request access"). The rules allow these reads through the SDK on purpose, because the app's community feed needs them. This is therefore defence in depth and an honest access model, not a rules bypass. Step 1. |
| sec-1 | CONFIRMED (High; cross-repo) — render-side half only | A `noise_readings` doc with a map-typed `soundClass` throws at `CategoryChart.tsx:220` as a React child. The only boundaries wrap the maps (`DashboardPage.tsx:113`, `MapPage.tsx:145`), so React 19 unmounts the root, and `/dashboard` and `/analytics` go blank for every viewer. `GlobalErrorPage.tsx` is imported nowhere, calls `useNavigate()` (`:2`, `:11`) and claims "our team has been notified" (`:36`). 02.2 closes the write path (rules `validReading()`) and 04.3 closes the ingest path (`normalizeReading()`). Step 2 adds the render-side defence: a root boundary, a `Layout` boundary and per-card boundaries. |
| a11y-7 | UNVERIFIED (Medium, confidence high) | `LoginPage.tsx:44-45` shows `err.message` verbatim ("Firebase: Error (auth/invalid-credential).") in a `<p>` with no live region (`:228-232`). The password reveal toggle has `tabIndex={-1}` and only an icon (`:198-205`). The title is a `<div>` (`CardTitle`), so the page has no heading. The inputs have no `autoComplete`, and there is no password reset. Step 3. |

Full finding text and verifier evidence: grep the IDs in `audit/00_MASTER_AUDIT_REPORT.md`, `audit/05_SECURITY_AUDIT.md` (sec-1, sec-4) and `audit/07_ACCESSIBILITY_AUDIT.md` (a11y-7).

---

## Pre-reading

Open these files before touching anything. Read them fresh from disk, because clusters 05 and 07 have already changed several of them.

1. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md`: §2 (conventions 1, 4, 6 and 13), §3.4 (D1), §4.5 (provider placement and role gating), §4.9 (pages and login composites), §4.10 (root boundary placement), §4.15 (push timing) and the M3 entry in §5.
2. `audit/playbook/05_sync_engine_provider.md`:
   - Step 3: 3a (`ReadingsContext.tsx`, full contents) and 3c (`App.tsx`).
   - Step 4: 4c–4f (`AnalyticsPage.tsx`).
   - Step 5: 5a–5e (`DashboardPage.tsx`).
   - Step 7: 7f–7k (`ReadingsContext.tsx`, `AuthContext.tsx`, `LoginPage.tsx`). Sub-step 1g below anchors on 7f's AFTER text.
3. `audit/playbook/07_export_privacy.md` Step 2: 2p–2u (`AnalyticsPage.tsx`). 2u turns the table line into `<DataTable data={readings} />`.
4. `src/contexts/AuthContext.tsx` (whole), `src/contexts/ReadingsContext.tsx` (whole, post-05), `src/components/ProtectedRoute.tsx` (whole), `src/routes.tsx`, and `src/App.tsx` (post-05.3).
5. `src/main.tsx`, `src/components/ErrorBoundary.tsx`, `src/components/GlobalErrorPage.tsx`, and `src/components/Layout.tsx` `:1-42` and `:278-283`.
6. `src/pages/DashboardPage.tsx` and `src/pages/AnalyticsPage.tsx`, whole, post-05/07.
7. `src/pages/LoginPage.tsx` (whole, post-05.7), `src/components/ui/card.tsx:31-38`, `src/components/ui/input.tsx` and `src/components/ui/button.tsx`.
8. `firestore.rules:143-179`, the `users` rules. After 02.4 the `isAdmin()` clause is gone and the `role` guards remain.
9. `vitest.config.ts` and `src/lib/__tests__/utils.test.ts` from cluster 01, for the test layout and style.

---

## Steps

### Step 1 — sec-4: Admin role gate

**Goal:**
- `AuthContext` reads the signed-in account's OWN `users/{uid}` document once per sign-in. It exposes `role: string | null`, `roleLoading`, `roleError` and `retryRole()`.
- A missing document or field means `null`. A failed read is reported as `roleError` and is never treated as access.
- **Under D1(A):**
  - `ProtectedRoute` waits for `roleLoading`. Then, unless `role === 'admin'`, it renders a new `NoAccessPage`, which offers Request access (or Try again when the check failed) and Sign out.
  - The `ReadingsProvider` gate becomes `!!user && role === 'admin'`, so a non-admin never downloads a reading.
  - The login copy says the dashboard is for administrators.
- **Under D1(B):** only the CSV and JSON export buttons require the admin role, and the login copy drops "Request access".

**Files:**
- Both options: `src/contexts/AuthContext.tsx`.
- D1(A): `src/components/NoAccessPage.tsx` (new), `src/components/ProtectedRoute.tsx` (whole file rewritten), `src/contexts/ReadingsContext.tsx` and `src/pages/LoginPage.tsx`.
- D1(B): `src/pages/AnalyticsPage.tsx` and `src/pages/LoginPage.tsx`.

**Exact changes**

1a. `src/contexts/AuthContext.tsx`: imports. (Both options.)

BEFORE (`src/contexts/AuthContext.tsx`, lines 1-7 at HEAD `353bbdd`, verbatim):
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth } from '@/config/firebase';
```

AFTER:
```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
```

1b. Same file: the context type. (Both options.)

BEFORE (`src/contexts/AuthContext.tsx`, lines 9-14 at HEAD `353bbdd`, verbatim):
```tsx
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}
```

AFTER:
```tsx
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * sec-4: the `role` field of the signed-in account's OWN users/{uid}
   * document. null when signed out, while loading, after a failed read, and
   * when the document or the field is missing. Only 'admin' opens the
   * dashboard (D1). It is granted manually (master M3), never by this app.
   */
  role: string | null;
  /** True from sign-in until the role read has answered. */
  roleLoading: boolean;
  /** The last role read failed (for example offline). Never treated as access. */
  roleError: Error | null;
  /** Read the role again (the no-access page's "Try again"). */
  retryRole: () => void;
  signOut: () => Promise<void>;
}
```

1c. Same file: the role read. (Both options.)

BEFORE (`src/contexts/AuthContext.tsx`, lines 22-35 at HEAD `353bbdd`, verbatim):
```tsx
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      setUser(user);
      setIsLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);
```

AFTER:
```tsx
/** One answer of the role read, tagged with the account and the request it answers. */
interface RoleAnswer {
  uid: string;
  request: number;
  role: string | null;
  error: Error | null;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // sec-4: every auth change and every retry bumps the request number. Only an
  // answer for the current account AND the current request counts, so a role
  // is never carried over to another account or to another sign-in.
  const [roleRequest, setRoleRequest] = useState(0);
  const [roleAnswer, setRoleAnswer] = useState<RoleAnswer | null>(null);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      setUser(user);
      setRoleRequest((request) => request + 1);
      setIsLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const uid = user ? user.uid : null;

  // sec-4: read the role from the caller's OWN profile. This is an owner get,
  // allowed by firestore.rules before and after 02.4, and a read: the browser
  // still writes nothing. State is set only in the promise callbacks.
  useEffect(() => {
    if (uid === null) {
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'users', uid))
      .then((snapshot) => {
        if (cancelled) {
          return;
        }
        // The 2 Auth-only accounts have no users doc; app-created docs have no role.
        const role: unknown = snapshot.exists() ? snapshot.get('role') : null;
        setRoleAnswer({
          uid,
          request: roleRequest,
          role: typeof role === 'string' ? role : null,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        console.error('[Auth] Could not read the dashboard role:', err);
        setRoleAnswer({
          uid,
          request: roleRequest,
          role: null,
          error: err instanceof Error ? err : new Error('Could not check dashboard access'),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [uid, roleRequest]);

  const currentRole =
    roleAnswer !== null && roleAnswer.uid === uid && roleAnswer.request === roleRequest
      ? roleAnswer
      : null;
  const roleLoading = uid !== null && currentRole === null;

  const retryRole = useCallback(() => {
    setRoleRequest((request) => request + 1);
  }, []);
```

Placement notes:
- `RoleAnswer` is module-level and not exported. Adding a non-exported interface does not trip `react-refresh/only-export-components`.
- The `signOut` function directly below this block (HEAD `:37-44`) was rewritten by 05.7h. It is untouched here; this block ends at the auth effect's `}, []);`.

1d. Same file: the context value. (Both options.)

BEFORE (`src/contexts/AuthContext.tsx`, lines 46-51 at HEAD `353bbdd`, verbatim):
```tsx
  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    signOut,
  };
```

AFTER:
```tsx
  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    role: currentRole ? currentRole.role : null,
    roleLoading,
    roleError: currentRole ? currentRole.error : null,
    retryRole,
    signOut,
  };
```

**Under D1(B), skip 1e–1i and go to 1B-a.**

1e. New file `src/components/NoAccessPage.tsx`, full contents (D1(A) only):
```tsx
import { useState } from 'react';
import { LogOut, Mail, RefreshCcw, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';

interface NoAccessPageProps {
  /**
   * 'no-role': signed in, but the account's users/{uid}.role is not 'admin'.
   * 'check-failed': the role could not be read (for example offline).
   */
  reason: 'no-role' | 'check-failed';
}

/**
 * sec-4 (D1-A): ProtectedRoute shows this instead of any dashboard page to a
 * signed-in account that is not a dashboard administrator. Nothing behind it
 * renders and the ReadingsProvider stays idle, so no reading is downloaded.
 * Access is granted manually (users/{uid}.role = 'admin', master M3).
 */
export default function NoAccessPage({ reason }: NoAccessPageProps) {
  const { user, signOut, retryRole } = useAuth();
  const { isDarkMode, getCardColor, getTextColor } = useTheme();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const checkFailed = reason === 'check-failed';

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      // ProtectedRoute redirects to /login as soon as `user` is null.
      await signOut();
    } catch {
      setIsSigningOut(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl p-6 sm:p-8 text-center"
        style={{
          backgroundColor: getCardColor(),
          borderColor: isDarkMode ? '#4A4458' : '#E0E0E0',
        }}
      >
        <div className="mx-auto mb-4 w-14 h-14 flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <ShieldAlert className="w-7 h-7 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold mb-2" style={{ color: getTextColor() }}>
          {checkFailed ? 'Could not check your access' : 'No dashboard access'}
        </h1>
        <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {checkFailed
            ? 'The dashboard could not confirm your access. Check your connection and try again.'
            : 'This research dashboard is limited to administrators. Your Noise Mapper app account is not affected.'}
        </p>
        {user?.email && (
          <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Signed in as {user.email}
          </p>
        )}
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          {checkFailed ? (
            <Button onClick={retryRole}>
              <RefreshCcw aria-hidden="true" />
              Try again
            </Button>
          ) : (
            <Button asChild variant="outline">
              <a href="mailto:admin@noisemapper.lk?subject=Dashboard Access Request">
                <Mail aria-hidden="true" />
                Request access
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => void handleSignOut()} disabled={isSigningOut}>
            <LogOut aria-hidden="true" />
            {isSigningOut ? 'Signing out...' : 'Sign out'}
          </Button>
        </div>
      </div>
    </main>
  );
}
```

Placement notes:
- The page renders inside `AppRoutes`' themed background `<div>` (`routes.tsx:13-16`) and outside `Layout`. Its `<main>` is therefore the only main landmark on the page.
- It uses `useAuth` and `useTheme`. Both providers wrap every route.
- The mailto target and subject are the same as `LoginPage.tsx:259`.

1f. `src/components/ProtectedRoute.tsx`: replace the whole file. (D1(A) only.)

BEFORE (`src/components/ProtectedRoute.tsx`, D1(A) only, lines 1-31 at HEAD `353bbdd`, verbatim; the WHOLE file):
```tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Wrap authenticated pages in Layout
  return <Layout>{children}</Layout>;
}
```

AFTER (the complete file):
```tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import NoAccessPage from '@/components/NoAccessPage';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, role, roleLoading, roleError } = useAuth();

  // Show loading while checking auth, then while reading the dashboard role
  if (isLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">{isLoading ? 'Loading...' : 'Checking access...'}</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // sec-4 (D1-A): the research dashboard is for administrators only. Any app
  // account can sign in to Firebase, so signing in is not enough: the account's
  // OWN users/{uid}.role must be 'admin'. A failed role read never grants access.
  if (roleError) {
    return <NoAccessPage reason="check-failed" />;
  }
  if (role !== 'admin') {
    return <NoAccessPage reason="no-role" />;
  }

  // Wrap authenticated pages in Layout
  return <Layout>{children}</Layout>;
}
```

Placement note: `roleLoading` is false whenever nobody is signed in, so a signed-out visitor still goes straight to `<Navigate to="/login" replace />`.

1g. `src/contexts/ReadingsContext.tsx`: the download gate. (D1(A) only.)

BEFORE (`src/contexts/ReadingsContext.tsx`, D1(A) only, as left by 05.7f, verbatim):
```tsx
export function ReadingsProvider({ children }: ReadingsProviderProps) {
  const { user, isLoading: authLoading } = useAuth();
  // The signed-in account, whether or not it may download readings. The cache
  // purge (priv-4) follows this identity, never the download gate below.
  const authUid = user ? user.uid : null;
  // The single gate for downloading readings. Cluster 08.1 (D1-A) changes
  // this one expression to `!!user && role === 'admin'`.
  const enabled = !!user;
  const uid = enabled ? authUid : null;
```

AFTER:
```tsx
export function ReadingsProvider({ children }: ReadingsProviderProps) {
  const { user, isLoading: authLoading, role } = useAuth();
  // The signed-in account, whether or not it may download readings. The cache
  // purge (priv-4) follows this identity, never the download gate below.
  const authUid = user ? user.uid : null;
  // The single gate for downloading readings (sec-4, D1-A): only an account
  // whose OWN users/{uid}.role is 'admin' downloads anything. `role` is null
  // while it loads, after a failed read and for every other account, so a
  // non-admin never issues a noise_readings query.
  const enabled = !!user && role === 'admin';
  const uid = enabled ? authUid : null;
```

Placement notes:
- `authUid` and `authLoading` still drive the 05.7g purge effect, exactly as 05.7 requires. Only `enabled` changes.
- While an admin's role loads, `uid` is null but `authUid` is set, so nothing is purged and nothing is fetched. The load effect starts once `role` arrives.

1h. `src/pages/LoginPage.tsx`: the subtitle says who the dashboard is for. (D1(A) only.)

BEFORE (`src/pages/LoginPage.tsx`, D1(A) only, line 149 at HEAD `353bbdd`, verbatim):
```tsx
                Sign in to access your research dashboard
```

AFTER:
```tsx
                Sign in with a dashboard administrator account
```

1i. Same file: "Request access" is for people who already have an app account. (D1(A) only.)

BEFORE (`src/pages/LoginPage.tsx`, D1(A) only, lines 254-257 at HEAD `353bbdd`, verbatim):
```tsx
                {/* Don't have an account */}
                <div className="text-center">
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Don't have an account?{' '}
```

AFTER:
```tsx
                {/* Request dashboard access (sec-4): the admin role is granted manually (master M3) */}
                <div className="text-center">
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Need dashboard access?{' '}
```

Placement note: the `<a href="mailto:…">Request access</a>` lines below this block are unchanged.

**D1(B) variant: apply 1B-a–1B-g after 1a–1d, instead of 1e–1i.**

1B-a. `src/pages/AnalyticsPage.tsx`: import the auth hook. (D1(B) only.)

BEFORE (`src/pages/AnalyticsPage.tsx`, D1(B) only, line 14 at HEAD `353bbdd`, verbatim):
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

AFTER:
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { useAuth } from '@/contexts/AuthContext';
```

1B-b. Same file: who may export. (D1(B) only.)

BEFORE (`src/pages/AnalyticsPage.tsx`, D1(B) only, as left by 05.4c, verbatim):
```tsx
  const { readings, loading, syncing, error, refresh } = useSyncedReadings();
```

AFTER:
```tsx
  const { readings, loading, syncing, error, refresh } = useSyncedReadings();
  // sec-4 (D1-B): every signed-in account may view; only the admin role exports.
  const { role, roleLoading } = useAuth();
  const canExport = role === 'admin';
```

1B-c. Same file: say why the exports are off. (D1(B) only.)

BEFORE (`src/pages/AnalyticsPage.tsx`, D1(B) only, line 117 at HEAD `353bbdd`, verbatim):
```tsx
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
```

AFTER:
```tsx
            {!canExport && !roleLoading && (
              <p className={cn('text-xs', isDarkMode ? 'text-gray-400' : 'text-gray-600')}>
                CSV and JSON exports are limited to dashboard administrators.
              </p>
            )}
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
```

1B-d. Same file: the CSV button. (D1(B) only.)

BEFORE (`src/pages/AnalyticsPage.tsx`, D1(B) only, lines 122-125 at HEAD `353bbdd`, verbatim):
```tsx
                disabled={readings.length === 0}
                className="text-xs sm:text-sm flex-1 sm:flex-none min-w-[120px]"
              >
                <Download className="w-3 h-3 sm:mr-1" />
```

AFTER:
```tsx
                disabled={readings.length === 0 || !canExport}
                className="text-xs sm:text-sm flex-1 sm:flex-none min-w-[120px]"
              >
                <Download className="w-3 h-3 sm:mr-1" />
```

1B-e. Same file: the JSON button. (D1(B) only.)

BEFORE (`src/pages/AnalyticsPage.tsx`, D1(B) only, lines 133-136 at HEAD `353bbdd`, verbatim):
```tsx
                disabled={readings.length === 0}
                className="text-xs sm:text-sm flex-1 sm:flex-none min-w-[120px]"
              >
                <FileJson className="w-3 h-3 sm:mr-1" />
```

AFTER:
```tsx
                disabled={readings.length === 0 || !canExport}
                className="text-xs sm:text-sm flex-1 sm:flex-none min-w-[120px]"
              >
                <FileJson className="w-3 h-3 sm:mr-1" />
```

Placement notes for 1B-d and 1B-e:
- 07.2t changed only the `onClick` line above each block, so these anchors match the post-07 file.
- Print stays enabled for everyone: it prints the current page, not the dataset.

1B-f. `src/pages/LoginPage.tsx`: the subtitle. (D1(B) only.)

BEFORE (`src/pages/LoginPage.tsx`, D1(B) only, line 149 at HEAD `353bbdd`, verbatim):
```tsx
                Sign in to access your research dashboard
```

AFTER:
```tsx
                Sign in with your Noise Mapper app account
```

1B-g. Same file: remove the "Request access" link. Under D1(B) there is nothing to request. (D1(B) only.)

BEFORE (`src/pages/LoginPage.tsx`, D1(B) only, lines 252-267 at HEAD `353bbdd`, verbatim; the `<a ` line and the `href=` line each end in one space):
```tsx
                </Button>

                {/* Don't have an account */}
                <div className="text-center">
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Don't have an account?{' '}
                    <a 
                      href="mailto:admin@noisemapper.lk?subject=Dashboard Access Request" 
                      className="font-semibold hover:underline transition-colors text-xs"
                      style={{ color: themeColor }}
                    >
                      Request access
                    </a>
                  </p>
                </div>
              </form>
```

AFTER:
```tsx
                </Button>
              </form>
```

**Edge cases to preserve**
- **Role semantics.**
  - Only the exact string `'admin'` opens the dashboard; the comparison is case-sensitive.
  - A non-string `role` (for example `true`), a missing field or a missing document all resolve to `null`, which means no access under D1(A). That covers the 2 Auth-only accounts.
  - The comparison matches the rules convention (`get('role', '') == 'admin'`).
- **Fail closed.** A rejected `getDoc` (offline, `permission-denied` after some future rules change, quota) shows "Could not check your access" with Try again. It never shows the dashboard and never spins forever.
  - Try again bumps `roleRequest`. `ProtectedRoute` then shows "Checking access..." until the new answer arrives.
  - **This deliberately supersedes one 05.5 check under D1(A).** 05.5 accepts "offline + reload keeps the cached data visible". After this step, an offline reload shows the "check failed" page instead, because the role cannot be confirmed (master §4.5: "never access"). Online, every page load first waits for one `getDoc` round trip ("Checking access..."). Only then does the warm cache render.
  - Do not cache the role in `localStorage` to get around this. A stale or edited value would then grant the gate.
- **No stale role.**
  - The answer is keyed by uid and request number, and every `onAuthStateChanged` call bumps the request. So a role is never reused for another account, or for the same account after a sign-out and sign-in.
  - If Firebase ever re-fires `onAuthStateChanged` for the same user, the page briefly shows "Checking access...". The provider re-reads the cache and runs a delta sync. Nothing is purged, because the purge follows `authUid`.
- **When a role change takes effect.** The role is read once per sign-in and once per page load (Firebase restores the session, which fires `onAuthStateChanged`). Granting (M3) or revoking a role in the console therefore takes effect on that account's next reload or sign-in.
- **Effects.**
  - No setState runs in an effect body. The auth listener and the `getDoc` callbacks set state asynchronously, as before.
  - The `cancelled` flag drops an answer that arrives after the uid or the request changed.
  - Under StrictMode (dev only), the role effect runs twice and issues two `getDoc` calls. Production issues one.
- **Purge behaviour (D1(A)).**
  - The 05.7g purge still follows `authUid`. A non-admin never calls `claimCacheFor`, because its `uid` is null.
  - Accepted, as in 05.7: a cache left at rest by an admin who closed the browser without signing out stays until that admin signs out on this browser. This is not a new exposure. Any signed-in account can read every reading through the SDK (master §6.7).
- **The role is a UI and cost gate, not a rules boundary** (master §6.7). Do not add any browser write of `role`, and no "request admin" write. The rules forbid both, and 02.4 must keep those guards.
- **Sign-out from `NoAccessPage`** goes through `AuthContext.signOut`, which is the 05.7h version (it also removes `remembered_email`). The purge then fires on `authUid === null` and is idempotent.

**Acceptance criteria**
- `grep -rnE "doc\(db, 'users'|collection\(db, 'users'\)" src` prints only the `getDoc(doc(db, 'users', uid))` line in `src/contexts/AuthContext.tsx`.
- `grep -rnE "\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b" src` prints nothing.
- D1(A): `grep -n "role === 'admin'" src/contexts/ReadingsContext.tsx` prints the `enabled` line. `grep -n "NoAccessPage" src/components/ProtectedRoute.tsx` prints the import and both uses.
- Manual checks (dev server):
  - **Admin.** Sign in. "Checking access..." flashes, then `/dashboard` loads as before. Exactly one `[Sync]` console line appears, after the role read.
  - **Non-admin, D1(A).** Use an existing non-admin app account, or a throwaway registered in the app; the app creates a `users` doc without `role`. Never create accounts from dashboard code.
    - Sign in: the "No dashboard access" page shows the account's email, Request access and Sign out.
    - No `[Sync]` line appears in the console.
    - DevTools → Network, filter `firestore`: no request payload mentions `noise_readings`.
    - Typing `/analytics` or `/map` into the URL bar shows the same page.
    - Sign out returns to `/login`.
  - **Check failure.**
    1. Signed in as the admin, set DevTools → Network → Offline and reload. Firebase Auth restores the session from its local persistence.
    2. Once Firestore reports the client offline (typically several seconds), "Could not check your access" appears, with Try again.
    3. Back online, press Try again: the dashboard loads.
  - **D1(B) only.**
    - A non-admin sees every page. Export CSV and Export JSON are disabled under the note "CSV and JSON exports are limited to dashboard administrators.", and Print still works.
    - The admin can export.
    - The login page has no "Request access" link.

**Verify**
```
npx tsc -b
npx eslint src/contexts/AuthContext.tsx src/components/NoAccessPage.tsx src/components/ProtectedRoute.tsx src/contexts/ReadingsContext.tsx src/pages/LoginPage.tsx
```
Under D1(B), the eslint line is `npx eslint src/contexts/AuthContext.tsx src/pages/AnalyticsPage.tsx src/pages/LoginPage.tsx`.

**Commit title:** `fix(auth): gate the dashboard on the users/{uid} admin role with a no-access page (sec-4)`

Under D1(B), use `fix(auth): limit research exports to the users/{uid} admin role and fix the access copy (sec-4)` instead, and record D1(B) in the commit body. Master §5 lists the D1(A) title.

---

### Step 2 — sec-1: Root and per-card error boundaries

**Goal:** A render error can no longer blank the app. Three layers do this:

1. **Root boundary.** `main.tsx` wraps `<App/>` in an `ErrorBoundary` whose fallback is `GlobalErrorPage`. That page no longer uses router hooks (master §4.10) and no longer claims anyone was notified.
2. **`Layout` boundary.** It wraps the page content and is keyed by `location.pathname`. A crashing page shows a notice inside the content area, the header and sidebar keep working, and navigating away clears it.
3. **Per-card boundaries.** `StatsCards`, the three charts and the readings table each sit in a `CardBoundary` on `/dashboard` and `/analytics`. One bad reading then costs one card, not the page.

`ErrorBoundary` gains a `fallbackRender` prop, so a fallback can receive the caught error and a reset callback.

**Files:**
- `src/components/GlobalErrorPage.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/main.tsx` (whole file rewritten)
- `src/components/Layout.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/AnalyticsPage.tsx`

**Exact changes**

2a. `src/components/GlobalErrorPage.tsx`: no router hook. "Go Home" is a full page load.

BEFORE (`src/components/GlobalErrorPage.tsx`, lines 1-19 at HEAD `353bbdd`, verbatim):
```tsx
import { AlertTriangle, RefreshCcw, Home, Bug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface GlobalErrorPageProps {
  error?: Error;
  errorInfo?: string;
  onReset?: () => void;
}

export function GlobalErrorPage({ error, errorInfo, onReset }: GlobalErrorPageProps) {
  const navigate = useNavigate();

  const handleReload = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    navigate('/dashboard');
  };
```

AFTER:
```tsx
import { AlertTriangle, RefreshCcw, Home, Bug } from 'lucide-react';

interface GlobalErrorPageProps {
  error?: Error;
  errorInfo?: string;
  onReset?: () => void;
}

/**
 * Full-page fallback of the root ErrorBoundary in main.tsx (sec-1). It renders
 * OUTSIDE BrowserRouter and every provider, so it must not use router hooks or
 * context (master §4.10): "Go Home" is a full page load.
 */
export function GlobalErrorPage({ error, errorInfo, onReset }: GlobalErrorPageProps) {
  const handleReload = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    window.location.assign('/dashboard');
  };
```

2b. Same file: replace the false claim. Nothing reports errors anywhere.

BEFORE (`src/components/GlobalErrorPage.tsx`, lines 35-38 at HEAD `353bbdd`, verbatim):
```tsx
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          We encountered an unexpected error. Don't worry, our team has been notified
          and we're working to fix it.
        </p>
```

AFTER:
```tsx
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          The dashboard hit an unexpected error and had to stop. Reload the page
          to try again. No data was changed: the dashboard only reads it.
        </p>
```

2c. `src/components/ErrorBoundary.tsx`: a render-prop fallback that receives the error and a reset callback.

BEFORE (`src/components/ErrorBoundary.tsx`, lines 1-8 at HEAD `353bbdd`, verbatim):
```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Bug } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}
```

AFTER:
```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Bug } from 'lucide-react';

interface FallbackRenderProps {
  error: Error;
  /** Clear the error and render the children again. */
  reset: () => void;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Render the fallback from the caught error. Takes precedence over `fallback`. */
  fallbackRender?: (props: FallbackRenderProps) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}
```

2d. Same file: use `fallbackRender` first.

BEFORE (`src/components/ErrorBoundary.tsx`, lines 38-43 at HEAD `353bbdd`, verbatim):
```tsx
  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

```

AFTER:
```tsx
  public render() {
    if (this.state.hasError) {
      if (this.props.fallbackRender && this.state.error) {
        return this.props.fallbackRender({ error: this.state.error, reset: this.handleReset });
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

```

Placement note: the default fallback below this block is unchanged. It is the "Oops! Something went wrong" card with Reload Page and Try Again. Several of its blank lines end in spaces (`:50`, `:54`, `:58`, `:66`, `:75`); they are outside every anchor here. `handleReset` is the existing private arrow property (`:34-36`).

2e. Same file: the compact per-card boundary.

BEFORE (`src/components/ErrorBoundary.tsx`, lines 89-93 at HEAD `353bbdd`, verbatim):
```tsx
    return this.props.children;
  }
}

export default ErrorBoundary;
```

AFTER:
```tsx
    return this.props.children;
  }
}

interface CardBoundaryProps {
  /** Names the card in the fallback, for example "Category chart". */
  label: string;
  children: ReactNode;
}

/**
 * sec-1: a per-card boundary. A card that throws while rendering (for example
 * on a malformed reading) is replaced by this compact notice, and the rest of
 * the page keeps working. "Try again" renders the card once more.
 */
export function CardBoundary({ label, children }: CardBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackRender={({ reset }) => (
        <div
          role="alert"
          className="p-4 sm:p-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-900 dark:text-red-100">
                {label} could not be displayed
              </p>
              <p className="text-xs mt-1 text-red-800 dark:text-red-200">
                Some of the data could not be shown here. The rest of the page still works.
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-300 dark:border-red-700 text-xs font-medium text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
              >
                <RefreshCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Try again
              </button>
            </div>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
```

Placement notes:
- `AlertTriangle` and `RefreshCcw` are already imported (`:2`).
- The compact fallback deliberately omits `error.message`. `componentDidCatch` already logs the error and the component stack to the console (`:25-28`). Those carry field names, never reading values, so convention §2.13 holds.

2f. `src/main.tsx`: the root boundary, outside every provider.

BEFORE (`src/main.tsx`, lines 1-10 at HEAD `353bbdd`, verbatim; the WHOLE file):
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

AFTER (the complete file):
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { GlobalErrorPage } from './components/GlobalErrorPage'

// sec-1: the last line of defence. A render error anywhere (a page, a provider,
// the router) shows GlobalErrorPage instead of unmounting the whole app to a
// blank page. This boundary sits OUTSIDE ThemeProvider, AuthProvider,
// ReadingsProvider and BrowserRouter, so its fallback uses no context and no
// router hooks (master §4.10).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackRender={({ error }) => <GlobalErrorPage error={error} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
```

Placement note: the file keeps its no-semicolon style. `GlobalErrorPage` gets no `onReset`, so its second button reads "Reload Page". After a root-level failure, a fresh load is the only safe reset.

2g. `src/components/Layout.tsx`: the router import.

BEFORE (`src/components/Layout.tsx`, line 2 at HEAD `353bbdd`, verbatim):
```tsx
import { useNavigate } from 'react-router-dom';
```

AFTER:
```tsx
import { useLocation, useNavigate } from 'react-router-dom';
```

2h. Same file: import the boundary.

BEFORE (`src/components/Layout.tsx`, lines 14-15 at HEAD `353bbdd`, verbatim):
```tsx
import { FLUTTER_THEME_COLORS } from '@/utils/themeConstants';
import { cn } from '@/lib/utils';
```

AFTER:
```tsx
import { FLUTTER_THEME_COLORS } from '@/utils/themeConstants';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';
```

2i. Same file: read the path.

BEFORE (`src/components/Layout.tsx`, lines 21-22 at HEAD `353bbdd`, verbatim):
```tsx
export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
```

AFTER:
```tsx
export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
```

2j. Same file: the content-area boundary.

BEFORE (`src/components/Layout.tsx`, lines 278-281 at HEAD `353bbdd`, verbatim):
```tsx
        {/* Content Area */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
```

AFTER:
```tsx
        {/* Content Area. sec-1: a page that throws while rendering shows the
            boundary's notice here while the header and sidebar keep working.
            Keyed by path, so navigating to another page clears the error. */}
        <main className="flex-1 overflow-auto p-6">
          <ErrorBoundary key={location.pathname}>
            {children}
          </ErrorBoundary>
        </main>
```

Placement notes:
- The boundary uses the existing default fallback, which shows the message, Reload Page and Try Again.
- The unreachable `if (!isAuthenticated)` branch (`:38-40`) is unchanged.
- 10.1 later rewrites the sidebar region of this file, which is disjoint from 2g–2j. It must keep `useLocation` and this boundary (master §3.3).

2k. `src/pages/DashboardPage.tsx`: import the card boundary.

BEFORE (`src/pages/DashboardPage.tsx`, line 10 at HEAD `353bbdd`; kept verbatim by 05.5a, verbatim):
```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';
```

AFTER:
```tsx
import { CardBoundary, ErrorBoundary } from '@/components/ErrorBoundary';
```

2l. Same file: the stats row.

BEFORE (`src/pages/DashboardPage.tsx`, lines 61-62 at HEAD `353bbdd`; unchanged by 05.5c, verbatim):
```tsx
      ) : hasData ? (
        <StatsCards />
```

AFTER:
```tsx
      ) : hasData ? (
        <CardBoundary label="Summary statistics">
          <StatsCards />
        </CardBoundary>
```

2m. Same file: the three charts.

BEFORE (`src/pages/DashboardPage.tsx`, lines 162-169 at HEAD `353bbdd`; untouched by 05.5, verbatim):
```tsx
            {/* Noise Trend Chart (Full Width) */}
            <NoiseTrendChart />

            {/* Category and Sound Type Charts (Side by Side) */}
            <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
              <CategoryChart />
              <SoundTypeChart />
            </div>
```

AFTER:
```tsx
            {/* Noise Trend Chart (Full Width) */}
            <CardBoundary label="Noise trend chart">
              <NoiseTrendChart />
            </CardBoundary>

            {/* Category and Sound Type Charts (Side by Side) */}
            <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
              <CardBoundary label="Category chart">
                <CategoryChart />
              </CardBoundary>
              <CardBoundary label="Sound type chart">
                <SoundTypeChart />
              </CardBoundary>
            </div>
```

Placement notes:
- An `ErrorBoundary` renders its children directly and adds no DOM node, so the two-column grid is unchanged.
- The map keeps its own existing boundary (`:113-144`), which 09.1 and 10.6 own.

2n. `src/pages/AnalyticsPage.tsx`: import the card boundary.

BEFORE (`src/pages/AnalyticsPage.tsx`, line 11 at HEAD `353bbdd`, verbatim):
```tsx
import { DataTable } from '@/components/analytics/DataTable';
```

AFTER:
```tsx
import { DataTable } from '@/components/analytics/DataTable';
import { CardBoundary } from '@/components/ErrorBoundary';
```

Placement note: 05.4b inserted the `ChartSkeleton` import directly below this line. That line stays where it is, below the new import.

2o. Same file: the stats row.

BEFORE (`src/pages/AnalyticsPage.tsx`, line 63 at HEAD `353bbdd`; 05.4d changed only the comment above it, verbatim):
```tsx
      <StatsCards />
```

AFTER:
```tsx
      <CardBoundary label="Summary statistics">
        <StatsCards />
      </CardBoundary>
```

2p. Same file: the three charts.

BEFORE (`src/pages/AnalyticsPage.tsx`, lines 99-106 at HEAD `353bbdd`; untouched by 05.4 and 07, verbatim):
```tsx
        {/* Noise Trend Chart (Full Width) */}
        <NoiseTrendChart />

        {/* Category and Sound Type Charts (Side by Side) */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
          <CategoryChart />
          <SoundTypeChart />
        </div>
```

AFTER:
```tsx
        {/* Noise Trend Chart (Full Width) */}
        <CardBoundary label="Noise trend chart">
          <NoiseTrendChart />
        </CardBoundary>

        {/* Category and Sound Type Charts (Side by Side) */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
          <CardBoundary label="Category chart">
            <CategoryChart />
          </CardBoundary>
          <CardBoundary label="Sound type chart">
            <SoundTypeChart />
          </CardBoundary>
        </div>
```

2q. Same file: the readings table. The `loading` gate from 05.4 is kept.

BEFORE (`src/pages/AnalyticsPage.tsx`, as left by 05.4f and then 07.2u, verbatim):
```tsx
          {loading ? <ChartSkeleton /> : <DataTable data={readings} />}
```

AFTER:
```tsx
          {loading ? (
            <ChartSkeleton />
          ) : (
            <CardBoundary label="Readings table">
              <DataTable data={readings} />
            </CardBoundary>
          )}
```

Placement notes:
- If 07.2 has not run, the line still reads `… <DataTable data={readings} userMap={userMap} />}`. STOP: master §3.1 orders 07 before 08.
- Under D1(B), 1B-a–1B-e touch other lines of this file (the `useSyncedReadings` import, the hook line, the export row), all disjoint from 2n–2q.

**Edge cases to preserve**
- **What boundaries catch.** They catch render errors only. Errors thrown in click handlers, such as an export `onClick`, are not caught; those are closed at ingest by 04.3's `normalizeReading()`.
- **Nesting order.** Per-card boundaries sit inside the `Layout` boundary, which sits inside the root boundary. The innermost boundary that sees an error handles it.
- **`CardBoundary` resets.**
  - "Try again" re-renders the card with the same data. If the data is still bad, the card fails again, which is correct.
  - Navigating away unmounts the page's boundaries, so they start clean on return.
  - The `Layout` boundary is keyed by path, so it resets on every navigation.
- **No reading data in logs or fallbacks.** No fallback prints reading data. `GlobalErrorPage` and the default `ErrorBoundary` card print `error.message`. React's child-type error names the object's keys, not their values.
- **`GlobalErrorPage`** keeps its props (`error`, `errorInfo`, `onReset`), its layout, its "Go Home" and its Reload buttons. Only the router dependency and the false claim change.
- **No new provider or context.** The root fallback renders even if `ThemeProvider` itself threw. It uses only Tailwind classes, plus `dark:` when `<html>` already carries the class.
- **Behaviour is otherwise identical.** Without an error, every page renders exactly as before; the boundaries are transparent. Skeletons, empty states and the 05 error cards are untouched.

**Acceptance criteria**
- `grep -n "useNavigate\|notified" src/components/GlobalErrorPage.tsx` prints nothing.
- `grep -rn "GlobalErrorPage" src --include=*.tsx` lists `src/main.tsx` (the import and its use) and the component file only.
- `grep -c "<CardBoundary" src/pages/DashboardPage.tsx` prints `4`. `grep -c "<CardBoundary" src/pages/AnalyticsPage.tsx` prints `5`.
- **Manual crash drills** (dev server, admin). Each drill is a TEMPORARY edit that is reverted before the commit. Afterwards, `git diff --stat` must list only this step's six files.
  1. **Card.** Add `throw new Error('drill');` as the first statement of `CategoryChart`'s function body.
     - On `/dashboard` and `/analytics`, the Category card reads "Category chart could not be displayed", with Try again.
     - Every other card, the map, the header and the sidebar still render.
     - Revert the edit.
  2. **Page.** Add the same throw as the first statement of `AnalyticsPage`.
     - `/analytics` shows "Oops! Something went wrong" inside the content area, and the header and sidebar still work.
     - Clicking "Dashboard" in the sidebar shows the dashboard (the keyed reset).
     - Revert the edit.
  3. **Root.** Add the throw as the first statement of `AppRoutes` (`src/routes.tsx`).
     - Every URL shows the full-page `GlobalErrorPage` with the new copy, and no "notified" text.
     - "Go Home" performs a full load of `/dashboard`.
     - Revert the edit.

**Verify**
```
npx tsc -b
npx eslint src/components/GlobalErrorPage.tsx src/components/ErrorBoundary.tsx src/main.tsx src/components/Layout.tsx src/pages/DashboardPage.tsx src/pages/AnalyticsPage.tsx
```

**Commit title:** `fix(ui): root and per-card error boundaries so one bad reading cannot blank the app (sec-1)`

---

### Step 3 — a11y-7: Login errors, toggle, reset, autocomplete

**Goal:**
- **Friendly errors.** A failed sign-in shows plain-language copy chosen by `err.code`: invalid credentials, too many requests, network failure, disabled account, or a generic default. It never shows raw SDK text, and a wrong email reads the same as a wrong password.
- **Live region.** The error renders inside a `role="alert"` container.
- **Password toggle.** It is reachable by keyboard, and its accessible name switches between "Show password" and "Hide password".
- **Autocomplete.** The email input has `autoComplete="username"` and the password input has `autoComplete="current-password"`.
- **Heading.** The title is a real `<h1>`.
- **Password reset.** "Forgot password?" calls `sendPasswordResetEmail`. Its success copy is the same whether or not the account exists.
- **Testability.** The message mapping lives in a pure, unit-tested module.

**Files:**
- `src/lib/authErrors.ts` (new)
- `src/lib/__tests__/authErrors.test.ts` (new)
- `src/pages/LoginPage.tsx`

**Exact changes**

3a. New file `src/lib/authErrors.ts`, full contents:
```ts
/**
 * Plain-language Firebase Auth messages for the login page (a11y-7).
 *
 * A pure module with no Firebase import, so it is unit-tested without the SDK.
 * It reads only the stable `code` of a FirebaseError (for example
 * 'auth/invalid-credential'), never the raw SDK message.
 */

const NETWORK_MESSAGE =
  'Could not reach the sign-in service. Check your connection and try again.';

/** The Firebase Auth error code of `err`, or null when it has none. */
export function authErrorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const { code } = err as { code?: unknown };
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/**
 * The message for a failed sign-in. An unknown email and a wrong password get
 * the same text, so the form never reveals which accounts exist.
 */
export function signInErrorMessage(err: unknown): string {
  switch (authErrorCode(err)) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email or password is incorrect.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Wait a few minutes, or reset your password, then try again.';
    case 'auth/network-request-failed':
      return NETWORK_MESSAGE;
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact the project administrator.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

/** Shown after a reset request, whether or not an account exists for `address`. */
export function resetSentMessage(address: string): string {
  return `If an account exists for ${address}, a password reset link is on its way. Check your inbox and spam folder.`;
}

/**
 * What to show when sendPasswordResetEmail fails. 'auth/user-not-found' (sent
 * by projects without email-enumeration protection) is answered exactly like
 * a success, so the reset form does not reveal which accounts exist either.
 */
export function passwordResetFailure(
  err: unknown,
  address: string,
): { notice: string } | { error: string } {
  switch (authErrorCode(err)) {
    case 'auth/user-not-found':
      return { notice: resetSentMessage(address) };
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return { error: 'Enter a valid email address.' };
    case 'auth/too-many-requests':
      return { error: 'Too many requests. Wait a few minutes, then try again.' };
    case 'auth/network-request-failed':
      return { error: NETWORK_MESSAGE };
    default:
      return { error: 'Could not send the reset email. Please try again.' };
  }
}
```

3b. New file `src/lib/__tests__/authErrors.test.ts`, full contents:
```ts
import { describe, expect, it } from 'vitest';
import {
  authErrorCode,
  passwordResetFailure,
  resetSentMessage,
  signInErrorMessage,
} from '@/lib/authErrors';

// Shaped like a FirebaseError: an Error with a string `code`.
function authError(code: string): Error {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code });
}

describe('authErrorCode', () => {
  it('reads the code of a Firebase-style error', () => {
    expect(authErrorCode(authError('auth/too-many-requests'))).toBe('auth/too-many-requests');
  });

  it('returns null for anything without a string code', () => {
    expect(authErrorCode(new Error('boom'))).toBeNull();
    expect(authErrorCode({ code: 42 })).toBeNull();
    expect(authErrorCode('auth/invalid-credential')).toBeNull();
    expect(authErrorCode(null)).toBeNull();
    expect(authErrorCode(undefined)).toBeNull();
  });
});

describe('signInErrorMessage (a11y-7)', () => {
  it('never shows the raw SDK text', () => {
    const message = signInErrorMessage(authError('auth/invalid-credential'));
    expect(message).toBe('The email or password is incorrect.');
    expect(message).not.toMatch(/firebase|auth\//i);
  });

  it('gives an unknown email and a wrong password the same message', () => {
    const wrongPassword = signInErrorMessage(authError('auth/wrong-password'));
    expect(signInErrorMessage(authError('auth/user-not-found'))).toBe(wrongPassword);
    expect(signInErrorMessage(authError('auth/invalid-credential'))).toBe(wrongPassword);
  });

  it('explains rate limiting, network failure and disabled accounts', () => {
    expect(signInErrorMessage(authError('auth/too-many-requests'))).toMatch(/too many/i);
    expect(signInErrorMessage(authError('auth/network-request-failed'))).toMatch(/connection/i);
    expect(signInErrorMessage(authError('auth/user-disabled'))).toMatch(/disabled/i);
  });

  it('falls back to a generic message for unknown codes and non-errors', () => {
    expect(signInErrorMessage(authError('auth/internal-error'))).toBe('Sign-in failed. Please try again.');
    expect(signInErrorMessage('oops')).toBe('Sign-in failed. Please try again.');
  });
});

describe('password reset outcomes (a11y-7)', () => {
  it('answers an unknown account exactly like a sent email', () => {
    expect(passwordResetFailure(authError('auth/user-not-found'), 'a@b.lk')).toEqual({
      notice: resetSentMessage('a@b.lk'),
    });
  });

  it('reports a bad address, rate limiting and network failure as errors', () => {
    expect(passwordResetFailure(authError('auth/invalid-email'), 'x')).toEqual({
      error: 'Enter a valid email address.',
    });
    expect(passwordResetFailure(authError('auth/too-many-requests'), 'a@b.lk')).toHaveProperty('error');
    expect(passwordResetFailure(authError('auth/network-request-failed'), 'a@b.lk')).toHaveProperty('error');
    expect(passwordResetFailure(new Error('boom'), 'a@b.lk')).toEqual({
      error: 'Could not send the reset email. Please try again.',
    });
  });

  it('never says whether the account exists', () => {
    expect(resetSentMessage('a@b.lk')).toMatch(/^If an account exists for a@b\.lk,/);
  });
});
```

3c. `src/pages/LoginPage.tsx`: imports.

BEFORE (`src/pages/LoginPage.tsx`, lines 4-5 at HEAD `353bbdd`, verbatim):
```tsx
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/config/firebase';
```

AFTER:
```tsx
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { passwordResetFailure, resetSentMessage, signInErrorMessage } from '@/lib/authErrors';
```

3d. Same file: state for the reset confirmation.

BEFORE (`src/pages/LoginPage.tsx`, line 28 at HEAD `353bbdd`, verbatim):
```tsx
  const [error, setError] = useState('');
```

AFTER:
```tsx
  const [error, setError] = useState('');
  // a11y-7: the password-reset confirmation (never an error), and its request state.
  const [notice, setNotice] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
```

3e. Same file: a new sign-in attempt clears the reset confirmation.

BEFORE (`src/pages/LoginPage.tsx`, lines 31-33 at HEAD `353bbdd`, verbatim):
```tsx
    e.preventDefault();
    setError('');
    setIsLoading(true);
```

AFTER:
```tsx
    e.preventDefault();
    setError('');
    setNotice('');
    setIsLoading(true);
```

3f. Same file: friendly error copy, and the reset handler.

BEFORE (`src/pages/LoginPage.tsx`, lines 43-51 at HEAD `353bbdd`; 05.7j ends just above this block, verbatim):
```tsx
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const themeColor = FLUTTER_THEME_COLORS.themeColors[primaryColor as keyof typeof FLUTTER_THEME_COLORS.themeColors];
```

AFTER:
```tsx
    } catch (err: unknown) {
      // a11y-7: plain-language copy chosen by err.code, never the raw SDK text.
      setError(signInErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // a11y-7: "Forgot password?" sends Firebase's reset email to the address in
  // the email field. Auth only: nothing is written to Firestore. The success
  // copy is the same whether or not an account exists for the address.
  const handlePasswordReset = async () => {
    setError('');
    setNotice('');
    const address = email.trim();
    if (!address) {
      setError('Enter your email address above, then choose "Forgot password?" again.');
      return;
    }
    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, address);
      setNotice(resetSentMessage(address));
    } catch (err: unknown) {
      const outcome = passwordResetFailure(err, address);
      if ('notice' in outcome) {
        setNotice(outcome.notice);
      } else {
        setError(outcome.error);
      }
    } finally {
      setIsSendingReset(false);
    }
  };

  const themeColor = FLUTTER_THEME_COLORS.themeColors[primaryColor as keyof typeof FLUTTER_THEME_COLORS.themeColors];
```

3g. Same file: a real heading.

BEFORE (`src/pages/LoginPage.tsx`, lines 145-147 at HEAD `353bbdd`, verbatim):
```tsx
              <CardTitle className="text-xl md:text-2xl font-bold" style={{ color: getTextColor() }}>
                Noise Mapper Dashboard
              </CardTitle>
```

AFTER:
```tsx
              {/* a11y-7: the page's one heading (CardTitle itself renders a <div>) */}
              <CardTitle className="text-xl md:text-2xl font-bold" style={{ color: getTextColor() }}>
                <h1>Noise Mapper Dashboard</h1>
              </CardTitle>
```

3h. Same file: the email input's autocomplete.

BEFORE (`src/pages/LoginPage.tsx`, lines 163-164 at HEAD `353bbdd`, verbatim):
```tsx
                      id="email"
                      type="email"
```

AFTER:
```tsx
                      id="email"
                      type="email"
                      autoComplete="username"
```

3i. Same file: the password input's autocomplete.

BEFORE (`src/pages/LoginPage.tsx`, lines 186-187 at HEAD `353bbdd`, verbatim):
```tsx
                      id="password"
                      type={showPassword ? 'text' : 'password'}
```

AFTER:
```tsx
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
```

3j. Same file: a reachable, labeled password toggle.

BEFORE (`src/pages/LoginPage.tsx`, lines 198-205 at HEAD `353bbdd`, verbatim):
```tsx
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
```

AFTER:
```tsx
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-controls="password"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
```

Placement notes:
- With `tabIndex={-1}` removed, the tab order is email → password → Show password → Forgot password? → Sign In, then Request access under D1(A).
- The class string is unchanged. 10.4 owns its contrast classes and anchors on this AFTER text.
- The accessible name changes with the state. Do not also add `aria-pressed`, because a toggle whose name already changes must not also expose a pressed state.

3k. Same file: "Forgot password?", the error in an alert region, and the reset confirmation in a status region.

BEFORE (`src/pages/LoginPage.tsx`, lines 227-232 at HEAD `353bbdd`; 05.7k kept this text verbatim, verbatim):
```tsx
                {/* Error Message */}
                {error && (
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-500">{error}</p>
                  </div>
                )}
```

AFTER:
```tsx
                {/* Forgot password (a11y-7): Firebase's reset email for the address above */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handlePasswordReset()}
                    disabled={isLoading || isSendingReset}
                    className="text-xs font-medium hover:underline disabled:opacity-50"
                    style={{ color: themeColor }}
                  >
                    {isSendingReset ? 'Sending reset email...' : 'Forgot password?'}
                  </button>
                </div>

                {/* Error Message: role="alert" so screen readers announce it (a11y-7) */}
                {error && (
                  <div role="alert" className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-500">{error}</p>
                  </div>
                )}

                {/* Password-reset confirmation (a11y-7) */}
                {notice && (
                  <div role="status" className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className={`text-xs ${isDarkMode ? 'text-green-300' : 'text-green-700'}`}>{notice}</p>
                  </div>
                )}
```

Placement notes:
- After 05.7k, this block directly follows the password field's closing `</div>`. The "Remember me" row is gone.
- The error colour classes (`text-red-500` at 12 px) are unchanged on purpose. 10.4 owns contrast and anchors on this AFTER text.
- Step 1 edited only `:149` and `:254-257` (D1(A)) or `:149` and `:252-267` (D1(B)). All of these are disjoint from 3c–3k.

**Edge cases to preserve**
- **No account enumeration.** `auth/invalid-credential`, `auth/wrong-password` and `auth/user-not-found` share one message. The reset flow answers `auth/user-not-found` with the same notice as a success. This holds whether or not the project has Firebase's email-enumeration protection on; that setting is unverified.
- **Reset input check.**
  - The reset reads the email field. An empty field gives an instruction, not an Auth call.
  - The field's `type="email"` validation does not run, because the button is `type="button"` and does not submit the form; Firebase reports a malformed address as `auth/invalid-email`.
- **Reset button state.** The reset is disabled while signing in and while a reset request is pending. A new sign-in attempt clears any notice.
- **The reset email.** Firebase's own email template and action handler send it and serve the reset page. It resets the shared Auth account, so the new password also applies in the mobile app, because it is the same account. No Firestore access is involved.
- **Unchanged behaviour.** `navigate('/dashboard')` after a successful sign-in (as left by 05.7j) and the `isLoading` spinner are unchanged.
- **Live regions.** The error container is inserted with `role="alert"`, which assistive technology announces on insertion. The confirmation uses `role="status"` (polite).
- **The heading.** The `<h1>` inherits the `CardTitle` classes and the inline colour, so the title looks the same.
- **Animations.** The login animations (`a11y-8`) are untouched; 10.7 owns reduced motion.

**Acceptance criteria**
- `grep -n "err.message\|tabIndex={-1}" src/pages/LoginPage.tsx` prints nothing.
- `grep -n 'role="alert"\|role="status"\|autoComplete=\|aria-label=\|<h1>' src/pages/LoginPage.tsx` shows all of these: the alert container, the status container, both `autoComplete` attributes, the toggle label and the heading.
- `npx vitest run src/lib/__tests__/authErrors.test.ts` reports 9 passing tests.
- Manual checks (dev server):
  - **Wrong password.** It shows "The email or password is incorrect." DevTools → Elements → Accessibility shows the container's role as `alert`; a screen reader announces it.
  - **Keyboard.**
    - Tab reaches the eye button after the password field.
    - Its name reads "Show password"; Space reveals the password and the name becomes "Hide password".
    - The page's accessibility tree has heading level 1 "Noise Mapper Dashboard".
  - **Reset.**
    - Press "Forgot password?" with an empty email: an instruction appears and no network request is sent.
    - Enter the OWNER's own address and press it again: the generic "If an account exists…" notice appears, and Firebase's reset email arrives. Use only the owner's address; Firebase rate-limits reset emails.
  - **Offline.** Set DevTools → Network → Offline and sign in: "Could not reach the sign-in service. Check your connection and try again."
  - **Autocomplete.** DevTools shows `autocomplete="username"` on the email input and `autocomplete="current-password"` on the password input. A password manager offers the saved credential.
- End of cluster: `npm test` is green and `npm run build` succeeds.

**Verify**
```
npx tsc -b
npx eslint src/lib/authErrors.ts src/lib/__tests__/authErrors.test.ts src/pages/LoginPage.tsx
npx vitest run src/lib/__tests__/authErrors.test.ts
npm test
npm run build
```
`npm test` and `npm run build` run once here, at the end of the cluster (master §1.3). Do not run the build alongside the dev server.

**Commit title:** `fix(login): announce friendly auth errors, label the password toggle, add reset and autocomplete (a11y-7)`

---

## Risks & rollback

- **Lockout (D1(A)).**
  - Pushing Step 1 locks every non-admin out at once (master §4.15), and production has exactly one admin, the owner. Tell the owner before pushing.
  - If the owner's own role read fails (for example offline), the owner sees "Could not check your access" with Try again. It recovers without a deploy.
  - The owner's role cannot be dropped by the app. The app's profile writes are `set(merge: true)` and the rules require `role` unchanged on update.
  - To grant access to someone else: M3 (console or Admin SDK, after an owner "yes"). That person then reloads.
- **Rules interplay.**
  - The role read is an owner `get`. It works with today's deployed ruleset and with 02.4 (owner-read `users`), whether or not M1 has happened.
  - If a future rules change ever denies it, the gate fails closed (the "check failed" page). It never fails open.
  - Never loosen the `role` create/update guards. They are what stop a user from granting themselves access.
- **Cost.** One `users/{uid}` document read per sign-in or page load per browser. Under D1(A), every non-admin stops costing a full readings download (about 3,374 reads), which more than pays for it.
- **Latency and offline (D1(A)).** Every protected page load now waits for that one read before anything renders. Offline, the admin sees the "check failed" page rather than the cached readings. Both follow from fail-closed (Step 1, Edge cases). Tell the owner together with the lockout note.
- **Boundaries hide errors from the screen, not from developers.** `componentDidCatch` still logs every caught error to the console. There is no telemetry; reporting is out of scope.
- **Password reset sends real email** through the shared Firebase project's Auth templates. Test it only with the owner's own address.
- **Rollback.**
  - Each step reverts on its own; revert the newest first (master §1.7).
  - Reverting Step 1 under D1(A) re-opens the dashboard to every signed-in account. It also re-enables readings sync for them: `enabled` goes back to `!!user`.
  - Reverting Step 2 removes the render-side defence. The 02.2 rules and 04.3 ingest validation still stand.
  - Reverting Step 3 restores the raw-error login. It also deletes `src/lib/authErrors.ts` and its test, so `npm test` stays green.
  - No step changes data, rules, indexes or the IndexedDB schema, so no step needs a deploy to roll back.
- **Later clusters that anchor on this one.**
  - 10.1 rewrites the `Layout` sidebar and must keep 2g–2j.
  - 10.4 changes contrast classes in `LoginPage.tsx` on top of 3j/3k's AFTER text.
  - 11.1 lazy-loads the route pages. The root boundary (`main.tsx`) and the `Layout` boundary still wrap them; its `Suspense` fallback is separate.
  - 12 enables `strict`. The code above narrows nulls explicitly (`currentRole ? … : null`, `user ? user.uid : null`, `typeof role === 'string'`).

## Out of scope

- **The other two halves of sec-1:**
  - rules `validReading()` on create and update (02.2, deployed in M1);
  - `normalizeReading()` at the IndexedDB boundary (04.3), which also closes the export `onClick` sink that boundaries cannot catch.
- **Custom claims instead of the role document** (the alternative in the finding's fix hint). Nothing in either repo sets claims, and the master chose the owner-readable `users/{uid}.role` (§4.5).
- **Granting or revoking admins.** This is manual M3 only. There is no admin UI and no "request access" write.
- **Server-side enforcement of dashboard-only access.** The rules cannot tell the app from the dashboard. Every signed-in account can still read `noise_readings` through the SDK because the app's community feed needs it (master §6.7, an accepted residual).
- **Purging, at sign-in under D1(A), an admin's cache left at rest on a shared browser.** This is the accepted 05.7 behaviour (see Step 1, Edge cases).
- **The rest of ux-8** (master §7): a NotFound route, preserving the return path through login, and redirecting signed-in users away from `/login`.
- **Error telemetry** (Sentry or similar) and any "report this error" flow.
- **Other login concerns:**
  - login contrast, including the 12 px red error text (10.4);
  - reduced motion on the login page (a11y-8, 10.7);
  - 44 px touch targets for the toggle and the reset link (10.7);
  - the "Secured by Firebase" divider copy;
  - wiring "Remember me" to `setPersistence`. 05.7 removed the dead checkbox; this is a product decision.
- **Confirming that `admin@noisemapper.lk` reaches the owner.** This cluster keeps the existing mailto target. The owner should confirm the address or change it in a separate copy commit.
- **`MapPage`'s boundaries.** It already wraps its map (`:145`), and clusters 09 and 10 own that file.
- **`ThemeContext`'s unguarded `localStorage`** (bug-11, master §7). The root boundary only softens a crash there.
