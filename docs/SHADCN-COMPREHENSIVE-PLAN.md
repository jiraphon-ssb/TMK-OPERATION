# shadcn/ui Comprehensive Adoption Plan — TMK Operation

## Goal
Adopt ALL shadcn/ui design patterns, token system, and component API into TMK — without external dependencies (no Radix, no Tailwind). Pure CSS custom property system + existing component structure.

## Completed So Far
- ✅ **Phase 1:** 24 semantic token aliases (`--background`, `--foreground`, `--card`, etc.)
- ✅ **Phase 2:** Component CSS classes for Badge, Button, Card, Table, Tabs, Sheet
- ✅ **Phase 3:** JSX migrations (card composition, badge variants, tabs migration, table semantics)
- ✅ **Phase 4:** SideSheet enhancement (showCloseButton, position, focus trap)
- ✅ **Phase 5 (new):** Additional CSS classes for Alert, Avatar, Breadcrumb, Kbd, Pagination, Spinner, Toggle, Toggle Group, Empty

## Remaining Work

### Phase 6: CSS Component Classes — Remaining Components
Add CSS classes for shadcn components not yet covered.

| Component | CSS Classes | Priority |
|---|---|---|
| **Accordion** | `.accordion`, `.accordion-item`, `.accordion-header`, `.accordion-trigger`, `.accordion-content`, `.accordion-chevron` | Medium |
| **Checkbox** | `.checkbox`, `.checkbox-check`, `.checkbox-indeterminate` | Medium |
| **Collapsible** | `.collapsible`, `.collapsible-trigger`, `.collapsible-content` | Low |
| **Dialog** | `.dialog-overlay`, `.dialog-content`, `.dialog-header`, `.dialog-title`, `.dialog-description`, `.dialog-footer`, `.dialog-close` | Medium |
| **Drawer** | `.drawer-overlay`, `.drawer-content`, `.drawer-header`, `.drawer-title`, `.drawer-description`, `.drawer-footer` | Low |
| **Dropdown Menu** | `.dropdown`, `.dropdown-trigger`, `.dropdown-content`, `.dropdown-item`, `.dropdown-separator`, `.dropdown-label`, `.dropdown-shortcut` | Medium |
| **Hover Card** | `.hover-card`, `.hover-card-trigger`, `.hover-card-content` | Low |
| **Input Group** | `.input-group`, `.input-group-addon` | Medium |
| **Label** | `.label` | Low |
| **Menubar** | `.menubar`, `.menubar-trigger`, `.menubar-content`, `.menubar-item`, `.menubar-separator`, `.menubar-shortcut`, `.menubar-sub` | Low |
| **Navigation Menu** | `.nav-menu`, `.nav-menu-list`, `.nav-menu-item`, `.nav-menu-trigger`, `.nav-menu-content`, `.nav-menu-link`, `.nav-menu-indicator` | Low |
| **Popover** | `.popover`, `.popover-trigger`, `.popover-content`, `.popover-arrow` | Medium |
| **Progress** | `.progress`, `.progress-bar` | Low |
| **Radio Group** | `.radio-group`, `.radio-item`, `.radio-indicator` | Low |
| **Scroll Area** | `.scroll-area` | Low |
| **Select** | `.select`, `.select-trigger`, `.select-content`, `.select-item`, `.select-label`, `.select-separator` | Medium |
| **Separator** | `.separator`, `.separator-horizontal`, `.separator-vertical` | Low |
| **Skeleton** | `.skeleton` | Low |
| **Slider** | `.slider`, `.slider-track`, `.slider-range`, `.slider-thumb` | Low |
| **Switch** | `.switch-thumb` | Low |
| **Textarea** | `.textarea` | Low |
| **Tooltip** | `.tooltip`, `.tooltip-trigger`, `.tooltip-content`, `.tooltip-arrow` | Medium |
| **Typography** | `.lead`, `.large`, `.small`, `.muted-text`, `.list-disc`, `.list-decimal`, `.inline-code`, `.blockquote` | Low |

### Phase 7: JSX Implementation
Build reusable React components for the most impactful ones.

| Component | File | Priority |
|---|---|---|
| **Alert** → reusable `<Alert>` component | `components.jsx` or new `shadcn.jsx` | Medium |
| **Dropdown Menu** → reusable `<Dropdown>` | `components.jsx` | Medium |
| **Dialog** → enhance existing Modal | `modals.jsx` | Medium |
| **Accordion** → reusable `<Accordion>` | `components.jsx` | Low |
| **Popover** → reusable `<Popover>` | `components.jsx` | Low |
| **Checkbox** → reusable `<Checkbox>` | `components.jsx` | Low |
| **Switch** → reuse existing `.switch` | Already exists | Low |
| **Tooltip** → reusable `<Tooltip>` | `components.jsx` | Low |

