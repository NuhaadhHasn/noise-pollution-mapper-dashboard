# Accessibility Audit - Noise Pollution Mapper Web Dashboard

> Generated 2026-10-15 - multi-agent cross-repo audit, read-only. Dimension agents (security, data layer, correctness, React/Vite, UX, performance, build/deploy) read the dashboard repo (`noise-pollution-mapper-dashboard`, HEAD `353bbdd`) and the Flutter app (`noise_pollution_mapper`, master `9b08e68`) as its contract counterpart only. Every Critical/High finding was re-checked by an adversarial verifier; uncertain claims default to refuted. Production facts come from the owner-run read-only probe of 2026-10-16 ~00:20 (`prod_probe.json`, aggregates only, no PII). No file outside `audit/` was modified, `serviceAccountKey.json` was never opened, and no build, install or network call to Firebase was made by the audit.
>
> Status legend: `confirmed` = verifier re-proved it against the code; `partial` = mechanism confirmed, part of the claim corrected; `refuted` = disproved (kept for transparency, excluded from recommendations); `unverified` = not individually re-checked. Severity shown is the post-verification severity. Repo: all findings in this document are `dashboard`, none is cross-repo. Contrast ratios are computed from the Tailwind and hex values in the source (WCAG relative luminance); nothing was measured in a rendered browser, and no screen reader was run. Exact BEFORE/AFTER edits live in `08_FIX_IMPLEMENTATION_PLAYBOOK.md`; the step numbers cited below are its master checklist numbers (section 5).

## Executive Summary

Total findings in this area: **8** (0 Critical, 0 High, 7 Medium, 1 Low). None was individually verified: every one is Medium or Low, which was outside the verification queue, so each is `unverified (not individually re-checked)`. The cited lines were re-opened for this document and the quotes are verbatim. No finding was refuted. No finding is flagged NEEDS PROD CHECK.

A search of `Layout.tsx`, `DataTable.tsx`, `MapPage.tsx`, `LoginPage.tsx` and `NoiseMarkers.tsx` for `aria-` and `role=` returns nothing, which explains the shape of the results: the dashboard was built mouse-first and visually, and accessibility was never a design input. The themes:

1. **Keyboard and screen-reader operability** (`a11y-1`, `a11y-2`, `a11y-6`). The closed sidebar stays in the tab order, the nav is made of buttons with no current-page state, the sortable table headers are click-only, and the map controls are unnamed icons.
2. **Information carried by colour or hidden from assistive tech** (`a11y-3`, `a11y-5`). Three of four analytics visuals have no text alternative, and the dB bands are separated by hue only.
3. **Contrast** (`a11y-4`, `a11y-5`). Secondary text sits at about 3:1 on the dark cards and about 2.5:1 on white, and white text on orange and green badges is about 2.2:1 and 2.8:1.
4. **Login** (`a11y-7`, `a11y-8`). Raw Firebase error strings with no live region, an unlabeled and unreachable password reveal, no reset flow, and infinite animation with no reduced-motion handling.

The fixes are all in the playbook (steps 30, 37 to 41 and 43); there is no deferred accessibility work.

## Summary Table

