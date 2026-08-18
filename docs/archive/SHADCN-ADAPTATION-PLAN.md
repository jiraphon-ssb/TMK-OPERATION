# shadcn/ui Adaptation Plan — TMK Sale System

## Goal

Adapt shadcn/ui's design patterns, token system, and component API into the existing TMK codebase — without adding external dependencies (no Radix, no Tailwind). Use the existing CSS custom property system and component structure, just refactored to follow shadcn conventions for consistency and readability.

## Timeline & Effort

| Phase | Scope | Files | Est. Effort |
|---|---|---|---|
| **1** | CSS Token Alignment | `index.css` only | ~30 min |
| **2** | Component Classes (CSS only) | `index.css` only | ~1 hr |
| **3a** | JSX: Card Composition | `sale*.jsx` (7 files) | ~2 hr |
| **3b** | JSX: Badge Variants | `sale*.jsx`, `modals.jsx` | ~1 hr |
| **3c** | JSX: Button Variants | `sale*.jsx`, `modals.jsx`, `index.css` | ~1 hr |
| **3d** | JSX: Table Semantic Wrapper | `views-2.jsx`, `sale*.jsx` | ~1 hr |
| **3e** | JSX: Tabs Component | `saleDashboard.jsx`, `views-2.jsx` | ~45 min |
| **4** | SideSheet Enhancement | `modals.jsx` | ~30 min |
| **5** | Build & Verify | — | ~15 min |

**Total:** ~8.5 hrs

---

## Phase 1: CSS Token Alignment

### Goal
Add missing semantic tokens to match shadcn's token convention, keeping existing tokens as aliases.

### shadcn Token → Our Mapping

| shadcn Token | Our Equivalent | Action |
|---|---|---|
| `--background` | `--paper` | Add `--background` alias |
| `--foreground` | `--ink` | Add `--foreground` alias |
| `--card` | N/A | **NEW:** `--card: var(--surface)` |
| `--card-foreground` | `--ink` | Reuse |
| `--popover` | N/A | **NEW:** `--popover: var(--surface)` |
| `--popover-foreground` | `--ink` | Reuse |
| `--muted` | N/A | **NEW:** `--muted: var(--surface-2)` |
| `--muted-foreground` | `--ink-3` | Add `--muted-foreground` alias |
| `--primary` | `--ink` (light) / `--accent` (dark) | Add `--primary` / `--primary-foreground` |
| `--secondary` | N/A | **NEW:** `--secondary: var(--surface-2)` |
| `--secondary-foreground` | `--ink` | Add alias |
| `--accent` ✅ | `--accent` | Already matches |
| `--accent-foreground` | `--accent-2` | Add alias |
| `--destructive` | `--bad` | Add `--destructive` alias |
| `--border` ✅ | `--line` | Already matches |
| `--input` | N/A | **NEW** for input border color |
| `--ring` | N/A | **NEW** for focus ring color |
| `--radius` | `--r` | Already matches |
| `--chart-1..5` | channel colors | Add alias tokens |
| `--sidebar` | `--rail` | Add alias |

### Changes in `index.css`

```css
:root {
  /* === shadcn-compatible semantic aliases === */
  --background: var(--paper);
  --foreground: var(--ink);
  --card: var(--surface);
  --card-foreground: var(--ink);
  --popover: var(--surface);
  --popover-foreground: var(--ink);
  --muted: var(--surface-2);
  --muted-foreground: var(--ink-3);
  --primary: var(--ink);
  --primary-foreground: var(--paper);
  --secondary: var(--surface-2);
  --secondary-foreground: var(--ink);
  --accent-foreground: var(--accent-2);
  --destructive: var(--bad);
  --destructive-foreground: #fff;
  --input: var(--line);
  --ring: var(--accent-ring);
  /* chart aliases */
  --chart-1: var(--ch-shopee);
  --chart-2: var(--ch-tiktok);
  --chart-3: var(--ch-lazada);
  --chart-4: var(--ch-facebook);
  --chart-5: var(--ch-line);
}

.dark {
  --primary: var(--accent);
  --primary-foreground: #fff;
}
```

### Verification
- `grep` for old token usage to ensure no breakage
- `npm run build`

---

## Phase 2: Component Classes (CSS only)

### Goal
Add CSS classes that mirror shadcn component APIs, composable via `className` only (no JSX changes yet).

