# Playbook 10 — Accessibility & Layout

Implementation spec for the defect cluster covering the dashboard's keyboard, screen-reader, contrast and layout defects: a sidebar that is hidden by default on desktop and stays in the tab order when closed, click-only sortable table headers, charts with no text alternative, secondary text and dB badges below WCAG AA contrast, unnamed or stateless map controls and a filter panel that cannot be dismissed with Esc, maps whose fixed 400/600 px height clips the OpenStreetMap attribution, a phone top bar that overflows, a global 44 px rule that distorts Leaflet, and infinite animations with no reduced-motion handling. It is UI-only: no query, rule, index, schema or dependency changes.

**Execute steps in order. Each step is exactly one commit. Gate every step on `npx tsc -b` (0 errors), `npx eslint <the files the step changed>` (0 errors, no new warnings) and, where a step names test files, `npx vitest run <those files>`; run `npm test` and `npm run build` ONCE, at the end of Step 7 (master playbook §1.3). Never run a build, a type check and a dev server at the same time.**

All BEFORE blocks below were copied verbatim from the working tree on 2026-10-15 (dashboard HEAD `353bbdd`), with these labelled exceptions:

- A BEFORE labelled "as left by Step N" is the AFTER text of an earlier step of THIS cluster. Use it where two steps touch the same region.
- A BEFORE labelled "as left by 0X.Y" is the AFTER text of an earlier cluster, copied verbatim from that cluster's spec. Those files are created or rewritten before this cluster runs, so the block cannot match a checkout of `353bbdd`: `src/lib/noiseBands.ts` (new in 06.1b) and `src/components/map/SyncStatus.tsx` (rewritten whole by 05.6c).
- `src/components/map/MapLegend.tsx` is created by 09.4, which has no published spec text when this spec was written. Step 4 therefore gives a semantic instruction for it, not a BEFORE block (see Step 4, 4n).

This cluster edits the FINAL shapes that clusters 05 to 09 leave, so every other BEFORE is a short anchor on text that those clusters keep (each placement note says which cluster touches the neighbouring lines). **If a BEFORE block does not match, STOP.** Check master §4 first, then re-read the file and apply the edit semantically: keep every functional change from clusters 04 to 09 (provider wiring, filters, error boundaries, the Contributor column, taxonomy labels) and never revert one to make an anchor match. Match on exact text, never on line numbers: the cited numbers are working-tree numbers at HEAD `353bbdd` and drift after clusters 04 to 09.

Environment facts (verified):
- `react ^19.2.0` (installed 19.2.4), `@types/react 19.2.14`. React 19 supports the boolean `inert` attribute, and `@types/react` declares `inert?: boolean` (`node_modules/@types/react/index.d.ts:2854`), so `<aside inert={…}>` type-checks. Browser support: Chrome 102, Safari 15.5, Firefox 112.
- `react-router-dom ^7.13.1` (installed 7.13.1). `NavLink` sets `aria-current="page"` on the active link by itself and accepts `className` as a function of `{ isActive }`.
- `recharts ^2.15.4` (installed 2.15.4). `accessibilityLayer` is declared on `CategoricalChartProps` (`generateCategoricalChart.d.ts:93`) and defaults to off. When it is on, the chart's `<svg>` gets `tabIndex` 0 and `role="application"` unless the `role` and `tabIndex` props override them (`lib/chart/generateCategoricalChart.js:1937-1941`, "can be overwritten"). `aria-label` and `role` pass through to the `<svg>` (`lib/util/types.js:29`, `SVGElementPropKeys`). Arrow-key navigation needs a `coordinateList` from the chart's axes; a `PieChart` has none, so `AccessibilityManager.keyboardEvent` returns at once (`lib/chart/AccessibilityManager.js:55`). That is why the pie gets a named image role and no keyboard layer.
- `tailwindcss ^4.2.1` (installed 4.2.1): `sr-only`, `max-sm:`, `hidden sm:inline` and arbitrary `z-[45]` all work. `@tailwindcss/vite ^4.2.1`; CSS is minified by lightningcss, which accepts a complex selector inside `:not()`.
- `src/components/ui/table.tsx:9-12` already wraps every `<table>` in `<div className="relative w-full overflow-x-auto">`, and `DataTable` is the only user of `Table`. The mobile rule `table { display: block; … }` in `index.css` is therefore unnecessary: it only strips table semantics.
- `src/components/ui/button.tsx` puts `data-slot="button"` and `data-size={size}` on every `Button`, which lets CSS target icon buttons (`[data-size^='icon']`). `buttonVariants` is exported from the same file.
- `leaflet ^1.9.4`: `.leaflet-container` is positioned, and `MapComponent` gives it `z-0`, so Leaflet's own panes (z-index up to 1000) live inside that container's stacking context and never compete with page overlays. `Map._animateZoom` has a 250 ms timeout fallback for `transitionend`, so zero-duration transitions cannot hang a zoom.
- `vitest 4.1.11` is added by 01.1 (node environment, no jsdom). Tests under `src/lib/__tests__/` import `describe`/`it`/`expect` from `vitest` and import only pure modules (master §2.15).
- `tsconfig.app.json`: `strict: false` until cluster 12, `verbatimModuleSyntax: true` (type-only imports need `import type`), `erasableSyntaxOnly: true` (no enums or parameter properties). The new code below is also valid under `strict`.
- ESLint is `js.recommended` + `tseslint.recommended` + `react-hooks` 7 + `react-refresh/only-export-components`. It is not type-aware.
- Contrast figures in this spec are WCAG 2.x ratios computed from the sRGB hex values when the spec was written. They are re-asserted by the Step 4 unit test, so they do not need to be trusted.
- Index rule, read-only browser, rules mirroring, manual deploy gate: this cluster changes no query, adds no index, writes nothing to Firestore and touches neither `firestore.rules` nor `firebase.json`.

---

## Scope