| ID | Severity | Title | Location | Status |
|----|----------|-------|----------|--------|
| a11y-1 | Medium | Closed sidebar stays in the tab order, primary nav is hidden by default on desktop, and the mobile drawer does not close after navigating | `src/components/Layout.tsx:53` (dashboard) | unverified |
| a11y-2 | Medium | Sortable DataTable headers are click-only <th> elements with no keyboard access or aria-sort | `src/components/analytics/DataTable.tsx:173` (dashboard) | unverified |
| a11y-3 | Medium | Charts have no text alternative or keyboard access and separate series by colour only | `src/components/analytics/NoiseTrendChart.tsx:192` (dashboard) | unverified |
| a11y-4 | Medium | Secondary text such as stat labels and filter helper text fails 4.5:1 contrast in dark and light themes | `src/components/analytics/StatsCards.tsx:41` (dashboard) | unverified |
| a11y-5 | Medium | White text on orange/green dB badges and theme buttons fails contrast, and map pins convey dB bands by colour alone | `src/components/analytics/DataTable.tsx:243` (dashboard) | unverified |
| a11y-6 | Medium | Map controls are icon-only with no accessible names or exposed toggle state, and the filter panel has no Esc, close button or focus handling | `src/pages/MapPage.tsx:67` (dashboard) | unverified |
| a11y-7 | Medium | Login shows raw Firebase error strings without a live region, the password reveal is unlabeled and unreachable, and there is no password reset | `src/pages/LoginPage.tsx:44` (dashboard) | unverified |
| a11y-8 | Low | Login page runs infinite animations with no prefers-reduced-motion handling | `src/pages/LoginPage.tsx:61` (dashboard) | unverified |

## Detailed Findings

### Critical

None.

### High

None. No accessibility finding reached High: each one degrades or blocks a task for some users, but none exposes data or breaks the page for everyone.

### Medium

#### [a11y-1] Closed sidebar stays in the tab order, primary nav is hidden by default on desktop, and the mobile drawer does not close after navigating

**Severity:** Medium | **Category:** accessibility | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux, react

**Status:** unverified (not individually re-checked). Two dimension agents matched; the lines below were re-opened.

**Location:** `src/components/Layout.tsx:53` (dashboard)

**Description:** The sidebar starts closed at every breakpoint. "Closed" is only a width change plus `overflow-hidden`, with no `inert`, `hidden` or `aria-hidden`, so the nav buttons inside it stay focusable. The nav is a set of `Button`s that call `navigate`, so there is no link semantics and no current-page state, and none of them closes the drawer. The menu and close buttons are bare glyphs, and the overlay is a click-only `div`.

**Evidence:**
- `src/components/Layout.tsx:25`: `const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Start closed on mobile`
- `src/components/Layout.tsx:53-56`: `<aside` / `className={cn(` / `'fixed lg:static inset-y-0 left-0 z-[500] flex flex-col border-r transition-all duration-300 overflow-hidden',` / `isSidebarOpen ? 'w-64' : 'w-0',`
- `src/components/Layout.tsx:88,98,108`: `onClick={() => navigate('/dashboard')}` / `onClick={() => navigate('/map')}` / `onClick={() => navigate('/analytics')}` (none calls `setIsSidebarOpen(false)`).
- `src/components/Layout.tsx:76-78`: `>` / `✕` / `</Button>`; `:219-221` `>` / `☰` / `</Button>` (no `aria-label`, `aria-expanded` or Escape handling).
- `src/components/Layout.tsx:45-49`: `{isSidebarOpen && (` / `<div` / `className="fixed inset-0 bg-black/50 z-40 lg:hidden"` / `onClick={() => setIsSidebarOpen(false)}`

**Impact:** On first load at desktop width there is no visible navigation until the user finds a faint menu glyph. Keyboard users tab into invisible zero-width Dashboard, Map and Analytics buttons and the theme controls. On phones, tapping Map leaves the 256 px drawer and its dark overlay over the new page until the user taps outside. Screen readers announce the glyphs by their Unicode names, not as menu and close controls.

**Recommendation:** Open the sidebar by default from `lg`, add `inert` (or `hidden`) when closed, close on navigate and on Esc, use `<nav aria-label>` with `NavLink` items (`aria-current="page"`), and add `aria-label` and `aria-expanded` to the menu buttons. Playbook step 37 (`10_accessibility_layout`).

---

#### [a11y-2] Sortable DataTable headers are click-only <th> elements with no keyboard access or aria-sort

**Severity:** Medium | **Category:** accessibility | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). The lines below were re-opened.

**Location:** `src/components/analytics/DataTable.tsx:173` (dashboard)