### 2A. Badge Variants

Add to `index.css`:

```css
/* === shadcn-inspired badge variants === */
.badge { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-micro); font-weight: var(--fw-sem); padding: 3px 9px; border-radius: var(--r-pill); white-space: nowrap; }
.badge-default { background: var(--accent-soft); color: var(--accent-2); }
.badge-secondary { background: var(--secondary); color: var(--secondary-foreground); }
.badge-destructive { background: var(--bad-soft); color: var(--bad); }
.badge-outline { background: transparent; border: 1px solid var(--line); color: var(--ink-2); }
.badge-ghost { background: transparent; color: var(--ink-3); }
```

### 2B. Card Sub-components

Add to `index.css` — classes that can be used with existing `.card`:

```css
/* === shadcn-inspired card composition === */
.card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.card-header-content { min-width: 0; }
.card-title { font-size: var(--fs-h3); font-weight: var(--fw-sem); line-height: 1.35; }
.card-description { font-size: var(--fs-cap); color: var(--ink-3); margin-top: 2px; }
.card-action { flex-shrink: 0; }
.card-content { }
.card-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); }
/* card-footer ที่มีปุ่ม action ฝั่งซ้าย+ขวา */
.card-footer-between { justify-content: space-between; }
```

### 2C. Table Semantic Classes

Add to `index.css` (beside existing `.table`):

```css
/* === shadcn-inspired table composition === */
/* Use exactly like: <div className="table-wrap"><table className="table">...</table></div>
   The shadcn pattern adds semantic wrappers but since our table markup is already flat,
   we just add alias classes for readability */
.table-caption { caption-side: bottom; font-size: var(--fs-cap); color: var(--ink-3); margin-top: 4px; text-align: left; }
.table-header { }
.table-body { }
.table-row { }
.table-head { }
.table-cell { }
.table-footer { font-weight: var(--fw-sem); border-top: 2px solid var(--line); }
```

### 2D. Tabs Component Classes

Add to `index.css`:

```css
/* === shadcn-inspired tabs === */
.tabs-root { }
.tabs-list { display: flex; gap: 0; border-bottom: 1px solid var(--line); margin-bottom: 16px; }
.tabs-trigger { border: none; background: transparent; padding: 10px 16px; font-size: var(--fs-sm); font-weight: var(--fw-med); color: var(--ink-3); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.14s var(--ease); white-space: nowrap; }
.tabs-trigger:hover { color: var(--ink); }
.tabs-trigger[data-active="true"], .tabs-trigger.active { color: var(--accent-2); border-bottom-color: var(--accent); font-weight: var(--fw-sem); }
.tabs-content { }
/* Line variant (like shadcn's variant="line") — default is already line style */
/* Vertical variant */
.tabs-vertical { display: flex; gap: 0; }
.tabs-vertical .tabs-list { flex-direction: column; border-bottom: none; border-right: 1px solid var(--line); margin-bottom: 0; margin-right: 16px; padding-right: 0; }
.tabs-vertical .tabs-trigger { border-bottom: none; border-right: 2px solid transparent; margin-bottom: 0; margin-right: -1px; }
.tabs-vertical .tabs-trigger.active { border-right-color: var(--accent); }
```

### 2E. Button Variant Refinements

Add to existing `.btn` CSS:

```css
/* === shadcn-inspired button refinements === */
.btn-secondary { background: var(--secondary); color: var(--secondary-foreground); border-color: transparent; }
.btn-secondary:hover { background: var(--muted); }
.btn-link { background: transparent; border-color: transparent; color: var(--accent); text-decoration: underline; padding: 0; }
.btn-link:hover { color: var(--accent-2); }
/* Icon button variants */
.icon-btn-sm { width: 32px; height: 32px; }
.icon-btn-xs { width: 26px; height: 26px; }
```

### Verification
- Check no CSS conflicts with existing classes
- `npm run build`

---

## Phase 3: JSX Refactor

### 3A. Card Composition

**Current Pattern (56 instances across sale files):**
```jsx
<div className="card" style={{ padding: '14px 16px' }}>
  <div className="card-head">
    <h3><Icon name="bag" /> Title</h3>
    <button>Action</button>
  </div>
  <div>Content</div>
</div>
```