| ID | Status | One-liner |
|---|---|---|
| a11y-1 | UNVERIFIED (Medium, confidence high); re-read in the working tree | `Layout.tsx:25` starts the sidebar closed on desktop too. A closed sidebar is only `w-0 overflow-hidden` (`:53-59`), so its buttons stay in the tab order. Navigating never closes the mobile drawer (`:88`, `:98`, `:108`). The `☰`/`✕` buttons have no name or expanded state, and there is no Esc handling. Step 1. |
| a11y-2 | UNVERIFIED (Medium, confidence high); re-read in the working tree | Six sortable `<TableHead onClick>` headers (`DataTable.tsx:173-208`) are unreachable by keyboard and expose no `aria-sort`. `SortIcon` has no text. Step 2. |
| a11y-3 | UNVERIFIED (Medium, confidence high); re-read in the working tree | The trend, category and sound-type charts have no text alternative and no keyboard layer. The trend's max and min lines differ by hue only. Step 3. |
| a11y-4 | UNVERIFIED (Medium, confidence high); re-read in the working tree | `text-gray-500` on the dark card (#2D2640) is 2.97:1 and `text-gray-400` on white is 2.54:1 (stat labels, filter helper text, chart empty states, the sync badge, the login divider and 10 px footer). Step 4. |
| a11y-5 | UNVERIFIED (Medium, confidence high); re-read in the working tree | White text on the #4CAF50 (2.78:1) and #FF9800 (2.16:1) dB badges; white `--primary-foreground` on Green, Orange, Blue, Teal and Red theme buttons; map pins separate the dB bands by colour only. Step 4. |
| a11y-6 | UNVERIFIED (Medium, confidence high); re-read in the working tree | The map's Back button has no name, the heatmap and Filters buttons expose no state, the filter panel has no Esc, close button or focus handling, the `Data Source`/`Date Range` labels label nothing, and the dialog overlay (z-50) draws under the map overlays (z-300/399/400). Step 5. |
| ux-4 | UNVERIFIED (Medium, confidence high); re-read in the working tree | `MapContainer.tsx:34` is a fixed `h-[400px] md:h-[600px]`: the Dashboard mini-map is clipped (attribution and centre off-screen) and `/map` leaves a grey gap on tall viewports. Step 6. |
| ux-5 | UNVERIFIED (Medium, confidence medium); derived from the markup | The `/map` controls row is `shrink-0` and wider than a 360 px bar. `index.css:164-169` forces 44 px on every button and link, including Leaflet's controls, and `:176-181` sets `table { display: block }`. Step 7. |
| a11y-8 | UNVERIFIED (Low, confidence medium) — reduced-motion half only | Infinite login animations and `animate-shimmer` ignore `prefers-reduced-motion`. Step 7. The unguarded `localStorage` in `ThemeContext` (bug-11) stays in master §7. |

Full finding text: grep the IDs in `audit/00_MASTER_AUDIT_REPORT.md`, `audit/02_UI_UX_AUDIT.md` and `audit/07_ACCESSIBILITY_AUDIT.md`.

---

## Pre-reading

Open these files before touching anything:

1. `audit/08_FIX_IMPLEMENTATION_PLAYBOOK.md` §2 (conventions 11 to 13), §3.3 (shared-file table), §4.8 (MapPage composite), §4.11 (bands and categories), §4.14 (`index.css` and `routes.tsx`).
2. `audit/playbook/08_access_resilience.md` 2g to 2j (what 08.2 leaves in `Layout.tsx`: `useLocation`, the `ErrorBoundary` import, the boundary around `{children}`) and 3j/3k (the `LoginPage` password toggle and error container this cluster restyles).
3. `audit/playbook/05_sync_engine_provider.md` Step 4 (the loading and empty branches added to the charts and `StatsCards`) and Step 6 (6c, the whole-file `SyncStatus.tsx`; 6d to 6h, the `MapPage` edits).
4. `audit/playbook/06_taxonomy_analytics.md` 1b (`noiseBands.ts` as created), Step 2 and 3 (`CategoryChart` as left) and 4 (`NoiseTrendChart` as left).
5. `audit/playbook/07_export_privacy.md` 2n and 3a (the Contributor header; `DB_CAVEAT` appended to `noiseBands.ts`).
6. `src/components/Layout.tsx`, `src/components/analytics/DataTable.tsx`, `src/components/ui/table.tsx`, `src/components/ui/button.tsx`, `src/components/ui/dialog.tsx` — whole files.
7. `src/pages/MapPage.tsx` (post-05.6), `src/components/map/MapContainer.tsx`, `src/components/map/SyncStatus.tsx` (post-05.6), `src/components/map/NoiseMarkers.tsx` (post-09.5/09.6), `src/pages/DashboardPage.tsx` (post-05.5/08.2/09.1).
8. `src/index.css` — whole file (255 lines at HEAD).
9. `node_modules/recharts/lib/chart/generateCategoricalChart.js:1930-1950` and `lib/chart/AccessibilityManager.js:50-70`, to confirm the `role`/`tabIndex` override and the empty-coordinate no-op that Step 3 relies on.

---

## Steps

### Step 1 — a11y-1: sidebar open on desktop, inert when closed, closes on navigate and Esc

**Goal:** From `lg` up the sidebar is an open column on first load. While it is closed it is `inert` (out of the tab order and the accessibility tree). Below `lg` it is a drawer that closes when a destination is chosen and on Esc, and focus returns to the header menu button. The three destinations are real links (`NavLink`) with `aria-current="page"`, inside `<nav aria-label="Primary">`. Every glyph-only control has an accessible name, and the menu buttons expose `aria-expanded`/`aria-controls`.

**Files:**
- `src/components/Layout.tsx`

**Exact changes**

1a. Imports. Single-line anchors; 08.2 edits line 2 (`useNavigate` becomes `useLocation, useNavigate`) and appends one import after line 15, and neither is touched here.

BEFORE (`src/components/Layout.tsx`, line 1, verbatim):
```tsx
import { useState } from 'react';
```

AFTER:
```tsx
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
```

Placement note: `NavLink` is a second import statement from `react-router-dom` on purpose, so this step never has to match line 2, which 08.2 rewrites. The two statements are valid together and ESLint's recommended set has no `no-duplicate-imports`.

BEFORE (`src/components/Layout.tsx`, line 5, verbatim):
```tsx
import { Button } from '@/components/ui/button';
```

AFTER:
```tsx
import { Button, buttonVariants } from '@/components/ui/button';
```

1b. Module-level helpers, directly above the component. The block ends at the `export default function Layout` line, which 08.2 keeps verbatim (it edits the line after it).

BEFORE (`src/components/Layout.tsx`, lines 17-21, verbatim):
```tsx
interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
```

AFTER:
```tsx
interface LayoutProps {
  children: React.ReactNode;
}

// Tailwind's `lg` breakpoint. From here up the sidebar is a persistent column;
// below it the sidebar is a drawer.
const DESKTOP_QUERY = '(min-width: 1024px)';

function isDesktopViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches;
}

// A closed sidebar is inert, so focus that was inside it must be handed to a
// control that is still visible: the header menu button of the current layout.
function focusMenuButton(): void {
  const id = isDesktopViewport() ? 'sidebar-toggle-desktop' : 'sidebar-toggle-mobile';
  window.requestAnimationFrame(() => document.getElementById(id)?.focus());
}

const NAV_ITEMS = [
  { to: '/dashboard', icon: '📊', label: 'Dashboard' },
  { to: '/map', icon: '📍', label: 'Map' },
  { to: '/analytics', icon: '📈', label: 'Analytics' },
] as const;

export default function Layout({ children }: LayoutProps) {
```

1c. State, breakpoint sync, Esc handling and the navigate handler. This replaces the single state line. The hooks sit above the `if (!isAuthenticated)` early return, so the hook order never changes.

BEFORE (`src/components/Layout.tsx`, line 25, verbatim):
```tsx
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Start closed on mobile
```

AFTER:
```tsx
  // Open by default from lg up (a persistent column); closed below lg (a drawer).
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => isDesktopViewport());

  // Crossing the lg breakpoint resets the sidebar to that layout's default.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsSidebarOpen(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Esc closes the drawer. Not on desktop, where the sidebar is a column, and
  // not when another layer (a Radix menu or dialog) already consumed the key.
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isDesktopViewport()) return;
      setIsSidebarOpen(false);
      focusMenuButton();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isSidebarOpen]);

  // Choosing a destination closes the drawer on phones and tablets.
  const closeDrawerOnNavigate = () => {
    if (isDesktopViewport()) return;
    setIsSidebarOpen(false);
    focusMenuButton();
  };
```

1d. The backdrop and the `<aside>` opening. `inert` removes a closed sidebar from the tab order and from assistive technology in one attribute.

BEFORE (`src/components/Layout.tsx`, lines 44-59, verbatim):
```tsx
      {/* Mobile Overlay - closes sidebar when tapped */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-[500] flex flex-col border-r transition-all duration-300 overflow-hidden',
          isSidebarOpen ? 'w-64' : 'w-0',
          isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white border-gray-200'
        )}
      >
```

AFTER:
```tsx
      {/* Mobile Overlay - closes sidebar when tapped; Esc does the same from the keyboard */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          aria-hidden="true"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar. While closed it is inert: out of the tab order and hidden from assistive technology. */}
      <aside
        id="app-sidebar"
        inert={!isSidebarOpen}
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-[500] flex flex-col border-r transition-all duration-300 overflow-hidden',
          isSidebarOpen ? 'w-64' : 'w-0',
          isDarkMode ? 'bg-[#2D2640] border-gray-700' : 'bg-white border-gray-200'
        )}
      >
```

1e. The in-sidebar close button gets a name and hands focus back.

BEFORE (`src/components/Layout.tsx`, lines 68-78, verbatim):
```tsx
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSidebarOpen(false)}
            className={cn(
              'transition-colors',
              isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            ✕
          </Button>
```

AFTER:
```tsx
          <Button
            variant="ghost"
            size="sm"
            aria-label="Close navigation menu"
            onClick={() => {
              setIsSidebarOpen(false);
              focusMenuButton();
            }}
            className={cn(
              'transition-colors',
              isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <span aria-hidden="true">✕</span>
          </Button>
```

1f. The destinations become links inside a labelled `<nav>`.

BEFORE (`src/components/Layout.tsx`, lines 81-112, verbatim):
```tsx
        <nav className="flex-1 p-4 space-y-2 overflow-hidden">
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start transition-colors whitespace-nowrap',
              isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
            )}
            onClick={() => navigate('/dashboard')}
          >
            📊 Dashboard
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start transition-colors whitespace-nowrap',
              isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
            )}
            onClick={() => navigate('/map')}
          >
            📍 Map
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'w-full justify-start transition-colors whitespace-nowrap',
              isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
            )}
            onClick={() => navigate('/analytics')}
          >
            📈 Analytics
          </Button>
        </nav>
```

AFTER:
```tsx
        <nav aria-label="Primary" className="flex-1 p-4 space-y-2 overflow-hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeDrawerOnNavigate}
              className={({ isActive }) =>
                cn(
                  buttonVariants({ variant: 'ghost' }),
                  'w-full justify-start transition-colors whitespace-nowrap',
                  isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100',
                  isActive && (isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900')
                )
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
```

1g. Theme mode buttons: a name and a pressed state.

BEFORE (`src/components/Layout.tsx`, lines 125-146, verbatim):
```tsx
              <Button
                size="sm"
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => {
                  console.log('[Layout] Setting theme to light');
                  setTheme('light');
                }}
                className="flex-1"
              >
                ☀️
              </Button>
              <Button
                size="sm"
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => {
                  console.log('[Layout] Setting theme to dark');
                  setTheme('dark');
                }}
                className="flex-1"
              >
                🌙
              </Button>
```

AFTER:
```tsx
              <Button
                size="sm"
                variant={theme === 'light' ? 'default' : 'outline'}
                aria-label="Light theme"
                aria-pressed={theme === 'light'}
                onClick={() => {
                  console.log('[Layout] Setting theme to light');
                  setTheme('light');
                }}
                className="flex-1"
              >
                <span aria-hidden="true">☀️</span>
              </Button>
              <Button
                size="sm"
                variant={theme === 'dark' ? 'default' : 'outline'}
                aria-label="Dark theme"
                aria-pressed={theme === 'dark'}
                onClick={() => {
                  console.log('[Layout] Setting theme to dark');
                  setTheme('dark');
                }}
                className="flex-1"
              >
                <span aria-hidden="true">🌙</span>
              </Button>
```

1h. Primary-colour swatches: a name and a pressed state. `title` stays.

BEFORE (`src/components/Layout.tsx`, lines 160-174, verbatim):
```tsx
                  <Button
                    key={color}
                    size="sm"
                    variant={isSelected ? 'default' : 'outline'}
                    onClick={() => {
                      console.log('[Layout] Setting primary color to:', color);
                      setPrimaryColor(color);
                    }}
                    className="w-8 h-8 p-0 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: isSelected ? colorHex : 'transparent',
                      borderColor: colorHex,
                    }}
                    title={color}
                  >
```

AFTER:
```tsx
                  <Button
                    key={color}
                    size="sm"
                    variant={isSelected ? 'default' : 'outline'}
                    aria-label={`${color} theme colour`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      console.log('[Layout] Setting primary color to:', color);
                      setPrimaryColor(color);
                    }}
                    className="w-8 h-8 p-0 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: isSelected ? colorHex : 'transparent',
                      borderColor: colorHex,
                    }}
                    title={color}
                  >
```

1i. The two header menu buttons: names, `aria-expanded`, `aria-controls`, and ids that `focusMenuButton()` looks up.

BEFORE (`src/components/Layout.tsx`, lines 210-236, verbatim):
```tsx
            {/* Mobile Menu Button - always visible on mobile */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={cn(
                'transition-colors lg:hidden',
                isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              ☰
            </Button>
            
            {/* Desktop Menu Button - only visible when sidebar closed */}
            {!isSidebarOpen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(true)}
                className={cn(
                  'transition-colors hidden lg:block',
                  isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                ☰
              </Button>
            )}
```

AFTER:
```tsx
            {/* Mobile Menu Button - always visible on mobile */}
            <Button
              id="sidebar-toggle-mobile"
              variant="ghost"
              size="sm"
              aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isSidebarOpen}
              aria-controls="app-sidebar"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={cn(
                'transition-colors lg:hidden',
                isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <span aria-hidden="true">☰</span>
            </Button>

            {/* Desktop Menu Button - only visible when sidebar closed */}
            {!isSidebarOpen && (
              <Button
                id="sidebar-toggle-desktop"
                variant="ghost"
                size="sm"
                aria-label="Open navigation menu"
                aria-expanded={false}
                aria-controls="app-sidebar"
                onClick={() => setIsSidebarOpen(true)}
                className={cn(
                  'transition-colors hidden lg:block',
                  isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <span aria-hidden="true">☰</span>
              </Button>
            )}
```

Placement notes:
- 1a to 1i edit regions that 08.2 (`:2`, `:14-15`, `:21-22`, `:278-281`) does not touch. After 08.2 the file still has `useLocation`, the `ErrorBoundary` import and `<ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>`; leave all three exactly as 08.2 left them. `useNavigate` stays in use by `handleSignOut`.
- The bare `{/* Desktop Menu Button … */}` block in the HEAD text carries two whitespace-only lines (`:222`, `:237`); the BEFORE above includes them verbatim. The AFTER drops the trailing whitespace.
- Step 5 later edits the `z-[500]` line of the AFTER in 1d, and Step 7 edits nothing here.

**Edge cases to preserve**
- Hooks stay above `if (!isAuthenticated) return …` (the 1c effects sit directly under the state line), so the unauthenticated branch and sign-out are unchanged.
- On desktop the `✕` and `☰` buttons still collapse and re-open the column; only Esc is limited to the drawer. A user who collapsed the column keeps it collapsed until the viewport crosses the `lg` breakpoint.
- A Radix dropdown or dialog that is open when Esc is pressed consumes the key first (it calls `preventDefault()` in a capture-phase listener), so the drawer does not also close.
- `inert` is set only while closed. An open sidebar, and every control in it, behaves exactly as before.
- `transition-all duration-300` still animates the width; `inert` applies at once, so a collapsing sidebar is not focusable mid-animation.
- The theme and colour buttons keep their `console.log` calls and `title`; only names and pressed state are added. (Logging cleanup is out of scope.)
- Emoji glyphs are wrapped in `aria-hidden` spans, so a screen reader announces "Dashboard", not "bar chart Dashboard".

**Acceptance criteria**
- At 1280 px wide, a first load shows the sidebar open with Dashboard, Map and Analytics visible. At 390 px it is closed and a `☰` button is visible.
- Tab at 1280 px after pressing the sidebar's `✕`: focus never lands on Dashboard, Map, Analytics or the theme controls (DevTools → Accessibility shows `aside#app-sidebar` as ignored). The header `☰` button receives focus and is named "Open navigation menu".
- At 390 px, `☰` opens the drawer and `aria-expanded` is `true`. Esc closes it and focus returns to `☰`. Choosing Map navigates, closes the drawer and focuses `☰`.
- The active destination has `aria-current="page"` and a visible active style. `grep -n "onClick={() => navigate" src/components/Layout.tsx` prints nothing (`handleSignOut` still calls `navigate('/login')`).
- A screen reader announces "Light theme, toggle button, pressed" and "Purple theme colour".
- `grep -n "useLocation\|ErrorBoundary" src/components/Layout.tsx` still shows 08.2's import, `useLocation()` call and boundary.

**Verify**
```
npx tsc -b
npx eslint src/components/Layout.tsx
```
Manual: the acceptance checks above, at 1280 px and at 390 px (DevTools device toolbar). Do NOT run `npm run build` in this step.

**Commit title:** `fix(a11y): sidebar open on desktop, inert when closed, closes on navigate and Esc (a11y-1)`

---

### Step 2 — a11y-2: keyboard-sortable DataTable headers with aria-sort

**Goal:** Each of the six sortable headers contains a real `<button type="button">`, so it can be reached and activated from the keyboard, and the `<th>` carries `aria-sort` (`none`, `ascending` or `descending`). The sort icon is decorative and the active direction is spoken.

**Files:**
- `src/components/analytics/DataTable.tsx`
- `src/index.css` (print rule only)

**Exact changes**

2a. A sortable header component, and a decorative `SortIcon` with a spoken direction.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 31-38, verbatim):
```tsx
function SortIcon({ field, sortField, sortDirection }: SortIconProps) {
  if (sortField !== field) return null;
  return sortDirection === 'asc' ? (
    <ChevronUp className="w-3 h-3 ml-1 inline" />
  ) : (
    <ChevronDown className="w-3 h-3 ml-1 inline" />
  );
}
```