**Description:** Six column headers carry an `onClick` directly on the `<th>`. There is no button, `tabIndex`, key handler or `aria-sort`, and the sort indicator is a bare icon with no text.

**Evidence:**
- `src/components/analytics/DataTable.tsx:173-175`: `<TableHead` / `className="cursor-pointer hover:bg-muted/50"` / `onClick={() => handleSort('timestamp')}`
- The same shape repeats at `:179-181` (`locationName`), `:185-187` (`decibelLevel`), `:191-193` (`soundCategory`), `:197-199` (`soundType`) and `:203-205` (`confidence`).
- `src/components/analytics/DataTable.tsx:31-37`: `function SortIcon({ field, sortField, sortDirection }: SortIconProps) {` / `if (sortField !== field) return null;` / `<ChevronUp className="w-3 h-3 ml-1 inline" />`
- `src/index.css:177-179` (below 640 px): `table {` / `display: block;` (also drops table semantics, see `ux-5`).

**Impact:** Keyboard and screen-reader users cannot sort the table at all and cannot tell which column is sorted or in which direction. Mouse users get no focus ring either.

**Recommendation:** Put a `<button type="button">` inside each `<th>`, set `aria-sort="ascending" | "descending" | "none"` on the `th`, and give the sort icon an `sr-only` label. Playbook step 38 (`10_accessibility_layout`).

---

#### [a11y-3] Charts have no text alternative or keyboard access and separate series by colour only

**Severity:** Medium | **Category:** accessibility | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). A grep of the three chart files for `role=`, `aria-` and `accessibilityLayer` returns no matches. `package.json:30` pins `"recharts": "^2.15.4"`, where the accessibility layer is off unless enabled.

**Location:** `src/components/analytics/NoiseTrendChart.tsx:192` (dashboard)

**Description:** The line, bar and pie charts render as plain SVG with no summary, no role and no keyboard-reachable data. Both built-in legends are hidden and replaced by swatch lists, and series are told apart by hue.

**Evidence:**
- `src/components/analytics/NoiseTrendChart.tsx:192-193`: `<ResponsiveContainer width="100%" height="100%">` / `<LineChart data={groupedData}>`
- `src/components/analytics/CategoryChart.tsx:130-131`: `<ResponsiveContainer width="100%" height="100%">` / `<BarChart data={categoryData} layout="vertical" margin={{ left: 20, right: 30, top: 20, bottom: 60 }}>`
- `src/components/analytics/SoundTypeChart.tsx:91-92`: `<ResponsiveContainer width="100%" height="100%">` / `<PieChart>`
- `src/components/analytics/CategoryChart.tsx:186-190`: `{/* Hidden legend - we use custom legend below instead */}` / `<Legend` / `wrapperStyle={{` / `display: 'none',`
- `src/components/analytics/SoundTypeChart.tsx:99`: `label={isMobile ? () => null : ({ type, percentage }) => `${type}: ${percentage}%`}`
- `src/components/analytics/CategoryChart.tsx:17,21,23,24`: `'Traffic': '#FF5252',` / `'Sirens': '#EF5350',` / `'Alarm': '#F44336',` / `'Transport': '#E53935',`
- `src/components/analytics/NoiseTrendChart.tsx:247,255`: `stroke="#F44336"` (Maximum) / `stroke="#4CAF50"` (Minimum).

**Impact:** Screen-reader users get nothing from three of the four analytics visuals, and keyboard users cannot explore points. Several category reds, and the red-versus-green max and min lines, are distinguishable only by hue, which fails for red-green colour-blind users. The mobile pie hides its labels entirely and relies on the colour legend.

**Recommendation:** Add `role="img"` and a generated `aria-label` summary (for example "Average 58.2 dB, peak 96 dB, 3,328 readings"), enable `accessibilityLayer` on the recharts charts, offer a "View as table" toggle, and use dash patterns and shapes alongside colour. Playbook step 39 (`10_accessibility_layout`).