**Target Pattern:** (opt-in, not replacing all at once)
```jsx
<div className="card" style={{ padding: '14px 16px' }}>
  <div className="card-header">
    <div className="card-header-content">
      <div className="card-title"><Icon name="bag" /> Title</div>
      <div className="card-description">Subtitle</div>
    </div>
    <div className="card-action">
      <button>Action</button>
    </div>
  </div>
  <div className="card-content">Content</div>
</div>
```

**Files to update:**

| File | Instance Lines | Priority |
|---|---|---|
| `saleDashboard.jsx` | 280-312 (filter card), 319-343 (hero), 415-425 (trend card), 434, 451, 463, 467, 483, 505, 509, 514, 524, 531, 537, 554, 559, 571, 588, 624, 648, 653, 657, 707, 778, 837 | **High** |
| `saleCrm.jsx` | 114, 122-155 (customer table card) | **High** |
| `saleCatalog.jsx` | 178, 208, 216, 241 | **High** |
| `saleEntry.jsx` | 151, 216, 298 | **High** |
| `saleImportHub.jsx` | 64, 80, 92, 182 | **Medium** |

**Strategy:** Focus on the most visible cards (hero, filter bar, catalog, CRM table) — skip skeleton cards and error banners as they're utilitarian.

### 3B. Badge Variant Migration

**Current Patterns:**
```jsx
<span className="chip chip-accent">Label</span>           {/* accent badge */}
<span className="chip chip-good">Label</span>             {/* good/delivered */}
<span className="chip chip-warn">Label</span>             {/* warn/pending */}
<span className="chip chip-bad">Label</span>              {/* bad/cancelled */}
<span className="quality-badge warn">Label</span>         {/* CRM-specific */}
<span className="tier-chip tier-chip-diamond">เพชร</span> {/* tier variant */}
```

**Target Pattern:**
```jsx
<span className="badge badge-default">Label</span>        {/* was chip-accent */}
<span className="badge badge-secondary">Label</span>      {/* was plain chip */}
<span className="badge badge-destructive">Label</span>    {/* was chip-bad */}
<span className="badge badge-outline">Label</span>       {/* was quality-badge */}
```

**Migration Mapper:**

| Current Class | New Class | Notes |
|---|---|---|
| `chip` | `badge badge-secondary` | Default chip → secondary badge |
| `chip chip-accent` | `badge badge-default` | Accent → default (primary) |
| `chip chip-good` | `badge badge-outline` + style | Keep semantic color for orders |
| `chip-chip-warn` | `badge badge-outline` + style | Keep semantic color for pending |
| `chip-chip-bad` | `badge badge-destructive` | Destructive for bad/delete states |
| `chip-delivered` | `badge badge-outline` + css var | Status-specific |
| `chip-pending` | `badge badge-outline` + css var | Status-specific |
| `chip-cancelled` | `badge badge-destructive` | Cancel = destructive |
| `chip-shipped` | `badge badge-outline` + css var | Status-specific |
| `quality-badge warn` (catalog) | `badge badge-outline` | Keep warn color via inline style |
| `quality-badge good` (catalog) | `badge badge-outline` | Keep good color via inline style |
| `tier-chip-*` | Keep as-is | Specialized component, no change |

**Files to update:**
- `saleCrm.jsx` — 4 instances of tier chips, contact chip
- `saleDashboard.jsx` — delta indicator chips, filter chips, insight chips
- `saleCatalog.jsx` — quality badges (keep as-is, specialized)
- `saleEntry.jsx` — funnel chips
- `views-2.jsx` — status chips

### 3C. Button Variant Migration

**Current:**
```jsx
<button className="btn">Cancel</button>                  {/* default */}
<button className="btn btn-primary">Save</button>         {/* primary */}
<button className="btn btn-ghost">Delete</button>         {/* ghost */}
<button className="btn btn-sm">Small</button>             {/* small */}
```

**Target:** (already close, just add `btn-secondary`, `btn-link`)

**Changes:**
- `.btn` with no variant → stays as default (matches shadcn outline)
- `.btn.btn-primary` → stays (matches shadcn default)
- Add `.btn-secondary` for toolbar/dropdown buttons that currently use `.pick`
- No forced migration — buttons are already clean

### 3D. Table Semantic Wrapper

**Current Pattern:**
```jsx
<div className="table-wrap">
  <table className="table">
    <thead><tr><th>Col</th></tr></thead>
    <tbody><tr><td>Val</td></tr></tbody>
  </table>
</div>
```