AFTER:
```tsx
function SortIcon({ field, sortField, sortDirection }: SortIconProps) {
  if (sortField !== field) return null;
  return (
    <>
      {sortDirection === 'asc' ? (
        <ChevronUp className="w-3 h-3 ml-1 inline" aria-hidden="true" />
      ) : (
        <ChevronDown className="w-3 h-3 ml-1 inline" aria-hidden="true" />
      )}
      <span className="sr-only">
        {sortDirection === 'asc' ? ', sorted ascending' : ', sorted descending'}
      </span>
    </>
  );
}

interface SortableHeadProps extends SortIconProps {
  label: string;
  onSort: (field: SortField) => void;
}

/**
 * A sortable column header: a real button inside the <th>, so it is in the tab
 * order and works with Enter and Space. `aria-sort` on the <th> tells assistive
 * technology which column is sorted and in which direction (a11y-2).
 */
function SortableHead({ field, label, sortField, sortDirection, onSort }: SortableHeadProps) {
  const ariaSort =
    sortField !== field ? 'none' : sortDirection === 'asc' ? 'ascending' : 'descending';
  return (
    <TableHead aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="sort-button -mx-1 inline-flex items-center rounded-sm px-1 py-1 font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <SortIcon field={field} sortField={sortField} sortDirection={sortDirection} />
      </button>
    </TableHead>
  );
}
```

2b. The six header cells. The seventh header ('Contributor' after 07.2n) is a plain `<TableHead>` on the line after this block and is not touched.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 173-208, verbatim):
```tsx
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('timestamp')}
              >
                Timestamp <SortIcon field="timestamp" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('locationName')}
              >
                Location <SortIcon field="locationName" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('decibelLevel')}
              >
                Noise Level (dB) <SortIcon field="decibelLevel" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('soundCategory')}
              >
                Category <SortIcon field="soundCategory" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('soundType')}
              >
                Type <SortIcon field="soundType" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('confidence')}
              >
                Confidence <SortIcon field="confidence" sortField={sortField} sortDirection={sortDirection} />
              </TableHead>
```

AFTER:
```tsx
              <SortableHead field="timestamp" label="Timestamp" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <SortableHead field="locationName" label="Location" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <SortableHead field="decibelLevel" label="Noise Level (dB)" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <SortableHead field="soundCategory" label="Category" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <SortableHead field="soundType" label="Type" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              <SortableHead field="confidence" label="Confidence" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
```

2c. Print: the existing print sheet hides every `button`, which would now blank the table headers. Re-show the sort buttons (higher specificity, also `!important`).

BEFORE (`src/index.css`, lines 210-217, verbatim):
```css
  /* Hide sidebar, header, navigation */
  .sidebar,
  header,
  nav,
  button,
  .no-print {
    display: none !important;
  }
```

AFTER:
```css
  /* Hide sidebar, header, navigation */
  .sidebar,
  header,
  nav,
  button,
  .no-print {
    display: none !important;
  }

  /* The sortable table headers are buttons (a11y-2): keep their text in print. */
  th .sort-button {
    display: inline-flex !important;
  }
```

Placement notes:
- 2a replaces `SortIcon` in place; `SortIconProps` (`:25-29`) is reused by `SortableHeadProps`, so it stays. `ChevronUp`/`ChevronDown` stay imported.
- `'soundCategory'` is a sort-key identifier (`SortField`), not the property 06.3 deletes from `NoiseReading`. Keep it. 06.3h already made the sort use the displayed label.
- Clusters 04.2, 06.3 and 07.2 edit other regions of this file (`toDate`, the sort comparators, the cells, the `Contributor` header, the imports). 2b's BEFORE is the six header cells only, and none of those clusters touches them (06's placement note says so for `:193-195`).
- `handleSort` is the existing function at `:137`. A first click on a new column sorts descending, as today.
- `.sort-button` is also the hook Step 7 uses to exempt these buttons from the 44 px phone rule.

**Edge cases to preserve**
- Sorting behaviour is unchanged: same fields, same default (`timestamp` descending), same toggle.
- `aria-sort` is on the `<th>`, never on the button. Unsorted sortable columns say `none`, which is the recommended value for a sortable column.
- The Contributor column stays non-sortable and has no button.
- The empty-state row keeps `colSpan={7}`.
- The header height is not changed (`TableHead` is `h-10`); the button's vertical padding fits inside it.

**Acceptance criteria**
- Tab reaches each of the six headers in order. Enter and Space sort. A visible focus ring appears on the focused header.
- DevTools → Accessibility: the sorted column's `<th>` shows `sort: descending` after load (Timestamp), the others `none`. A screen reader reading the focused button says "Timestamp, sorted descending".
- Clicking a header with the mouse behaves exactly as before.
- Print preview (Ctrl+P) on `/analytics` still shows the header labels. `grep -n "cursor-pointer" src/components/analytics/DataTable.tsx` prints nothing.

**Verify**
```
npx tsc -b
npx eslint src/components/analytics/DataTable.tsx
```
Manual: the acceptance checks above on `/analytics`. Do NOT run `npm run build` in this step.

**Commit title:** `fix(a11y): keyboard-sortable DataTable headers with aria-sort (a11y-2)`

---

### Step 3 — a11y-3: text summaries, accessibilityLayer and non-colour cues for charts

**Goal:** The trend and category charts are focusable named images: their `<svg>` has `role="img"`, an `aria-label` that spells out the numbers, and recharts' keyboard layer (arrow keys move the tooltip). The sound-type pie is a named image (it has nothing to arrow through). In the trend chart the Maximum and Minimum lines also differ by dash pattern, not only by hue, and the legend shows it.

**Files:**
- `src/lib/chartSummary.ts` (new)
- `src/lib/__tests__/chartSummary.test.ts` (new)
- `src/components/analytics/NoiseTrendChart.tsx`
- `src/components/analytics/CategoryChart.tsx`
- `src/components/analytics/SoundTypeChart.tsx`

**Exact changes**

3a. New file `src/lib/chartSummary.ts` — full contents:

```ts
/**
 * Text alternatives for the analytics charts (a11y-3).
 *
 * Pure functions with no React and no Firebase imports, so they run in the
 * node test environment. A chart passes the returned string to its own
 * `aria-label`, so a screen reader hears the numbers instead of an unnamed
 * graphic.
 */

export interface LevelSummary {
  count: number;
  average: number;
  min: number;
  max: number;
}

/** '58.2 dB': one decimal, like the stat cards. */
export function formatDb(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)} dB`;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

/**
 * Count, mean, min and max of the finite values, or null when there are none.
 * It loops instead of calling Math.max(...levels), which throws a RangeError on
 * very large arrays.
 */
export function summarizeLevels(levels: readonly number[]): LevelSummary | null {
  let count = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const level of levels) {
    if (typeof level !== 'number' || !Number.isFinite(level)) continue;
    count += 1;
    sum += level;
    if (level < min) min = level;
    if (level > max) max = level;
  }
  return count === 0 ? null : { count, average: sum / count, min, max };
}

export interface TrendChartDescription {
  /** 'hour' | 'day' | 'week' | 'month' */
  granularity: string;
  /** Every reading's dB value, not the per-period averages. */
  levels: readonly number[];
  /** Number of points on the x axis. */
  periods: number;
  /** Display labels of the first and last period. */
  firstPeriod: string;
  lastPeriod: string;
}

export function describeTrendChart(input: TrendChartDescription): string {
  const summary = summarizeLevels(input.levels);
  if (summary === null) {
    return 'Line chart of noise level over time. There are no readings to show.';
  }
  return (
    `Line chart of noise level by ${input.granularity}, from ${input.firstPeriod} to ${input.lastPeriod}. ` +
    `${formatCount(summary.count)} ${plural(summary.count, 'reading')} in ` +
    `${formatCount(input.periods)} ${plural(input.periods, input.granularity)}: ` +
    `average ${formatDb(summary.average)}, lowest ${formatDb(summary.min)}, peak ${formatDb(summary.max)}. ` +
    'Lines: average (solid), maximum (long dashes), minimum (short dashes).'
  );
}

export interface CategoryRow {
  category: string;
  avgDb: number;
  count: number;
}

export function describeCategoryChart(rows: readonly CategoryRow[]): string {
  if (rows.length === 0) {
    return 'Bar chart of average noise level by sound category. There are no categories to show.';
  }
  const items = rows.map(
    (row) =>
      `${row.category} ${formatDb(row.avgDb)} (${formatCount(row.count)} ${plural(row.count, 'reading')})`
  );
  return (
    `Bar chart of average noise level by sound category, ` +
    `${rows.length} ${plural(rows.length, 'category', 'categories')} in the order shown: ${items.join('; ')}.`
  );
}

export interface TypeRow {
  type: string;
  count: number;
  percentage: number;
}

export function describeTypeChart(rows: readonly TypeRow[]): string {
  if (rows.length === 0) {
    return 'Pie chart of sound types. There are no readings to show.';
  }
  const items = rows.map(
    (row) =>
      `${row.type} ${row.percentage}% (${formatCount(row.count)} ${plural(row.count, 'reading')})`
  );
  return `Pie chart of sound types: ${items.join('; ')}.`;
}
```

3b. New file `src/lib/__tests__/chartSummary.test.ts` — full contents:

```ts
import { describe, expect, it } from 'vitest';
import {
  describeCategoryChart,
  describeTrendChart,
  describeTypeChart,
  formatDb,
  summarizeLevels,
} from '../chartSummary';

describe('formatDb', () => {
  it('rounds to one decimal and pads', () => {
    expect(formatDb(58.24)).toBe('58.2 dB');
    expect(formatDb(96)).toBe('96.0 dB');
  });
});