---

#### [a11y-4] Secondary text such as stat labels and filter helper text fails 4.5:1 contrast in dark and light themes

**Severity:** Medium | **Category:** accessibility | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). Ratios below were recomputed from the colours: gray-500 `#6B7280` on the dark card `#2D2640` is about 2.96:1, and gray-400 `#9CA3AF` on white is about 2.52:1; AA for small text needs 4.5:1.

**Location:** `src/components/analytics/StatsCards.tsx:41` (dashboard)

**Description:** The stat-card labels and units use `text-gray-500` on the dark card colour. The map filter helper text uses `text-gray-400` in light mode (and `text-gray-500` on the dark panel). The login card uses 10 px grey-500 text.

**Evidence:**
- `src/components/analytics/StatsCards.tsx:41`: `<h3 className="text-xs sm:text-sm font-medium text-gray-500">Total Readings</h3>`; `:58` `Avg Noise Level`; `:65` `<span className="text-sm font-normal text-gray-500">dB</span>`.
- `src/pages/MapPage.tsx:206-208`: `<p className={`text-xs mt-2 ${` / `isDarkMode ? 'text-gray-500' : 'text-gray-400'` / `}`}>`; the same ternary at `:225-227` and `:252`.
- `src/components/analytics/CategoryChart.tsx:222`: `<span className={cn("text-xs shrink-0", isDarkMode ? "text-gray-500" : "text-gray-500")}>`
- `src/pages/LoginPage.tsx:274-275`: `<div className="relative flex justify-center text-[10px] uppercase tracking-wider">` / `<span className={`px-3 ${isDarkMode ? 'bg-[#2D2640] text-gray-500' : 'bg-white text-gray-500'}`}>`; `:282` `<p className="text-center text-[10px] text-gray-500 font-medium tracking-wide">`

**Impact:** Stat labels ("Total Readings", "Avg Noise Level") and unit text are the primary metadata of the overview in the default dark theme and fall below AA. Filter helper text ("Showing all dates") is similarly hard to read in light mode, and the 10 px divider and footer text is worse.

**Recommendation:** Use `text-gray-300` on dark and `text-gray-600` or darker on light (or the existing `--muted-foreground` tokens), and avoid text below 12 px. Playbook step 40 (`10_accessibility_layout`).

---

#### [a11y-5] White text on orange/green dB badges and theme buttons fails contrast, and map pins convey dB bands by colour alone

**Severity:** Medium | **Category:** accessibility | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). Ratios below were recomputed from the colours: white on `#4CAF50` is about 2.8:1 and white on `#FF9800` is about 2.2:1.

**Location:** `src/components/analytics/DataTable.tsx:243` (dashboard)

**Description:** The dB badge in the table and in the map popup always uses white text on a band colour. The primary-colour picker offers Orange and Green, and every primary button uses a white foreground. The marker pins encode the band by colour only, and there is no legend.

**Evidence:**
- `src/components/analytics/DataTable.tsx:243-248`: `<span` / `className="px-2 py-1 rounded text-xs font-semibold text-white"` / `style={{ backgroundColor: getNoiseLevelColor(reading.decibelLevel) }}` / `{reading.decibelLevel.toFixed(1)} dB ({getNoiseLevelLabel(reading.decibelLevel)})`
- `src/components/analytics/DataTable.tsx:148-150`: `if (dB < 50) return isDarkMode ? '#4CAF50' : '#4CAF50';` / `if (dB <= 70) return isDarkMode ? '#FF9800' : '#FF9800';`
- `src/components/map/NoiseMarkers.tsx:322-326`: `<span` / `className="px-2 py-1 rounded text-xs font-semibold text-white"` / `style={{ backgroundColor: getMarkerColor(reading.decibelLevel) }}`
- `src/components/map/NoiseMarkers.tsx:33-35`: `if (decibelLevel < 50) return '#4CAF50'; // Green - Quiet` / `if (decibelLevel <= 70) return '#FF9800'; // Orange - Moderate` / `return '#F44336'; // Red - Loud`
- `src/utils/themeConstants.ts:10,12`: `Green: '#4CAF50',` / `Orange: '#FF9800',`
- `src/index.css:60`: `--primary-foreground: oklch(0.985 0 0);` (also `:95`); `src/pages/LoginPage.tsx:237` `className="w-full h-10 text-white font-semibold ..."` on `backgroundColor: themeColor`.