**Target Pattern:** (add more semantic classes to existing tags)
```jsx
<div className="table-wrap">
  <table className="table">
    <thead className="table-header">
      <tr className="table-row">
        <th className="table-head">Col</th>
      </tr>
    </thead>
    <tbody className="table-body">
      <tr className="table-row">
        <td className="table-cell">Val</td>
      </tr>
    </tbody>
  </table>
</div>
```

**Files with tables:**
| File | Lines | Priority |
|---|---|---|
| `saleCrm.jsx` | 133-154, 202-205 | **High** — CRM customer table |
| `saleEntry.jsx` | 155-210 | **High** — Entry table |
| `saleCatalog.jsx` | 241-260 | **High** — Catalog table view |
| `views-2.jsx` | 1474-1550 | **High** — Orders table |
| `stats.jsx` | Various | **Low** — Side tables |

### 3E. Tabs Component Migration

**Current Pattern (in `saleDashboard.jsx`):**
```jsx
<div className="segbar">
  <button className={'seg' + (tab === 'overview' ? ' active' : '')}>ภาพรวม</button>
  <button className={'seg' + (tab === 'design' ? ' active' : '')}>ลาย</button>
  ...
</div>
```

**Target Pattern:**
```jsx
<div className="tabs-list">
  <button className={'tabs-trigger' + (tab === 'overview' ? ' active' : '')} data-active={tab === 'overview'}>ภาพรวม</button>
  <button className={'tabs-trigger' + (tab === 'design' ? ' active' : '')} data-active={tab === 'design'}>ลาย</button>
  ...
</div>
```

**Why not full shadcn pattern:** We can't use `<Tabs>` wrapper components without a Radix dependency. Use CSS-only approach with `tabs-list` / `tabs-trigger` classes that look identical.

**Files to update:**
| File | Lines | Notes |
|---|---|---|
| `saleDashboard.jsx` | 401-411 | 8 tabs in dashboard |
| `views-2.jsx` | DataHub tabs | 3-step workflow tabs |
| `saleImportHub.jsx` | Step indicators | Import workflow steps |

---

## Phase 4: SideSheet Enhancement

### Current SideSheet Props
```jsx
<SideSheet icon="user" title="Name" sub="Detail" onClose={fn} footer={<JSX/>} size="md" confirmOnClose={bool}>
  children
</SideSheet>
```

### Enhancements to Add

| Feature | Status | Implementation |
|---|---|---|
| `showCloseButton` prop | **NEW** | Default `true`, set `false` to hide X button |
| `closeOnScrim` prop | **NEW** | Default `true`, set `false` to disable scrim click |
| `onKeyDown` handler | **IMPROVED** | Also handle Enter on close button |
| `position` prop | **NEW** | `"right"` (default) or `"left"` |
| Trap focus inside drawer | **IMPROVED** | Tab cycle between first/last focusable |

### Implementation

In `modals.jsx` — update SideSheet:

```jsx
export function SideSheet({
  icon, title, sub, onClose, footer, size = 'md', children,
  confirmOnClose, showCloseButton = true, closeOnScrim = true, position = 'right'
}) {
  const tryClose = () => {
    if (confirmOnClose && !window.confirm(DISCARD_MSG)) return;
    onClose();
  };
  const boxRef = useRef(null);
  const lastFocusRef = useRef(null);

  useEffect(() => {
    lastFocusRef.current = document.activeElement;
    const onKey = e => {
      if (e.key === 'Escape') tryClose();
      // Trap focus
      if (e.key === 'Tab' && boxRef.current) {
        const focusable = boxRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    boxRef.current?.focus?.();
    return () => {
      window.removeEventListener('keydown', onKey);
      lastFocusRef.current?.focus?.();
    };
  }, [confirmOnClose]);

  const alignStyle = position === 'left'
    ? { justifyContent: 'flex-start' }
    : { justifyContent: 'flex-end' };

  return createPortal(
    <div
      className="sheet-scrim"
      onClick={closeOnScrim ? tryClose : undefined}
      style={{ ...alignStyle }}
    >
      <aside
        ref={boxRef}
        className={`side-sheet side-sheet-${size}${position === 'left' ? ' side-sheet-left' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="side-sheet-head">
          {icon && <div className="mh-icon"><Icon name={icon} /></div>}
          <div style={{ minWidth: 0 }}>
            <div className="modal-title">{title}</div>
            {sub && <div className="modal-sub">{sub}</div>}
          </div>
          {showCloseButton && (
            <button className="icon-btn modal-x" onClick={tryClose} aria-label="ปิด">
              <Icon name="x" />
            </button>
          )}
        </div>
        <div className="side-sheet-body">{children}</div>
        {footer && <div className="side-sheet-foot">{footer}</div>}
      </aside>
    </div>,
    document.body
  );
}
```

CSS additions for left-position:

```css
.side-sheet-left { border-left: none; border-right: 1px solid var(--line); }
```

---

## Phase 5: Build & Verification

### Steps
1. `npm run build` — must pass
2. Manual visual check of all changed pages
3. Check mobile viewport (390x844) for each change

### Rollback Plan
If build fails:
1. Identify failing change (comment out blocks to isolate)
2. Fix specific CSS selector or JSX pattern
3. Re-run build
4. If still failing, revert last commit and retry with smaller changes

---

## Appendix: Current State Summary

### Design Tokens (index.css)

| Category | Tokens | Status |
|---|---|---|
| Backgrounds | `--paper`, `--surface`, `--surface-2`, `--surface-3` | ✅ Good |
| Text | `--ink`, `--ink-2`, `--ink-3`, `--ink-4` | ✅ Good |
| Rails/Nav | `--rail`, `--rail-2`, `--rail-line`, `--rail-ink`, `--rail-ink-2` | ✅ Good |
| Lines/Borders | `--line`, `--line-2` | ✅ Good |
| Accent | `--accent`, `--accent-2`, `--accent-soft`, `--accent-ring` | ✅ Good |
| Semantic | `--good`, `--warn`, `--bad`, `--info` + `-soft` variants | ✅ Good |
| Channel | `--ch-shopee`, `--ch-tiktok`, `--ch-lazada`, `--ch-facebook`, `--ch-line`, `--ch-crm` | ✅ Good |
| Typography | `--fs-*`, `--fw-*` scale | ✅ Good |
| Radii | `--r-xs` through `--r-pill` | ✅ Good |
| Shadows | `--sh-sm`, `--sh-md`, `--sh-lg`, `--sh-pop` | ✅ Good |
| **shadcn aliases** | `--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--primary`, `--secondary`, `--destructive`, `--input`, `--ring` | ❌ Missing |

### Component Classes (index.css)

| Component | Exists? | Notes |
|---|---|---|
| `.btn` + variants | ✅ | `.btn`, `.btn-primary`, `.btn-accent`, `.btn-ghost`, `.btn-sm` |
| `.card` | ✅ | `.card`, `.card-pad-sm`, `.card-head` |
| `.chip` | ✅ | `.chip`, `.chip-good`, `.chip-warn`, `.chip-bad`, `.chip-accent` |
| `.table` | ✅ | `.table`, `.table-wrap`, `.table-sticky-first` |
| `.modal` + `.side-sheet` | ✅ | Full implementation with head/body/foot |
| `.switch` | ✅ | Toggle switch |
| `.avatar` | ✅ | Basic avatar |
| `.input` | ✅ | `.input`, `.input-sm`, `.field` |
| `.segbar` / `.seg` | ✅ | Tab-like segmented control |
| `.badge` | ❌ Missing | Would replace some chip usage |
| `.tabs-list` / `.tabs-trigger` | ❌ Missing | Dedicated tabs component |

### Relevant Files

| File | Lines | Purpose |
|---|---|---|
| `src/index.css` | 1164 | All CSS |
| `src/modals.jsx` | ~2000+ | Modal, SideSheet, MpImportModal |
| `src/saleDashboard.jsx` | 892 | Dashboard with filters, KPI, charts |
| `src/saleCrm.jsx` | 208 | CRM customer list + detail |
| `src/saleCatalog.jsx` | ~500 | Catalog shirts |
| `src/saleEntry.jsx` | ~400 | Daily sales entry |
| `src/saleImportHub.jsx` | ~200 | Data import workflow |
| `src/views-2.jsx` | ~1600 | Orders, Data Hub |
| `src/components.jsx` | ~500+ | Shared components (Icon, etc.) |
| `src/charts.jsx` | ~500+ | Chart components, MetricCard |