describe('summarizeLevels', () => {
  it('returns null when there is nothing usable', () => {
    expect(summarizeLevels([])).toBeNull();
    expect(summarizeLevels([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  it('summarises the finite values and skips the rest', () => {
    expect(summarizeLevels([40, 60, Number.NaN, 80])).toEqual({
      count: 3,
      average: 60,
      min: 40,
      max: 80,
    });
  });

  it('copes with very large inputs (no argument spreading)', () => {
    const levels = Array.from({ length: 200_000 }, (_, i) => i % 100);
    const summary = summarizeLevels(levels);
    expect(summary?.count).toBe(200_000);
    expect(summary?.max).toBe(99);
    expect(summary?.min).toBe(0);
  });
});

describe('describeTrendChart', () => {
  it('states the range, the count and the three levels', () => {
    const text = describeTrendChart({
      granularity: 'day',
      levels: [50, 60, 70],
      periods: 2,
      firstPeriod: 'Feb 14',
      lastPeriod: 'Feb 15',
    });
    expect(text).toContain('Line chart of noise level by day, from Feb 14 to Feb 15');
    expect(text).toContain('3 readings in 2 days');
    expect(text).toContain('average 60.0 dB');
    expect(text).toContain('lowest 50.0 dB');
    expect(text).toContain('peak 70.0 dB');
    expect(text).toContain('maximum (long dashes)');
  });

  it('uses singular nouns for one reading in one period', () => {
    const text = describeTrendChart({
      granularity: 'hour',
      levels: [42],
      periods: 1,
      firstPeriod: 'Feb 14, 9 AM',
      lastPeriod: 'Feb 14, 9 AM',
    });
    expect(text).toContain('1 reading in 1 hour');
  });

  it('says so when there are no readings', () => {
    const text = describeTrendChart({
      granularity: 'day',
      levels: [],
      periods: 0,
      firstPeriod: '',
      lastPeriod: '',
    });
    expect(text).toContain('no readings');
  });
});

describe('describeCategoryChart', () => {
  it('lists every category with its average and count', () => {
    const text = describeCategoryChart([
      { category: 'Traffic', avgDb: 78.2, count: 25 },
      { category: 'Quiet', avgDb: 31, count: 1 },
    ]);
    expect(text).toContain('2 categories');
    expect(text).toContain('Traffic 78.2 dB (25 readings)');
    expect(text).toContain('Quiet 31.0 dB (1 reading)');
  });

  it('handles an empty list', () => {
    expect(describeCategoryChart([])).toContain('no categories');
  });
});

describe('describeTypeChart', () => {
  it('lists each type with its share and count', () => {
    const text = describeTypeChart([
      { type: 'Ambient', count: 595, percentage: 86 },
      { type: 'Pollution', count: 96, percentage: 14 },
    ]);
    expect(text).toBe(
      'Pie chart of sound types: Ambient 86% (595 readings); Pollution 14% (96 readings).'
    );
  });
});
```

3c. `NoiseTrendChart.tsx`: import the helpers. Single-line anchor. 04.2r, 05.4h and 06.4c each append an import line after it, so the new line simply sits directly under it.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, line 7, verbatim):
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

AFTER:
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { describeTrendChart } from '@/lib/chartSummary';
```

3d. The trend chart is a named, keyboard-explorable image.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 191-193, verbatim):
```tsx
      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={groupedData}>
```

AFTER:
```tsx
      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={groupedData}
            accessibilityLayer
            role="img"
            aria-label={describeTrendChart({
              granularity,
              levels: readings.map((reading) => reading.decibelLevel),
              periods: groupedData.length,
              firstPeriod: formatLabel(groupedData[0].timestamp),
              lastPeriod: formatLabel(groupedData[groupedData.length - 1].timestamp),
            })}
          >
```

3e. The Maximum and Minimum lines differ by dash pattern as well as by colour.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, lines 244-259, verbatim):
```tsx
            <Line 
              type="monotone" 
              dataKey="maxDb" 
              stroke="#F44336" 
              strokeWidth={2}
              dot={false}
              name="Maximum"
            />
            <Line 
              type="monotone" 
              dataKey="minDb" 
              stroke="#4CAF50" 
              strokeWidth={2}
              dot={false}
              name="Minimum"
            />
```

AFTER:
```tsx
            <Line 
              type="monotone" 
              dataKey="maxDb" 
              stroke="#F44336" 
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={false}
              name="Maximum"
            />
            <Line 
              type="monotone" 
              dataKey="minDb" 
              stroke="#4CAF50" 
              strokeWidth={2}
              strokeDasharray="2 3"
              dot={false}
              name="Minimum"
            />
```

3f. `CategoryChart.tsx`: import. Single-line anchor; 05.4k and 06.2a append import lines after it.

BEFORE (`src/components/analytics/CategoryChart.tsx`, line 5, verbatim):
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

AFTER:
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { describeCategoryChart } from '@/lib/chartSummary';
```

3g. The category chart is a named, keyboard-explorable image. Its bars already carry category names on the y axis, so colour is not the only cue; the label gives screen-reader users the same data.

BEFORE (`src/components/analytics/CategoryChart.tsx`, lines 129-131, verbatim):
```tsx
      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={categoryData} layout="vertical" margin={{ left: 20, right: 30, top: 20, bottom: 60 }}>
```

AFTER:
```tsx
      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={categoryData}
            layout="vertical"
            margin={{ left: 20, right: 30, top: 20, bottom: 60 }}
            accessibilityLayer
            role="img"
            aria-label={describeCategoryChart(categoryData)}
          >
```

3h. `SoundTypeChart.tsx`: import. Single-line anchor; 05.4n appends an import line after it.

BEFORE (`src/components/analytics/SoundTypeChart.tsx`, line 5, verbatim):
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
```

AFTER:
```tsx
import { useSyncedReadings } from '@/hooks/useSyncedReadings';
import { describeTypeChart } from '@/lib/chartSummary';
```

3i. The pie is a named image. No `accessibilityLayer`: a pie has no axis coordinates, so the keyboard layer would add a tab stop that does nothing.

BEFORE (`src/components/analytics/SoundTypeChart.tsx`, line 92, verbatim):
```tsx
          <PieChart>
```

AFTER:
```tsx
          <PieChart role="img" aria-label={describeTypeChart(soundTypeData)}>
```

Placement notes:
- 3d and 3g use variables that exist after clusters 05 and 06: `readings`, `granularity`, `groupedData`, `formatLabel` (declared before every early return in `NoiseTrendChart`) and `categoryData`, `soundTypeData`. The `aria-label` expressions are plain calls inside JSX, not hooks, so they are safe below 05.4's early `if (loading)` returns. The main `return` is only reached when `groupedData.length > 0`, so `groupedData[0]` exists. After 06.4 the points are sorted by bucket start and `timestamp` is still the bucket key string, which `formatLabel` accepts.
- 06.4 and 04.2 edit the data code above 3d, and 05.4 edits the empty-state block above it; none touches the chart opening lines or the `Line` elements (06.4's placement note says so for the chart markup).
- 06.3 filters unclassified readings out of `categoryData` and adds a visible caption; the `aria-label` therefore describes exactly the bars drawn, and the caption (a normal `<p>`) is read separately.
- recharts passes `role` and `aria-label` to the `<svg>` and lets `role` override the keyboard layer's default `application` role (see Environment facts). `aria-label` is a hyphenated JSX attribute, so TypeScript does not require it in the prop types.
- Why `role="img"` on the `<svg>` and not on a wrapper `<div>`: a wrapper with `role="img"` makes its subtree presentational, which would hide the keyboard layer's focusable `<svg>` from assistive technology.

**Edge cases to preserve**
- Colours, axes, tooltips, the hidden legends and the swatch lists below the charts are unchanged; only attributes are added.
- The `strokeDasharray` values show in the recharts legend icon too, so the legend still matches the lines.
- The trend summary describes every reading (mean, min and max of the raw values), not an average of per-period averages, so it matches the Stats cards.
- Empty and loading branches (05.4, 06.3) render before these charts and are untouched.
- Hover behaviour is unchanged. The new tab stop appears only on the line and bar charts; the pie is not focusable.

**Acceptance criteria**
- `npx vitest run src/lib/__tests__/chartSummary.test.ts` reports all tests passing.
- DevTools → Accessibility on `/analytics`: the trend chart `<svg>` has role `img`, is focusable, and its name reads like "Line chart of noise level by day, from … to …. 3,374 readings in … days: average … dB, lowest … dB, peak … dB. Lines: average (solid), maximum (long dashes), minimum (short dashes)." The category chart's name lists each category with its average and count. The pie's name reads "Pie chart of sound types: Ambient … (…); Pollution … (…)."
- Keyboard: Tab to the trend chart, press Right and Left; the tooltip moves between points. Tab reaches the category chart the same way. The pie is skipped.
- The Maximum line is dashed with long dashes, the Minimum line with short dashes, in the chart and in its legend.

**Verify**
```
npx tsc -b
npx eslint src/lib/chartSummary.ts src/lib/__tests__/chartSummary.test.ts src/components/analytics/NoiseTrendChart.tsx src/components/analytics/CategoryChart.tsx src/components/analytics/SoundTypeChart.tsx
npx vitest run src/lib/__tests__/chartSummary.test.ts
```
Manual: the acceptance checks above. Do NOT run `npm run build` in this step.

**Commit title:** `fix(a11y): text summaries, accessibilityLayer and non-colour cues for charts (a11y-3)`

---

### Step 4 — a11y-4, a11y-5: raise text and badge contrast to WCAG AA and add band glyphs to pins

**Goal:** Secondary text meets 4.5:1 in both themes. The dB band badges use dark text (6.09:1 on green, 7.86:1 on orange, 4.60:1 on red) and carry a per-band glyph; map pins and the legend carry the same glyph (circle for Low, square for Moderate, triangle for High), so a colour-blind user can tell the bands apart. The primary-button foreground follows the theme colour's luminance instead of always being white. Band colours themselves do not change; the changes live in `src/lib/noiseBands.ts` (master §4.11).

**Files:**
- `src/lib/contrast.ts` (new)
- `src/lib/__tests__/contrast.test.ts` (new)
- `src/lib/noiseBands.ts`
- `src/components/BandGlyph.tsx` (new)
- `src/components/map/NoiseMarkers.tsx`
- `src/components/map/MapLegend.tsx` (semantic edit, created by 09.4)
- `src/components/analytics/DataTable.tsx`
- `src/components/analytics/StatsCards.tsx`
- `src/components/analytics/NoiseTrendChart.tsx`
- `src/components/analytics/CategoryChart.tsx`
- `src/components/analytics/SoundTypeChart.tsx`
- `src/components/map/SyncStatus.tsx`
- `src/pages/MapPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/LoginPage.tsx`
- `src/contexts/ThemeContext.tsx`
- `src/index.css`

**Exact changes**

4a. New file `src/lib/contrast.ts` — full contents:

```ts
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
```

4b. New file `src/lib/__tests__/contrast.test.ts` — full contents. It also guards the band colours, so a later colour edit cannot silently drop below AA.

```ts
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
```

4c. `src/lib/noiseBands.ts`: the band shape gets a text colour and a glyph. Both BEFORE blocks are the text 06.1b created.

BEFORE (`src/lib/noiseBands.ts`, as left by 06.1b, verbatim):
```ts
export interface NoiseBand {
  id: NoiseBandId;
  label: 'Low' | 'Moderate' | 'High';
  color: string;
}
```

AFTER:
```ts
export type BandGlyphShape = 'circle' | 'square' | 'triangle';

export interface NoiseBand {
  id: NoiseBandId;
  label: 'Low' | 'Moderate' | 'High';
  color: string;
  /** Text colour for badges drawn on `color`; WCAG AA (>= 4.5:1), asserted by contrast.test.ts. */
  textColor: string;
  /** Shape drawn in map pins and legend swatches, so a band is never told by colour alone. */
  glyph: BandGlyphShape;
}
```

BEFORE (`src/lib/noiseBands.ts`, as left by 06.1b, verbatim):
```ts
export const NOISE_BANDS: Readonly<Record<NoiseBandId, NoiseBand>> = {
  low: { id: 'low', label: 'Low', color: '#4CAF50' },
  moderate: { id: 'moderate', label: 'Moderate', color: '#FF9800' },
  high: { id: 'high', label: 'High', color: '#F44336' },
};
```

AFTER:
```ts
export const NOISE_BANDS: Readonly<Record<NoiseBandId, NoiseBand>> = {
  low: { id: 'low', label: 'Low', color: '#4CAF50', textColor: '#1E1932', glyph: 'circle' },
  moderate: { id: 'moderate', label: 'Moderate', color: '#FF9800', textColor: '#1E1932', glyph: 'square' },
  high: { id: 'high', label: 'High', color: '#F44336', textColor: '#1E1932', glyph: 'triangle' },
};
```

The pin helper is added after `noiseBand()`. This anchors on the function as 06.1b left it; 07.3a appends `DB_CAVEAT` after it with a blank line, so the new code lands between the two.

BEFORE (`src/lib/noiseBands.ts`, as left by 06.1b; 07.3a anchors on the same function, verbatim):
```ts
/** Band for a finite dB value. Callers pass finite numbers (normalizeReading drops other docs). */
export function noiseBand(decibels: number): NoiseBand {
  if (decibels < LOW_BAND_BELOW_DB) return NOISE_BANDS.low;
  if (decibels <= MODERATE_BAND_MAX_DB) return NOISE_BANDS.moderate;
  return NOISE_BANDS.high;
}
```

AFTER:
```ts
/** Band for a finite dB value. Callers pass finite numbers (normalizeReading drops other docs). */
export function noiseBand(decibels: number): NoiseBand {
  if (decibels < LOW_BAND_BELOW_DB) return NOISE_BANDS.low;
  if (decibels <= MODERATE_BAND_MAX_DB) return NOISE_BANDS.moderate;
  return NOISE_BANDS.high;
}

const PIN_GLYPH_INK = '#1E1932';

// Static SVG fragments for the centre of a map pin (32x42 pin, white disc of
// radius 6 at 16,14). They contain no reading data, only fixed shapes.
const PIN_GLYPH_MARKUP: Readonly<Record<BandGlyphShape, string>> = {
  circle: `<circle cx="16" cy="14" r="4" fill="${PIN_GLYPH_INK}"/>`,
  square: `<rect x="12" y="10" width="8" height="8" fill="${PIN_GLYPH_INK}"/>`,
  triangle: `<path d="M16 9.5 L20.5 17.5 L11.5 17.5 Z" fill="${PIN_GLYPH_INK}"/>`,
};

/**
 * Centre glyph for the pin drawn in a band colour (a11y-5). A colour that is
 * not a band colour (the grey empty-state pin) gets a plain grey dot.
 */
export function bandMarkerGlyph(color: string): string {
  const wanted = color.toUpperCase();
  const band = Object.values(NOISE_BANDS).find((candidate) => candidate.color.toUpperCase() === wanted);
  return band ? PIN_GLYPH_MARKUP[band.glyph] : '<circle cx="16" cy="14" r="4" fill="#9E9E9E"/>';
}
```

4d. New file `src/components/BandGlyph.tsx` — full contents. It is plain JSX (no HTML strings), shared by the table badge, the popup badge and the legend.

```tsx
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
```

4e. `NoiseMarkers.tsx`: imports. Single-line anchor on the `noiseBands` import that 09.1c's whole-file AFTER writes. It is identical whether D5 ran 09.6 or skipped it. (Corrected 2026-10-16 by the playbook dry run: the original anchor, HEAD's `import { Icon } from 'leaflet';`, no longer exists after 09.1c, which writes `import L, { Icon } from 'leaflet';`.)

BEFORE (`src/components/map/NoiseMarkers.tsx`, as left by 09.1c / 09.5 / 09.6, verbatim):
```tsx
import { NOISE_BANDS, noiseBand } from '@/lib/noiseBands';
```

AFTER:
```tsx
import { bandMarkerGlyph, NOISE_BANDS, noiseBand } from '@/lib/noiseBands';
import { BandGlyph } from '@/components/BandGlyph';
```

4f. `NoiseMarkers.tsx`: the pin's centre dot becomes the band glyph. If 09.5 renamed the `color` parameter of `createMarkerIcon`, pass whatever variable holds the band colour; the helper accepts any `#RRGGBB` string.

BEFORE (`src/components/map/NoiseMarkers.tsx`, lines 21-22, verbatim):
```tsx
        <!-- Colored center dot -->
        <circle cx="16" cy="14" r="4" fill="${color}"/>
```

AFTER:
```tsx
        <!-- Band glyph (circle / square / triangle) so the band is not told by colour alone -->
        ${bandMarkerGlyph(color)}
```

4g. `NoiseMarkers.tsx`: the popup's dB badge becomes exactly what `DbBadge` renders (dark band text colour, band glyph, band label), edited in place. Three single-line anchors, each written WITHOUT its leading indentation, because that indentation differs by D5 outcome (20 spaces if 09.6 was skipped, 12 if 09.6 moved the popup into its own component). Each anchor occurs exactly once in either version. The popup's `band` (`noiseBand(reading.decibelLevel)`, written by 09.5) is already in scope. (Corrected 2026-10-16 by the playbook dry run: the original block was HEAD text with `getMarkerColor`, which 09.1c/09.5 replaced. That made it a guaranteed miss.)

4g-1. Badge classes: dark text instead of `text-white`, room for the glyph.

BEFORE (`src/components/map/NoiseMarkers.tsx`, as left by 09.5 / 09.6, verbatim, no leading indentation):
```tsx
className="px-2 py-1 rounded text-xs font-semibold text-white"
```

AFTER:
```tsx
className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold"
```

4g-2. Badge colours: the band's AA text colour from 4c.

BEFORE (`src/components/map/NoiseMarkers.tsx`, as left by 09.5 / 09.6, verbatim, no leading indentation):
```tsx
style={{ backgroundColor: band.color }}
```

AFTER:
```tsx
style={{ backgroundColor: band.color, color: band.textColor }}
```

4g-3. Badge content: glyph plus band label, so the band is not told by colour alone.

BEFORE (`src/components/map/NoiseMarkers.tsx`, as left by 09.5 / 09.6, verbatim, no leading indentation):
```tsx
{reading.decibelLevel.toFixed(1)} dB
```

AFTER:
```tsx
<BandGlyph shape={band.glyph} />{reading.decibelLevel.toFixed(1)} dB ({band.label})
```

4h. `DataTable.tsx`: imports. Single-line anchor on the Lucide import (04.2n, 06.3g and 07.2k add lines after line 14; 07.2j edits lines 3-4).

BEFORE (`src/components/analytics/DataTable.tsx`, line 15, verbatim):
```tsx
import { ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react';
```

AFTER:
```tsx
import { ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { noiseBand } from '@/lib/noiseBands';
import { DbBadge } from '@/components/BandGlyph';
```

4i. `DataTable.tsx`: the local band copies go; the row accent colour reads the shared band. `getNoiseLevelLabel` has no remaining caller once the badge uses `DbBadge`, so it is deleted rather than left unused.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 146-158, verbatim):
```tsx
  // Get noise level color
  const getNoiseLevelColor = (dB: number) => {
    if (dB < 50) return isDarkMode ? '#4CAF50' : '#4CAF50';
    if (dB <= 70) return isDarkMode ? '#FF9800' : '#FF9800';
    return isDarkMode ? '#F44336' : '#F44336';
  };

  // Get noise level label
  const getNoiseLevelLabel = (dB: number) => {
    if (dB < 50) return 'Low';
    if (dB <= 70) return 'Moderate';
    return 'High';
  };
```

AFTER:
```tsx
  // Row accent colour: the shared band colour (src/lib/noiseBands.ts).
  const getNoiseLevelColor = (dB: number) => noiseBand(dB).color;
```

4j. `DataTable.tsx`: the dB cell uses the shared badge.

BEFORE (`src/components/analytics/DataTable.tsx`, lines 243-248, verbatim):
```tsx
                    <span
                      className="px-2 py-1 rounded text-xs font-semibold text-white"
                      style={{ backgroundColor: getNoiseLevelColor(reading.decibelLevel) }}
                    >
                      {reading.decibelLevel.toFixed(1)} dB ({getNoiseLevelLabel(reading.decibelLevel)})
                    </span>
```

AFTER:
```tsx
                    <DbBadge decibels={reading.decibelLevel} />
```

4k. `StatsCards.tsx`: stat labels and units. Four single-line `h3` anchors and two unit anchors (05.4g changes the top of the file and 07.3c the bottom; these lines are untouched). `cn` and `isDarkMode` are already in scope.

BEFORE (`src/components/analytics/StatsCards.tsx`, line 41, verbatim):
```tsx
          <h3 className="text-xs sm:text-sm font-medium text-gray-500">Total Readings</h3>
```

AFTER:
```tsx
          <h3 className={cn('text-xs sm:text-sm font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>Total Readings</h3>
```

BEFORE (`src/components/analytics/StatsCards.tsx`, line 58, verbatim):
```tsx
          <h3 className="text-xs sm:text-sm font-medium text-gray-500">Avg Noise Level</h3>
```

AFTER:
```tsx
          <h3 className={cn('text-xs sm:text-sm font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>Avg Noise Level</h3>
```

BEFORE (`src/components/analytics/StatsCards.tsx`, line 65, verbatim):
```tsx
          {stats.avgNoiseLevel} <span className="text-sm font-normal text-gray-500">dB</span>
```

AFTER:
```tsx
          {stats.avgNoiseLevel} <span className={cn('text-sm font-normal', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>dB</span>
```

BEFORE (`src/components/analytics/StatsCards.tsx`, line 75, verbatim):
```tsx
          <h3 className="text-xs sm:text-sm font-medium text-gray-500">Peak Noise</h3>
```

AFTER:
```tsx
          <h3 className={cn('text-xs sm:text-sm font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>Peak Noise</h3>
```

BEFORE (`src/components/analytics/StatsCards.tsx`, line 82, verbatim):
```tsx
          {stats.maxNoiseLevel} <span className="text-sm font-normal text-gray-500">dB</span>
```

AFTER:
```tsx
          {stats.maxNoiseLevel} <span className={cn('text-sm font-normal', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>dB</span>
```

BEFORE (`src/components/analytics/StatsCards.tsx`, line 92, verbatim):
```tsx
          <h3 className="text-xs sm:text-sm font-medium text-gray-500">Active Users</h3>
```

AFTER:
```tsx
          <h3 className={cn('text-xs sm:text-sm font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-600')}>Active Users</h3>
```

4l. Chart empty-state and legend count text. Each anchor is a single line that 05.4 and 06.3 keep verbatim. Gray-500 on the #322E4A chart card is 2.7:1; gray-300 is 8.8:1, and gray-600 on white is 7.6:1.

BEFORE (`src/components/analytics/NoiseTrendChart.tsx`, line 158, verbatim):
```tsx
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
```

AFTER:
```tsx
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-300" : "text-gray-600")}>
```

BEFORE (`src/components/analytics/CategoryChart.tsx`, line 111, verbatim):
```tsx
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
```

AFTER:
```tsx
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-300" : "text-gray-600")}>
```

BEFORE (`src/components/analytics/CategoryChart.tsx`, line 222, verbatim):
```tsx
            <span className={cn("text-xs shrink-0", isDarkMode ? "text-gray-500" : "text-gray-500")}>
```

AFTER:
```tsx
            <span className={cn("text-xs shrink-0", isDarkMode ? "text-gray-300" : "text-gray-600")}>
```

BEFORE (`src/components/analytics/SoundTypeChart.tsx`, line 72, verbatim):
```tsx
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-500" : "text-gray-500")}>
```

AFTER:
```tsx
            <p className={cn("text-xs mt-1", isDarkMode ? "text-gray-300" : "text-gray-600")}>
```

4m. `SyncStatus.tsx` (as left by 05.6c): the cached-count text.

BEFORE (`src/components/map/SyncStatus.tsx`, as left by 05.6c, verbatim):
```tsx
            isDarkMode ? 'text-gray-500' : 'text-gray-400'
```

AFTER:
```tsx
            isDarkMode ? 'text-gray-300' : 'text-gray-600'
```

4n. `MapLegend.tsx` (created by 09.4). **There is no BEFORE block: the file does not exist at HEAD and 09.4's text was not available when this spec was written. Apply this semantically.** In `MapLegend.tsx`, find the element for each of the three bands (the small swatch whose `backgroundColor` comes from `NOISE_BANDS` or `noiseBand()`), and render the band glyph inside it or directly beside it:

```tsx
import { BandGlyph } from '@/components/BandGlyph';
// …inside the per-band row, next to the label text:
<BandGlyph shape={band.glyph} />
```

where `band` is the `NoiseBand` the row is drawn for (`NOISE_BANDS.low`, `.moderate`, `.high`, or the loop variable). Keep 09.4's labels, ranges and `DB_CAVEAT` text exactly as they are. If the swatch is a coloured `<span>`/`<div>`, make it `inline-flex items-center justify-center` and put `<BandGlyph … className="text-[#1E1932]" />` inside it; if the swatch is an SVG gradient bar, put the glyphs beside the three labels instead.

4o. `MapPage.tsx`: the four helper texts in the filter panel (`Data Source`, `Date Range`, `Data Management` and the "More filters" list). `text-gray-500` on the dark panel (#2D2640) is 2.97:1 and `text-gray-400` on white is 2.54:1; gray-300 and gray-600 are 9.7:1 and 7.6:1. The colour line is identical in all four places, so each block below carries one distinguishing neighbour line. If a neighbour was reworded by 09.x, find the paragraph by its text and change only the `isDarkMode ? 'text-gray-500' : 'text-gray-400'` line.

BEFORE (`src/pages/MapPage.tsx`, lines 207-209, verbatim):
```tsx
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              {showAllUsers 
```

AFTER:
```tsx
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              {showAllUsers 
```

BEFORE (`src/pages/MapPage.tsx`, as left by cluster 09, verbatim; HEAD lines 226-228 read `{dateRange`, which 09 replaced with the preset summary. Corrected 2026-10-16 by the playbook dry run):
```tsx
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              {presetSummary(datePreset)}
```

AFTER:
```tsx
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              {presetSummary(datePreset)}
```

BEFORE (`src/pages/MapPage.tsx`, as left by 05.6g; the HEAD text at lines 252-254 is a different sentence, verbatim):
```tsx
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              Re-download every reading from Firebase. The cache is replaced only after the download succeeds.
```

AFTER:
```tsx
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Re-download every reading from Firebase. The cache is replaced only after the download succeeds.
```

BEFORE (`src/pages/MapPage.tsx`, lines 265-267, verbatim):
```tsx
            <ul className={`text-xs mt-2 space-y-1 ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
```

AFTER:
```tsx
            <ul className={`text-xs mt-2 space-y-1 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
```

4p. `DashboardPage.tsx`: the map-failure hint. Single-line anchor, unique in the file.

BEFORE (`src/pages/DashboardPage.tsx`, line 132, verbatim):
```tsx
                      isDarkMode ? 'text-gray-500' : 'text-gray-500'
```

AFTER:
```tsx
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
```

4q. `LoginPage.tsx`: imports. Single-line anchor (08.3c edits lines 4-5, not this one).

BEFORE (`src/pages/LoginPage.tsx`, line 17, verbatim):
```tsx
import { FLUTTER_THEME_COLORS } from '@/utils/themeConstants';
```

AFTER:
```tsx
import { FLUTTER_THEME_COLORS } from '@/utils/themeConstants';
import { readableTextColor } from '@/lib/contrast';
```

4r. `LoginPage.tsx`: the Sign In button's foreground follows the theme colour.

BEFORE (`src/pages/LoginPage.tsx`, lines 235-243, verbatim):
```tsx
                <Button
                  type="submit"
                  className="w-full h-10 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 text-sm"
                  disabled={isLoading}
                  style={{ 
                    backgroundColor: themeColor,
                    boxShadow: `0 4px 14px ${themeColor}40`,
                  }}
                >
```

AFTER:
```tsx
                <Button
                  type="submit"
                  className="w-full h-10 font-semibold shadow-lg hover:shadow-xl transition-all duration-300 text-sm"
                  disabled={isLoading}
                  style={{ 
                    backgroundColor: themeColor,
                    color: readableTextColor(themeColor),
                    boxShadow: `0 4px 14px ${themeColor}40`,
                  }}
                >
```

4s. `LoginPage.tsx`: the password toggle (as 08.3j left it; the class line is unchanged by 05.7 and 08.3).

BEFORE (`src/pages/LoginPage.tsx`, line 201, verbatim):
```tsx
                      className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`}
```

AFTER:
```tsx
                      className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-800'} transition-colors`}
```

4t. `LoginPage.tsx`: the error text (as 08.3k left it, inside the `role="alert"` container). 12 px `text-red-500` is 3.8:1 on white.

BEFORE (`src/pages/LoginPage.tsx`, line 230, verbatim):
```tsx
                    <p className="text-xs text-red-500">{error}</p>
```

AFTER:
```tsx
                    <p className={`text-sm ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{error}</p>
```

4u. `LoginPage.tsx`: the 10 px divider label and footer (08.1 edits `:254-257`, 08.3 other lines; these are untouched).

BEFORE (`src/pages/LoginPage.tsx`, lines 274-277, verbatim):
```tsx
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                  <span className={`px-3 ${isDarkMode ? 'bg-[#2D2640] text-gray-500' : 'bg-white text-gray-500'}`}>
                    Secured by Firebase
                  </span>
```

AFTER:
```tsx
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className={`px-3 ${isDarkMode ? 'bg-[#2D2640] text-gray-400' : 'bg-white text-gray-600'}`}>
                    Secured by Firebase
                  </span>
```

BEFORE (`src/pages/LoginPage.tsx`, line 282, verbatim):
```tsx
              <p className="text-center text-[10px] text-gray-500 font-medium tracking-wide">
```

AFTER:
```tsx
              <p className={`text-center text-xs font-medium tracking-wide ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
```

4v. `ThemeContext.tsx`: import. Single-line anchor.

BEFORE (`src/contexts/ThemeContext.tsx`, line 2, verbatim):
```tsx
import { FLUTTER_THEME_COLORS } from '@/utils/themeConstants';
```

AFTER:
```tsx
import { FLUTTER_THEME_COLORS } from '@/utils/themeConstants';
import { readableTextColor } from '@/lib/contrast';
```

4w. `ThemeContext.tsx`: publish the readable foreground next to the primary colour. The effect already runs on every colour change.

BEFORE (`src/contexts/ThemeContext.tsx`, lines 125-126, verbatim):
```tsx
      document.documentElement.style.setProperty('--primary-color', oklch);
      document.documentElement.style.setProperty('--primary-color-hex', color);
```

AFTER:
```tsx
      document.documentElement.style.setProperty('--primary-color', oklch);
      document.documentElement.style.setProperty('--primary-color-hex', color);
      document.documentElement.style.setProperty('--primary-foreground-hex', readableTextColor(color));
```

4x. `index.css`: `--primary-foreground` follows it, in both themes. The two blocks differ in their fourth line.

BEFORE (`src/index.css`, lines 58-61, verbatim):
```css
    /* Dynamic primary color - updated by ThemeContext (uses hex for exact color match) */
    --primary: var(--primary-color-hex, #6C63FF); /* Default Purple */
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
```

AFTER:
```css
    /* Dynamic primary color - updated by ThemeContext (uses hex for exact color match) */
    --primary: var(--primary-color-hex, #6C63FF); /* Default Purple */
    --primary-foreground: var(--primary-foreground-hex, oklch(0.985 0 0)); /* white or dark ink, by luminance (a11y-5) */
    --secondary: oklch(0.97 0 0);
```

BEFORE (`src/index.css`, lines 93-96, verbatim):
```css
    /* Dynamic primary color - updated by ThemeContext (uses hex for exact color match) */
    --primary: var(--primary-color-hex, #6C63FF); /* Default Purple */
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.269 0 0);
```

AFTER:
```css
    /* Dynamic primary color - updated by ThemeContext (uses hex for exact color match) */
    --primary: var(--primary-color-hex, #6C63FF); /* Default Purple */
    --primary-foreground: var(--primary-foreground-hex, oklch(0.985 0 0)); /* white or dark ink, by luminance (a11y-5) */
    --secondary: oklch(0.269 0 0);
```

Placement notes:
- **Band colours are not changed.** `#4CAF50`, `#FF9800` and `#F44336` stay, because they are the app's colours and the pins, heatmap and legend share them. Only text on them changes, so the colour-to-glyph lookup in `bandMarkerGlyph()` still matches whatever 09.5 passes to `createMarkerIcon`.
- 4i deletes only the two local band functions that 06 left for this step (06 Out of scope: "the table badge's `getNoiseLevelColor`/`getNoiseLevelLabel` (10.4)"). `getNoiseLevelColor` is kept as a one-line wrapper because the row accent border still calls it.
- The popup in 4g gains the band word and glyph through `DbBadge`; it is JSX, so convention 2.12 (no HTML-string sinks) still holds. `bandMarkerGlyph()` returns fixed shapes selected by a band lookup, with no reading field in the markup.
- 4o changes the same colour line in four paragraphs, each anchored by a neighbour line. After 09 the acceptance grep (`grep -n "'text-gray-500' : 'text-gray-400'" src/pages/MapPage.tsx` prints nothing) is the check.
- The LoginPage cards use the theme colour for some text links ('Forgot password?', 'Request access'); those are not changed here (see Out of scope).

**Edge cases to preserve**
- `--primary-foreground` still falls back to `oklch(0.985 0 0)` before `ThemeContext` runs its first effect, so the first paint is not unstyled.
- Purple, the default theme, keeps white text (4.32:1, the better of the two options, not quite 4.5). Pink (4.35:1) likewise. This is the best available with only white or the dark ink, and is noted in Risks.
- `bandMarkerGlyph()` returns a plain grey dot for a colour that is not a band colour, so the empty-state pin (`#9E9E9E`) keeps working until 09.3 removes it.
- `DbBadge` prints `58.2 dB (Moderate)`, the same text the table showed before; the popup now shows the band word too.
- `DataTable`'s row accent border and the 04/06/07 cell changes are untouched.
- No chart colours change. The category and trend line colours are non-text graphics.

**Acceptance criteria**
- `npx vitest run src/lib/__tests__/contrast.test.ts` reports all tests passing.
- `grep -rn "text-white" src/components/analytics/DataTable.tsx src/components/map/NoiseMarkers.tsx` prints nothing. `grep -n "'text-gray-500' : 'text-gray-400'" src/pages/MapPage.tsx src/components/map/SyncStatus.tsx` prints nothing. `grep -rn 'text-\[10px\]' src/pages/LoginPage.tsx` prints nothing.
- `/analytics` table: each dB badge has dark text and a circle, square or triangle before the number; a Moderate (orange) badge is readable at arm's length.
- `/map`: pins show a dark circle (green), square (orange) or triangle (red) in the white centre. The legend rows show the same shapes. A grayscale screenshot still lets the three bands be told apart.
- Theme colour Orange: the Sign In button, the `Filters` default-variant buttons and `Button` default variants show dark text; Indigo shows white.
- Dark theme `/dashboard`: stat labels and "dB" units are clearly legible (gray-300 on #2D2640 is 9.7:1). Light theme `/map` → Filters: helper paragraphs are readable.
- Login: the red error text is 14 px; the divider and footer are 12 px.

**Verify**
```
npx tsc -b
npx eslint src/lib/contrast.ts src/lib/__tests__/contrast.test.ts src/lib/noiseBands.ts src/components/BandGlyph.tsx src/components/map/NoiseMarkers.tsx src/components/map/MapLegend.tsx src/components/analytics/DataTable.tsx src/components/analytics/StatsCards.tsx src/components/analytics/NoiseTrendChart.tsx src/components/analytics/CategoryChart.tsx src/components/analytics/SoundTypeChart.tsx src/components/map/SyncStatus.tsx src/pages/MapPage.tsx src/pages/DashboardPage.tsx src/pages/LoginPage.tsx src/contexts/ThemeContext.tsx
npx vitest run src/lib/__tests__/contrast.test.ts
```
Manual: the acceptance checks above, in dark and light themes and with the Orange and Indigo primary colours. Do NOT run `npm run build` in this step.

**Commit title:** `fix(a11y): raise text and badge contrast to WCAG AA and add band glyphs to pins (a11y-4, a11y-5)`

---

### Step 5 — a11y-6: name map controls, expose toggle state, make the filter panel a dismissable dialog

**Goal:** On `/map`, Back has a name; the heatmap and Filters buttons expose `aria-pressed` and `aria-expanded`/`aria-controls`; the filter panel is a `role="dialog"` with a visible close button, closes on Esc, receives focus when it opens and returns it to the Filters button when it closes; the three section labels become group headings that label their controls; and one z-index scale makes the Radix dialog overlay (z-50) outrank every map overlay and sit under nothing on the page.

**Files:**
- `src/hooks/useDismissablePanel.ts` (new)
- `src/pages/MapPage.tsx`
- `src/components/Layout.tsx`
- `src/components/ui/dialog.tsx` (comment only)

**Exact changes**

5a. New file `src/hooks/useDismissablePanel.ts` — full contents:

```ts
import { useEffect, useRef, useState } from 'react';

/**
 * State and behaviour for a non-modal panel opened by a trigger button (a11y-6):
 * - Esc closes it, unless another layer (a Radix popover or dialog inside the
 *   panel) already consumed the key (it calls preventDefault in a capture-phase
 *   listener, which runs before this bubble-phase one);
 * - focus moves into the panel when it opens (give the panel `tabIndex={-1}`);
 * - focus returns to the trigger when it closes.
 */
export function useDismissablePanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      panelRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return { open, setOpen, panelRef, triggerRef };
}
```

5b. `MapPage.tsx`: imports. Single-line anchor on the `SyncStatus` import, which 05.6 and 09 leave alone. The second Lucide import is deliberate: it avoids matching line 12, which 09 may edit, and costs nothing.

BEFORE (`src/pages/MapPage.tsx`, line 7, verbatim):
```tsx
import { SyncStatus } from '@/components/map/SyncStatus';
```

AFTER:
```tsx
import { SyncStatus } from '@/components/map/SyncStatus';
import { useDismissablePanel } from '@/hooks/useDismissablePanel';
import { X } from 'lucide-react';
```

5c. `MapPage.tsx`: the Filters state comes from the hook, under the same two names, so every other reference (including any that 09.3 adds) keeps working.

BEFORE (`src/pages/MapPage.tsx`, line 22, verbatim):
```tsx
  const [showFilters, setShowFilters] = useState(false);
```

AFTER:
```tsx
  const { open: showFilters, setOpen: setShowFilters, panelRef, triggerRef } = useDismissablePanel();
```

5d. `MapPage.tsx`: the top bar leaves the 300-range z-index for the page scale (see 5j). Single-line anchor; Step 7 anchors on its AFTER text.

BEFORE (`src/pages/MapPage.tsx`, line 55, verbatim):
```tsx
        className={`absolute top-4 right-4 z-[300] flex flex-col sm:flex-row items-center gap-2 sm:gap-3 h-auto sm:h-12 ${
```

AFTER:
```tsx
        className={`absolute top-4 right-4 z-20 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 h-auto sm:h-12 ${
```

5e. `MapPage.tsx`: the Back button gets a name.

BEFORE (`src/pages/MapPage.tsx`, lines 67-74, verbatim):
```tsx
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            className="shrink-0 h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
```

AFTER:
```tsx
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
            className="shrink-0 h-8 w-8"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
```

5f. `MapPage.tsx`: the heatmap toggle exposes its state.

BEFORE (`src/pages/MapPage.tsx`, lines 96-104, verbatim):
```tsx
          <Button
            variant={showHeatmap ? "default" : "outline"}
            size="icon"
            onClick={() => setShowHeatmap(!showHeatmap)}
            className="h-8 w-8"
            title="Toggle heatmap"
          >
            <Layers className="h-3.5 w-3.5" />
          </Button>
```

AFTER:
```tsx
          <Button
            variant={showHeatmap ? "default" : "outline"}
            size="icon"
            onClick={() => setShowHeatmap(!showHeatmap)}
            className="h-8 w-8"
            title="Toggle heatmap"
            aria-label="Heatmap"
            aria-pressed={showHeatmap}
          >
            <Layers className="h-3.5 w-3.5" />
          </Button>
```

5g. `MapPage.tsx`: the Filters button owns the panel (`ref`, `aria-expanded`, `aria-controls`).

BEFORE (`src/pages/MapPage.tsx`, lines 107-115, verbatim):
```tsx
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8 w-8"
            title="Filters"
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
```

AFTER:
```tsx
          <Button
            ref={triggerRef}
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8 w-8"
            title="Filters"
            aria-label="Filters"
            aria-expanded={showFilters}
            aria-controls="map-filters-panel"
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
```

5h. `MapPage.tsx`: the marker-count badge joins the scale. Single-line anchor.

BEFORE (`src/pages/MapPage.tsx`, line 131, verbatim):
```tsx
      <div className={`absolute bottom-4 left-4 z-[400] px-3 py-1.5 rounded-lg shadow-lg ${
```

AFTER:
```tsx
      <div className={`absolute bottom-4 left-4 z-20 px-3 py-1.5 rounded-lg shadow-lg ${
```

5i. `MapPage.tsx`: the filter panel becomes a non-modal dialog with a heading, a close button and focus handling.

BEFORE (`src/pages/MapPage.tsx`, lines 188-193, verbatim):
```tsx
      {/* Filter Panel */}
      {showFilters && (
        <div className={`absolute top-20 left-4 w-80 z-[399] rounded-lg shadow-lg p-4 ${
          isDarkMode ? 'bg-[#2D2640]' : 'bg-white'
        }`}>
          <h3 className="font-semibold mb-4">Filters</h3>
```

AFTER:
```tsx
      {/* Filter Panel: a non-modal dialog (a11y-6). Esc closes it, focus moves in
          when it opens and returns to the Filters button when it closes. */}
      {showFilters && (
        <div
          ref={panelRef}
          id="map-filters-panel"
          role="dialog"
          aria-labelledby="map-filters-title"
          tabIndex={-1}
          className={`absolute top-20 left-4 w-80 z-30 rounded-lg shadow-lg p-4 outline-none ${
            isDarkMode ? 'bg-[#2D2640]' : 'bg-white'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 id="map-filters-title" className="font-semibold">Filters</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowFilters(false)}
              className="h-8 w-8"
              aria-label="Close filters"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
```

5j. `MapPage.tsx`: the three `<label>` elements label nothing (their neighbours are buttons and a popover trigger). Each section becomes a group named by a heading paragraph. The first two blocks are HEAD text; the third is identical in 05.6g's AFTER.

BEFORE (`src/pages/MapPage.tsx`, lines 196-201, verbatim):
```tsx
          <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <label className={`text-sm font-medium mb-2 block ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Data Source
            </label>
```

AFTER:
```tsx
          <div role="group" aria-labelledby="map-filter-source-label" className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <p id="map-filter-source-label" className={`text-sm font-medium mb-2 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Data Source
            </p>
```

BEFORE (`src/pages/MapPage.tsx`, lines 216-221, verbatim):
```tsx
          <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <label className={`text-sm font-medium mb-2 block ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Date Range
            </label>
```

AFTER:
```tsx
          <div role="group" aria-labelledby="map-filter-date-label" className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <p id="map-filter-date-label" className={`text-sm font-medium mb-2 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Date Range
            </p>
```

BEFORE (`src/pages/MapPage.tsx`, lines 235-240, verbatim):
```tsx
          <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <label className={`text-sm font-medium mb-2 block ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Data Management
            </label>
```

AFTER:
```tsx
          <div role="group" aria-labelledby="map-filter-data-label" className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <p id="map-filter-data-label" className={`text-sm font-medium mb-2 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Data Management
            </p>
```

5k. `Layout.tsx`: the sidebar joins the scale. It is above its own backdrop (z-40) and below every Radix layer (z-50). The BEFORE is the line Step 1 (1d) wrote.

BEFORE (`src/components/Layout.tsx`, line 55, verbatim):
```tsx
          'fixed lg:static inset-y-0 left-0 z-[500] flex flex-col border-r transition-all duration-300 overflow-hidden',
```

AFTER:
```tsx
          'fixed lg:static inset-y-0 left-0 z-[45] flex flex-col border-r transition-all duration-300 overflow-hidden',
```

5l. `ui/dialog.tsx`: document the scale where the z-50 lives. No class changes.

BEFORE (`src/components/ui/dialog.tsx`, line 34, verbatim):
```tsx
function DialogOverlay({
```

AFTER:
```tsx
// Stacking scale for the whole app (a11y-6). Leaflet's panes are isolated inside
// the map container (`z-0`), so only page-level overlays compete:
//   /map overlays: top bar and marker badge z-20, filter panel z-30
//   mobile sidebar backdrop z-40, sidebar z-[45]
//   Radix layers (this dialog, popovers, dropdowns, selects): z-50
// A call site that must clear a portal may still pass z-[9999] (UserFilterToggle,
// DateRangeFilter). Do not add new overlays above z-30 inside a page.
function DialogOverlay({
```

Placement notes:
- 5d and 5h re-number the two `/map` overlays from `z-[300]` and `z-[400]` to `z-20`, and 5i the panel from `z-[399]` to `z-30`. 09.3 may add an empty-state overlay with its own `z-[3xx]`/`z-[4xx]`: map it onto the same scale (`z-20`, or `z-30` if it must cover the panel) when you meet it, and run the acceptance grep.
- The popover and dialog content that `DateRangeFilter` and `UserFilterToggle` already lift to `z-[9999]`, and 05.6h's confirmation dialog (`z-[9999]`), stay as they are. Their overlay is `ui/dialog`'s `z-50`, which now outranks the map overlays (20/30) and the sidebar (45).
- 5i replaces the panel's opening `<div>` and its `<h3>`; the body of the panel (the three sections, 05.6g's notice, 09's controls) is untouched except the three label blocks in 5j. 05.6h's `Dialog` for "Fetch All" sits outside the panel and is untouched.
- `triggerRef` goes on the Filters button only. `panelRef` receives focus because the panel has `tabIndex={-1}`.

**Edge cases to preserve**
- `showFilters`/`setShowFilters` keep their names and meaning; only their source changes. The Filters button still toggles.
- Esc with a date popover or the "All Users" dialog open closes only that layer, not the panel (Radix calls `preventDefault()` first; the hook checks `defaultPrevented`).
- Focus returns to the Filters button only if the panel was open before; the first render does not steal focus.
- The panel does not trap focus, because it is non-modal; the map behind stays usable.
- The `Search` input and the dead `Crosshair` button are out of scope (ux-6 in master §7).
- 05.6's `role="status"` on `SyncStatus` and the `role="alert"`/`status` notice in the panel are untouched.

**Acceptance criteria**
- Screen reader: "Back to dashboard, button"; "Heatmap, toggle button, not pressed" (pressed after a click); "Filters, button, collapsed" then "expanded".
- Click Filters: focus lands on the panel, announced as a dialog named "Filters". Tab reaches the close button, the three sections, and (09's controls). Esc closes it and focus returns to the Filters button. The close button works with the mouse and keyboard.
- With the panel open, press "My Readings Only" → the All Users dialog opens above the top bar and the panel, with its backdrop covering both. Esc closes the dialog and leaves the panel open.
- `grep -n "z-\[" src/pages/MapPage.tsx` prints nothing. `grep -n "<label" src/pages/MapPage.tsx` prints nothing.
- At 390 px, open the mobile drawer on `/map`: its backdrop covers the top bar and badge.

**Verify**
```
npx tsc -b
npx eslint src/hooks/useDismissablePanel.ts src/pages/MapPage.tsx src/components/Layout.tsx src/components/ui/dialog.tsx
```
Manual: the acceptance checks above, signed in. Do NOT run `npm run build` in this step.

**Commit title:** `fix(a11y): name map controls, expose toggle state, make the filter panel a dismissable dialog (a11y-6)`

---

### Step 6 — ux-4: size maps to their containers so OSM attribution stays visible

**Goal:** `MapComponent` fills whatever box its parent gives it, so the Dashboard mini-map (256 to 320 px) shows its whole canvas with the OpenStreetMap attribution and Sri Lanka's centre, and the full-page map fills `calc(100vh - 7rem)` with no grey gap. A `ResizeObserver` keeps Leaflet's internal size in step with the container when the sidebar opens or closes (Step 1 makes that a common event).

**Files:**
- `src/components/map/MapContainer.tsx`
- `src/pages/DashboardPage.tsx` (verified, no edit)
- `src/pages/MapPage.tsx` (verified, no edit)

**Exact changes**

6a. Imports (11.2 adds the Leaflet CSS import above these later).

BEFORE (`src/components/map/MapContainer.tsx`, line 1, verbatim):
```tsx
import { MapContainer as LeafletMapContainer, TileLayer } from 'react-leaflet';
```

AFTER:
```tsx
import { useEffect } from 'react';
import { MapContainer as LeafletMapContainer, TileLayer, useMap } from 'react-leaflet';
```

6b. A child component that re-measures the map when its container changes size.

BEFORE (`src/components/map/MapContainer.tsx`, lines 12-14, verbatim):
```tsx
interface MapComponentProps {
  children?: React.ReactNode;
}
```

AFTER:
```tsx
interface MapComponentProps {
  children?: React.ReactNode;
}

/**
 * Leaflet only re-measures on window resize. The container can also change
 * size without one (the sidebar opens or closes, the filter panel pushes
 * layout), which leaves grey strips and a misplaced attribution until the next
 * interaction. Observe the container and call invalidateSize().
 */
function ResizeSync() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => map.invalidateSize());
    });
    observer.observe(map.getContainer());
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);
  return null;
}
```

6c. The doc comment no longer promises fixed heights.

BEFORE (`src/components/map/MapContainer.tsx`, line 23, verbatim):
```tsx
 * - Responsive height (400px mobile, 600px desktop)
```

AFTER:
```tsx
 * - Fills its parent: the parent must give it a height (ux-4)
```

6d. The map takes its parent's size.

BEFORE (`src/components/map/MapContainer.tsx`, line 34, verbatim):
```tsx
      className="w-full h-[400px] md:h-[600px] z-0"
```

AFTER:
```tsx
      className="h-full w-full z-0"
```

6e. Mount the resize observer inside the map.

BEFORE (`src/components/map/MapContainer.tsx`, line 41, verbatim):
```tsx
      {children}
```

AFTER:
```tsx
      <ResizeSync />
      {children}
```

Placement notes:
- **No edit is needed in `DashboardPage.tsx` or `MapPage.tsx`.** The Dashboard mini-map's parent is `<div className="h-64 sm:h-72 lg:h-80 w-full overflow-hidden">` (a definite height), and `MapPage` wraps the map in `<div className="absolute inset-0 w-full h-full">` inside a root of `height: calc(100vh - 7rem)`. Both already define the height; the bug was `MapComponent` ignoring it. After 08.2 and 09.1 the map's parent may sit inside `ErrorBoundary`/`CardBoundary`, which render no DOM node of their own, so the chain of definite heights is unchanged. If 09.1 introduces a wrapper `<div>` around `MapComponent`, give it `h-full w-full`.
- `style={{ overflow: 'visible' }}` on `LeafletMapContainer` (line 35) is left as it is. The Dashboard parent already clips with `overflow-hidden`, and `MapPage`'s root does the same.
- The `z-0` class stays: it makes the container a stacking context, which keeps Leaflet's high-z panes below every page overlay (Step 5's scale relies on that).

**Edge cases to preserve**
- Centre, zoom (7), `minZoom`/`maxZoom`, `maxBounds` and the tile and attribution text are unchanged.
- The `ResizeSync` effect cleans up its observer and any pending frame on unmount, so navigating between `/dashboard` and `/map` leaves no observer behind.
- `ResizeObserver` is feature-checked; where it is missing, behaviour is the old window-resize-only one.
- The map's DOM size now depends on its parent. Any new use of `MapComponent` must put it in a box with a height.

**Acceptance criteria**
- `/dashboard` at 1280 px and at 390 px: the map shows its full box; the bottom-right "© OpenStreetMap contributors" attribution is visible; Sri Lanka's centre is in view.
- `/map` at 1080p height and at 667 px height (phone): the map fills the area under the header with no grey strip; the "N markers" badge sits on the map.
- Collapse and re-open the sidebar at 1280 px on `/map`: the tiles fill the new width without a grey strip or needing a pan.
- `grep -n "h-\[400px\]\|md:h-\[600px\]" src/components/map/MapContainer.tsx` prints nothing.

**Verify**
```
npx tsc -b
npx eslint src/components/map/MapContainer.tsx
```
Manual: the acceptance checks above. Do NOT run `npm run build` in this step.

**Commit title:** `fix(layout): size maps to their containers so OSM attribution stays visible (ux-4)`

---

### Step 7 — ux-5, a11y-8: wrap map controls on phones, scope 44px targets, honor reduced motion

**Goal:** The `/map` top bar fits a 360 px phone: its controls wrap instead of spilling past the card, and `SyncStatus` collapses to its icon and Sync button below `sm` (the text stays available to screen readers). The 44 px touch-target rule stops stretching Leaflet's zoom, popup-close and attribution links and the table sort buttons, and icon buttons stay square. The `table { display: block }` rule is removed. A `prefers-reduced-motion` block stops the login page's infinite animations and every other looping or decorative motion.

**Files:**
- `src/pages/MapPage.tsx`
- `src/components/map/SyncStatus.tsx`
- `src/index.css`

**Exact changes**

7a. `MapPage.tsx`: the top bar may wrap. The BEFORE is the line Step 5 (5d) wrote.

BEFORE (`src/pages/MapPage.tsx`, as left by Step 5 (5d), verbatim):
```tsx
        className={`absolute top-4 right-4 z-20 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 h-auto sm:h-12 ${
```

AFTER:
```tsx
        className={`absolute top-4 right-4 z-20 flex flex-col sm:flex-row sm:flex-wrap items-center justify-end gap-2 sm:gap-3 h-auto sm:min-h-12 ${
```

BEFORE (`src/pages/MapPage.tsx`, line 57, verbatim):
```tsx
        } backdrop-blur-sm rounded-lg shadow-lg px-2 sm:px-4 py-2 sm:py-4 transition-all duration-300`}
```

AFTER:
```tsx
        } backdrop-blur-sm rounded-lg shadow-lg px-2 sm:px-4 py-2 transition-all duration-300`}
```

7b. `MapPage.tsx`: the controls row wraps and may shrink. The HEAD row is `shrink-0`, which is what pushed it past the bar.

BEFORE (`src/pages/MapPage.tsx`, line 89, verbatim):
```tsx
        <div className="flex gap-1.5 shrink-0 border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-700 pt-2 sm:pt-0 sm:pl-3">
```

AFTER:
```tsx
        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1.5 max-w-full border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-700 pt-2 sm:pt-0 sm:pl-3">
```

7c. `SyncStatus.tsx` (as left by 05.6c): below `sm` the status words are visually hidden but stay in the live region.

BEFORE (`src/components/map/SyncStatus.tsx`, as left by 05.6c, verbatim):
```tsx
        <span className={`text-xs font-medium ${
```

AFTER:
```tsx
        <span className={`text-xs font-medium max-sm:sr-only ${
```

7d. `SyncStatus.tsx`: the cached-count text is hidden below `sm`. The BEFORE is two lines of 05.6c's AFTER that Step 4 (4m) does not touch.

BEFORE (`src/components/map/SyncStatus.tsx`, as left by 05.6c, verbatim):
```tsx
        {readings.length > 0 && (
          <span className={`text-xs ${
```

AFTER:
```tsx
        {readings.length > 0 && (
          <span className={`hidden sm:inline text-xs ${
```

7e. `index.css`: the 44 px rule is scoped. Leaflet's own controls and the sort buttons keep their size, and icon buttons are made 44 px wide as well as tall, so they stay square.

BEFORE (`src/index.css`, lines 165-169, verbatim):
```css
  /* Ensure touch targets are at least 44px */
  button,
  a {
    min-height: 44px;
  }
```

AFTER:
```css
  /* Touch targets: at least 44px for the app's own buttons and links. Leaflet's
     controls (zoom, popup close, attribution) and the table sort buttons keep
     their designed size, and icon buttons stay square (ux-5). */
  button:not(.leaflet-container button, .sort-button),
  a:not(.leaflet-container a) {
    min-height: 44px;
  }

  button[data-size^='icon']:not(.leaflet-container button) {
    min-width: 44px;
  }
```

7f. `index.css`: tables keep their table semantics; `ui/table.tsx` already scrolls them horizontally inside its own `overflow-x-auto` wrapper.

BEFORE (`src/index.css`, lines 176-181, verbatim):
```css
  /* Make tables scrollable horizontally */
  table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
```

AFTER:
```css
  /* Tables scroll horizontally inside ui/table.tsx's overflow-x-auto wrapper.
     Do not change their display: it strips the table role (ux-5). */
```

7g. `index.css`: reduced motion. The print block's header comment is the anchor (11.2 edits line 7, far above).

BEFORE (`src/index.css`, lines 203-204, verbatim):
```css
/* Print styles - Only print data table */
@media print {
```

AFTER:
```css
/* Respect prefers-reduced-motion (a11y-8): no looping or decorative motion.
   Durations collapse instead of using `animation: none`, so Radix open/close
   and Leaflet zoom transitions still complete and fire their end events. This
   covers the login orbs, sound bars, rings and `animate-pulse`/`animate-ping`/
   `animate-spin`, and the skeleton shimmer. */
@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    animation-delay: 0ms !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
    scroll-behavior: auto !important;
  }
}

/* Print styles - Only print data table */
@media print {
```

Placement notes:
- Step 5 already moved the top bar to `z-20` and Step 2 added the `th .sort-button` print rule; these blocks do not overlap with either. Step 4 edited `index.css` lines 58-61 and 93-96 only. 11.2 later edits line 7 (the `leaflet.css` import) and must keep 7e to 7g.
- 7a changes `sm:h-12` to `sm:min-h-12` and `sm:py-4` to `py-2`: the bar was a fixed 48 px box with 32 px of padding, so its 32 px buttons overflowed it. Two lines now fit without clipping, and one line is the same 48 px.
- `SyncStatus` keeps `role="status"` and `aria-live="polite"` on its container, so collapsing the words visually does not silence the announcements (05.6 requires that region to stay).
- The `Table` wrapper that makes 7f safe is in `src/components/ui/table.tsx:9-12` (verified), and `DataTable` is its only user.
- The remaining `index.css` mobile rules (horizontal-scroll guard, chart font size, word wrap) are untouched.

**Edge cases to preserve**
- Desktop (`sm` and up) shows the full SyncStatus text and the one-row top bar.
- Leaflet's attribution link, zoom buttons and popup close button (`a` and `button` elements inside `.leaflet-container`) are exempt from the 44 px rule; the app's own links and buttons still get it.
- The table's sort buttons keep their compact size; every other button on a phone is still 44 px tall.
- Print styles are unchanged by this step.
- Animations that carry meaning (a spinner while loading) become static, not removed: the control text ("Signing in...", "Fetching...") still says what is happening.
- `scroll-behavior: auto` only overrides smooth scrolling; nothing in `src` sets it today.

**Acceptance criteria**
- At 360 px wide on `/map`: the top bar stays inside the screen; Back, Search, the sync icon with its Sync button, Heatmap, Filters and Location are all reachable, wrapping onto a second row; no horizontal page scroll.
- At 640 px and 700 px: the bar wraps cleanly instead of overflowing; at 1280 px it is a single row.
- At 360 px the sync badge shows the status icon and "Sync"; a screen reader still announces "Last synced: …".
- Leaflet's zoom (+/-) buttons are 30 px with centred glyphs at 360 px; the popup's close "×" is not stretched. A dialog's buttons and the header menu button are still at least 44 px tall.
- A data table on a phone still scrolls sideways inside its card and keeps its header and cell semantics (DevTools → Accessibility: role `table`, `columnheader`).
- OS "Reduce motion" on (or DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`): the login orbs, sound bars and ring do not loop. With it off, the animations are as before.
- `grep -n "table {" src/index.css` shows only the print `table` rule, and `grep -n "prefers-reduced-motion" src/index.css` prints one line.

**Verify**
```
npx tsc -b
npx eslint src/pages/MapPage.tsx src/components/map/SyncStatus.tsx
npx vitest run
npm run build
```
`npx vitest run` is the cluster-end test run (master §1.3); `npm run build` takes about 7.5 minutes on this machine, so run it alone, with no dev server and no other check running. Manual: the acceptance checks above at 360 px, 640 px and 1280 px.

**Commit title:** `fix(layout): wrap map controls on phones, scope 44px targets, honor reduced motion (ux-5, a11y-8)`

---

## Risks & rollback

- **Anchors on files that earlier clusters rewrite.** `MapPage.tsx`, `NoiseMarkers.tsx`, `DashboardPage.tsx`, `LoginPage.tsx`, `NoiseTrendChart.tsx` and `CategoryChart.tsx` change in 04 to 09, and `MapLegend.tsx` does not exist until 09.4. Every anchor is a short line or block that the published specs of 04 to 08 keep verbatim; the 09 anchors (4f, 4g, 4n) are the ones to re-check first. The fallback for each is written next to it, and it never reverts a functional change.
- **Step 4 is large (17 files) because the cluster's step list fixes one commit for a11y-4 and a11y-5.** Its edits are independent single-line or single-block changes, so a mismatch in one place does not block the others. Revert the whole step if needed; the glyph and contrast changes are visual only.
- **Purple and Pink primary buttons stay at 4.32:1 and 4.35:1**, just under 4.5, because white and the dark ink are the only two options and white is the better of them. A darker primary colour would be a design decision, so it is left to the owner.
- **A focusable `role="img"` chart** (the line and bar charts with `accessibilityLayer`) is a deliberate use of recharts' documented override. It gives sighted keyboard users a tooltip walk and screen-reader users the full summary, with no nested focusable children. If an axe scan objects, set `tabIndex={-1}` on those two charts to drop the tab stop and keep the label.
- **`inert`** needs Chrome 102, Safari 15.5 or Firefox 112. In an older browser a closed sidebar is back to being tabbable, which is today's behaviour, so nothing regresses.
- **Lowering the `/map` and sidebar z-indices** is safe only because Leaflet's panes are isolated in the `z-0` map container. Any overlay added to a page above `z-30` would again outrank dialogs that rely on `z-50`; the comment in `ui/dialog.tsx` states the scale.
- **The 44 px rule now excludes `.leaflet-container`** with a complex `:not()` selector. It is supported by every browser that supports `inert`; in an engine that drops the whole rule, touch targets revert to their designed size, which is the pre-rule state.
- **`ResizeObserver` plus `invalidateSize()`** can re-render tiles on every frame of the sidebar's 300 ms width transition. It is throttled to one call per animation frame and there is no feedback loop (a size-neutral `invalidateSize()` triggers no resize).
- **Rollback.** Each step reverts on its own; revert the newest first (master §1.7), because later BEFORE anchors build on earlier AFTER text: Step 5 anchors on Step 1 (the `z-[500]` line) and Step 7 on Step 5 (the top-bar line). Reverting Step 3 or 4 also deletes their test files, so `npm test` stays green. No step changes data, rules, indexes, dependencies or the IndexedDB schema, so no step needs a deploy to roll back.
- **Later clusters that anchor on this one.**
  - 11.2 moves the `leaflet.css` import (`index.css:7`) into `MapContainer.tsx` and must keep 6a to 6e and 7e to 7g.
  - 12 enables `strict`. The new code uses `?.` on `getElementById`, typed refs (`useRef<HTMLDivElement>(null)`), `event.matches`/`event.key` on typed events, and no implicit `any`.

## Out of scope

- **A "View as table" toggle for the charts** (the optional half of the a11y-3 fix hint). The `aria-label` summaries and the existing swatch legends give the same data; a toggle is a feature. The pie keeps its colour-keyed legend rows, which carry the type name, count and percentage as text.
- **Theme-coloured text links** on the login card ('Forgot password?', 'Request access') and `style={{ color: primaryColor }}` icons on the map. Their contrast depends on the owner's theme choice against the card; a follow-up could pick the link colour with `contrastRatio()` against the card.
- **`UserFilterToggle`'s state** (a `variant` swap with no `aria-pressed`) and the `Search` input's missing label, plus the dead `Crosshair` button. They are outside this cluster's files; the dead controls are ux-6 in master §7.
- **Radix menus and selects at `z-50`** against map overlays: after Step 5 they outrank them, so nothing is left to change.
- **`ThemeContext`'s unguarded `localStorage`** (the second half of a11y-8; master §7 bug-11).
- **a11y-7** (login errors, labels, autocomplete) is 08.3. The accessibility audit (`audit/07_ACCESSIBILITY_AUDIT.md`) has no other findings.
- **A skip-to-content link and a `main` landmark id.** `Layout`'s `<main>` is edited by 08.2; adding a skip link is a separate enhancement.
- **Native `title`-only tooltips** on the remaining icon buttons (Crosshair) and the theme `console.log` calls in `Layout.tsx`.
- **Playwright or axe automation.** There is no browser test harness (01.1 is node-only); every UI check here is manual.