**Impact:** Moderate (orange) and Low (green) dB badges, and every primary button in the Orange or Green themes, are hard to read for low-vision users. On the map, a colour-blind user cannot separate the green, orange and red pins at a glance (red and green), and there is no legend to compensate.

**Recommendation:** Use dark text (`#1E1932`) on the orange and green badges, or darker band colours (`#2E7D32`, `#E65100`, `#C62828`), add a glyph or pin shape per band, and compute button foreground from theme luminance. Playbook step 40 (`10_accessibility_layout`).

---

#### [a11y-6] Map controls are icon-only with no accessible names or exposed toggle state, and the filter panel has no Esc, close button or focus handling

**Severity:** Medium | **Category:** accessibility | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). The lines below were re-opened.

**Location:** `src/pages/MapPage.tsx:67` (dashboard)

**Description:** The Back button holds only an arrow icon. The heatmap toggle shows its state through button styling only. The Filters panel is a plain absolutely positioned `div` with no dialog role, no close control and no Escape handler. The shadcn dialog overlay (`z-50`) sits below the map's overlay layers (`z-[300]`, `z-[399]`, `z-[400]`), so the modal backdrop draws underneath them. The 'Data Source' and 'Date Range' captions are `<label>` elements with no associated control.

**Evidence:**
- `src/pages/MapPage.tsx:67-73`: `<Button` / `variant="ghost"` / `size="icon"` / `onClick={() => navigate('/dashboard')}` / `className="shrink-0 h-8 w-8"` / `<ArrowLeft className="h-4 w-4" />` (no `title` or `aria-label`).
- `src/pages/MapPage.tsx:96-102`: `<Button` / `variant={showHeatmap ? "default" : "outline"}` ... `title="Toggle heatmap"` (no `aria-pressed`).
- `src/pages/MapPage.tsx:189-190`: `{showFilters && (` / `<div className={`absolute top-20 left-4 w-80 z-[399] rounded-lg shadow-lg p-4 ${`
- `src/pages/MapPage.tsx:55`: `className={`absolute top-4 right-4 z-[300] flex flex-col ...`; `:131` `<div className={`absolute bottom-4 left-4 z-[400] ...`
- `src/components/ui/dialog.tsx:42`: `fixed inset-0 z-50 bg-black/50`
- `src/pages/MapPage.tsx:197-200,217-220`: `<label className={`text-sm font-medium mb-2 block ${` ... `Data Source` and `Date Range`.
- A grep of `MapPage.tsx` for `aria-` and `role=` returns no matches.

**Impact:** Screen-reader users hear an unnamed "button" for Back and cannot tell whether the heatmap is on. Keyboard users who open Filters have no way to dismiss it with Esc, and focus is not moved into or returned from the panel. When the All Users dialog opens from the panel, the top bar and the panel remain above its backdrop.

**Recommendation:** Add `aria-label` to Back, `aria-pressed` on toggles, and `aria-expanded` and `aria-controls` on Filters. Render the panel as a `role="dialog"` or a Popover with Esc handling and focus return. Use a z-index scale where dialog overlay and content outrank the map overlay layers. Playbook step 41 (`10_accessibility_layout`).

---

#### [a11y-7] Login shows raw Firebase error strings without a live region, the password reveal is unlabeled and unreachable, and there is no password reset

**Severity:** Medium | **Category:** accessibility | **Repo:** dashboard | **Confidence:** high | **Reported by:** ux

**Status:** unverified (not individually re-checked). A grep of `LoginPage.tsx` for `autoComplete` returns no matches, and a grep of `src/` for `sendPasswordReset` returns none. The contrast of `text-red-500` (`#EF4444`) on the card was not recomputed here; the finding's 3.8:1 figure is unconfirmed.

**Location:** `src/pages/LoginPage.tsx:44` (dashboard)

**Description:** The sign-in error is the SDK's `err.message`, rendered in a 12 px paragraph with no `role="alert"` or live region. The password reveal button has `tabIndex={-1}` and no accessible name. No reset flow exists. The card title is a `div`, so the page has no heading. The inputs carry no autocomplete hints.

**Evidence:**
- `src/pages/LoginPage.tsx:44-45`: `const errorMessage = err instanceof Error ? err.message : 'Login failed';` / `setError(errorMessage);`
- `src/pages/LoginPage.tsx:228-231`: `{error && (` / `<div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">` / `<p className="text-xs text-red-500">{error}</p>`
- `src/pages/LoginPage.tsx:198-205`: `<button` / `type="button"` / `onClick={() => setShowPassword(!showPassword)}` ... `tabIndex={-1}` / `{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}`
- `src/components/ui/card.tsx:31-33`: `function CardTitle({ className, ...props }: React.ComponentProps<"div">) {` / `return (` / `<div`
- `src/pages/LoginPage.tsx:162-169` and `:185-192`: the email and password `<Input>` elements, neither with an `autoComplete` prop.

**Impact:** A mistyped password yields developer text such as `Firebase: Error (auth/invalid-credential).` in small red type that screen readers do not announce. Keyboard and screen-reader users cannot reveal the password. A locked-out researcher has no reset path and is pointed only to the 'Request access' mailto (see `ux-8`).

**Recommendation:** Map `error.code` to friendly copy (`invalid-credential`, `too-many-requests`, `network-request-failed`, `user-disabled`), add `role="alert"`, an `aria-label` of "Show password" with a focusable toggle, `autoComplete="username"` and `"current-password"`, a heading element for the title, and a `sendPasswordResetEmail` flow. Playbook step 30 (`08_access_resilience`).

---

### Low

#### [a11y-8] Login page runs infinite animations with no prefers-reduced-motion handling

**Severity:** Low | **Category:** accessibility | **Repo:** dashboard | **Confidence:** medium | **Reported by:** ux

**Status:** unverified (not individually re-checked). A grep of `src/` for `prefers-reduced-motion` returns no matches (re-run for this document).

**Location:** `src/pages/LoginPage.tsx:61` (dashboard)

**Description:** The first page every visitor sees animates three background orbs, ping and pulse rings, and sound bars indefinitely. The shared stylesheet also has an infinite shimmer. Nothing disables them for users who ask for reduced motion.

**Evidence:**
- `src/pages/LoginPage.tsx:65`: `animation: 'float 8s ease-in-out infinite',`
- `src/pages/LoginPage.tsx:72`: `animation: 'float 10s ease-in-out infinite reverse',`
- `src/pages/LoginPage.tsx:79`: `animation: 'pulse 6s ease-in-out infinite',`
- `src/pages/LoginPage.tsx:137,140`: `animate-ping` and `animate-pulse-inner`.
- `src/pages/LoginPage.tsx:346`: `animation: sound-1 0.8s ease-in-out infinite;`
- `src/index.css:140-141`: `.animate-shimmer {` / `animation: shimmer 2s infinite linear;`

**Impact:** Users with vestibular disorders get continuously moving content that cannot be paused, on the first page they see.

**Recommendation:** Add `@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation: none !important; transition: none !important; } }`. Playbook step 43 (`10_accessibility_layout`). The related unguarded storage access in `ThemeContext` is `bug-11` in `01_BUGS_AND_CORRECTNESS.md`.