### Phase 8: Migration of Existing JSX
Replace inline patterns with shadcn component classes throughout the codebase.

| Pattern | Replace With | Files |
|---|---|---|
| `className="segment"` / manual tab logic | `<Accordion type="single">` | modals.jsx |
| Manual dropdowns with `.menu-pop`/`.menu-row` | `.dropdown` classes | modals.jsx, views-2.jsx |
| Manual switch `.switch` → `.switch` with `.switch-thumb` | Already supported | — |
| Existing `.modal` → `.dialog-content` classes | modals.jsx | Medium |
| `.login-tabs` → `.tabs-list` | App.jsx | Low |

### Phase 9: Verify
- `npm run build` passes
- Visual regression check on key pages (dashboard, CRM, catalog, entry, modals)

## CSS-Only Feasibility Matrix

| Component | CSS-Only? | Notes |
|---|---|---|
| Accordion | ✅ CSS + HTML details/summary | Use `<details>/<summary>` for pure HTML accordion |
| Alert | ✅ Yes | Static component |
| Avatar | ✅ Yes | CSS only |
| Badge | ✅ Done | |
| Breadcrumb | ✅ Yes | CSS only |
| Button | ✅ Done | |
| Calendar | ❌ Needs JS | Skip — uses recharts |
| Card | ✅ Done | |
| Carousel | ❌ Needs JS | Skip |
| Checkbox | ✅ CSS only (visual styled input) | Use appearance-none approach |
| Chart | ❌ Needs library | Skip — uses recharts |
| Collapsible | ✅ CSS + details/summary | Use `<details>/<summary>` |
| Combobox | ❌ Needs JS | Skip |
| Command | ❌ Needs JS | Skip |
| Context Menu | ❌ Needs JS | Skip |
| Data Table | ❌ Complex | Skip |
| Date Picker | ❌ Needs JS | Skip |
| Dialog | ✅ Yes (visual) | Already have Modal |
| Drawer | ✅ Yes (visual) | Already have mobile drawer |
| Dropdown Menu | ✅ Yes (visual) | Needs JS for open/close |
| Empty | ✅ Yes | |
| Field | ✅ Yes | Already have `.field` |
| Hover Card | ✅ CSS only | Hover effect via CSS :hover |
| Input | ✅ Done | |
| Input Group | ✅ Yes | CSS composition |
| Input OTP | ❌ Needs JS | Skip |
| Item | ✅ CSS only | Simple composable |
| Kbd | ✅ Yes | |
| Label | ✅ Yes | |
| Menubar | ✅ CSS only | Needs JS for interaction |
| Native Select | ✅ Already have | |
| Navigation Menu | ✅ CSS only | Needs JS for interaction |
| Pagination | ✅ Yes | |
| Popover | ✅ CSS only (visual) | Needs JS for toggle |
| Progress | ✅ Already have `.bar` | |
| Radio Group | ✅ CSS only | Visual only |
| Resizable | ❌ Needs JS | Skip |
| Scroll Area | ✅ Yes | Already have `overflow-y: auto` |
| Select | ✅ CSS only (visual) | Needs JS for dropdown |
| Separator | ✅ Already have `.divider` | |
| Sheet | ✅ Done (SideSheet) | |
| Sidebar | ❌ Complex | Skip — custom layout |
| Skeleton | ✅ Already have `.skel` | |
| Slider | ❌ Needs JS | Skip |
| Sonner | ❌ Needs JS | Skip — custom toast |
| Spinner | ✅ Yes | |
| Switch | ✅ Already have `.switch` | |
| Table | ✅ Done | |
| Tabs | ✅ Done | |
| Textarea | ✅ Already have `textarea.input` | |
| Toast | ❌ Needs JS | Skip — custom implementation |
| Toggle | ✅ Yes | |
| Toggle Group | ✅ Yes | |
| Tooltip | ✅ CSS only | CSS :hover + transition |
| Typography | ✅ Already have | |

## Implementation Order

1. **Phase 6** — CSS classes for remaining components (Accordion via details/summary, Dialog, Dropdown, Popover, Select, Tooltip, Input Group, Checkbox, Radio)
2. **Phase 7** — JS components for high-value items (Dropdown, Alert, Accordion, Dialog enhancement)
3. **Phase 8** — Migrate existing code patterns (menus, tabs, modals) to shadcn classes
4. **Phase 9** — Build verify
