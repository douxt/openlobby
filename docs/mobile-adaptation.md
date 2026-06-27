# OpenLobby Mobile Adaptation — Development Document

> **Branch**: `feat/mobile-adaptation`
> **Fork**: douxt/openlobby ← kkkkkk1k1/openlobby
> **Target**: Web UI 移动端适配（Mobile-First 重构）
> **Created**: 2026-06-27

---

## 1. Overview

### 1.1 Goal

Make OpenLobby web UI fully functional on mobile devices (phones, 320px–428px viewport width) while preserving and improving desktop experience (>768px).

### 1.2 Non-Goals

- NOT a PWA (no service worker, no offline caching, no push notifications)
- NOT a native app wrapper (no Capacitor/Tauri)
- NO backend changes — purely web frontend
- NO changes to core/server/cli packages

### 1.3 Principles

1. **Mobile-first CSS**: base styles target mobile; `md:` breakpoint layers desktop enhancements
2. **Touch-native interactions**: tap targets ≥44px, swipe gestures, long-press menus
3. **Progressive enhancement**: desktop gets richer UI; mobile gets essential UI
4. **Zero regression**: desktop layout and all existing functionality preserved
5. **Keep sync with upstream**: changes isolated to `packages/web/`; merge conflicts minimized

---

## 2. Current Architecture

### 2.1 File Map

```
packages/web/src/
├── App.tsx                          ← Root layout (horizontal flex)
├── main.tsx                         ← React entry
├── index.css                        ← Tailwind + CSS variables + markdown
├── vite-env.d.ts
├── stores/
│   └── lobby-store.ts               ← Zustand store (~1200 LOC)
├── hooks/
│   ├── useWebSocket.ts              ← WS singleton + API calls
│   ├── useTheme.ts
│   ├── useI18n.ts
│   └── useVersionCheck.ts
├── contexts/
│   ├── ThemeContext.ts
│   └── I18nContext.ts
├── i18n/
│   ├── en.ts
│   ├── zh-CN.ts
│   └── types.ts
└── components/
    ├── Sidebar.tsx                   ← 280px sidebar, 450 LOC
    ├── RoomHeader.tsx                ← Session info bar, 400 LOC
    ├── MessageList.tsx               ← Chat scroll area
    ├── MessageInput.tsx              ← Input box + file upload
    ├── MessageBubble.tsx             ← Chat bubble + markdown
    ├── ChoiceCard.tsx
    ├── QuestionCard.tsx
    ├── ControlCard.tsx
    ├── ToolSummaryBubble.tsx
    ├── TypingIndicator.tsx
    ├── TerminalView.tsx
    ├── SlashCommandMenu.tsx
    ├── AgentsPanel.tsx
    ├── AgentEditDialog.tsx
    ├── ChannelManagePanel.tsx
    ├── DiscoverDialog.tsx
    ├── GlobalSettingsDialog.tsx
    ├── NewSessionDialog.tsx
    └── UpdateDialog.tsx
```

### 2.2 Layout Structure (Desktop)

```
App.tsx  ┌────────────┬──────────────────────────┐
         │ Sidebar    │ Main                      │
         │            │ ┌────────────────────────┐│
         │ w-72       │ │ RoomHeader             ││
         │ (280px)    │ ├────────────────────────┤│
         │            │ │ MessageList / Terminal  ││
         │ SessionList│ │                        ││
         │ + LM btn   │ ├────────────────────────┤│
         │ + AM btn   │ │ SessionStatusBanner     ││
         │ + toolbar  │ │ MessageInput           ││
         │ + status   │ └────────────────────────┘│
         └────────────┴──────────────────────────┘
```

### 2.3 Problem Points on Mobile

| # | Problem | Root Cause | Severity |
|---|---------|-----------|----------|
| 1 | Sidebar consumes 280px of ~375px viewport | Fixed `w-72` in App.tsx | **Critical** |
| 2 | No sidebar toggle mechanism | No hamburger button, no drawer state | **Critical** |
| 3 | SessionCard hover-dependent controls | pin/rename buttons appear only on `:hover` | **High** |
| 4 | RoomHeader crammed on narrow screen | All session info in a single row with flex-wrap | **Medium** |
| 5 | RoomHeader settings dropdown overflows viewport | `w-80` dropdown with `right-0` positioning | **Medium** |
| 6 | File drag-and-drop primary, click secondary | Drag events useless on touch devices | **Low** |
| 7 | No bottom safe-area padding | `MessageInput` sits flush against screen edge | **Medium** |
| 8 | Tool result code blocks forced wide | Font-mono pre blocks with no max-width | **Low** |
| 9 | Dialogs not scrollable on short screens | Modals with fixed `w-96` may overflow 667px height | **Low** |
| 10 | TerminalView xterm.js lacks mobile key bindings | Xterm.js expects physical keyboard | **Known Limitation** |

---

## 3. Design System

### 3.1 Breakpoints

| Breakpoint | Width | Target |
|-----------|-------|--------|
| `base` (default) | 0–768px | Mobile phones |
| `md` | ≥768px | Tablets, small laptops |
| `lg` | ≥1024px | Desktops (current behavior) |

### 3.2 Touch Target Sizes

| Element | Min Size | Notes |
|---------|---------|-------|
| Buttons (icon-only) | 44×44px | WCAG 2.5.5 |
| Buttons (text) | 44px height | |
| List items (tappable) | 48px height | Session cards |
| Input fields | 48px height | Textarea for message |

### 3.3 Safe Area

```css
/* Bottom safe area for notched phones */
.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

### 3.4 Navigation Model

| Viewport | Primary Nav | Session List | Secondary Actions |
|----------|-------------|--------------|-------------------|
| **Mobile (<768px)** | Bottom Tab Bar | Left Drawer (full-width overlay) | Drawer or Bottom Sheet |
| **Desktop (≥768px)** | Persistent Sidebar | Sidebar (280px) | Sidebar toolbar |

### 3.5 Color & Typography

- Inherit existing CSS variables from `index.css` (light + dark themes)
- Mobile typography: same font sizes as desktop (already reasonable at 13–14px for content)
- Adjust only spacing, not fonts

---

## 4. Phase 1: Core Layout Responsive (Skeleton)

### 4.1 New Files

#### `src/components/MobileDrawer.tsx`

**Decision:** Outer shell always mounted (backdrop + panel container), children (Sidebar) only mounted when `open=true`. CSS `transform` + `opacity` transition for animation. Must use `fixed` positioning to escape flex flow.

```tsx
// Props:
//   open: boolean
//   onClose: () => void
//   children: ReactNode
//
// Behavior:
// - Outer wrapper: `fixed inset-0 z-45` — ALWAYS mounted, escapes normal flow
//   - Closed state: `pointer-events-none` (lets clicks through to content)
//   - Open state: `pointer-events-auto`
// - Backdrop: `absolute inset-0 bg-black/50 z-0`
//   - Transition: `opacity-0` ↔ `opacity-100 duration-200`
// - Panel: `absolute top-0 left-0 h-full w-[85vw] max-w-[320px] z-10 bg-surface-secondary border-r border-outline`
//   - Uses `onClick={e => e.stopPropagation()}` to prevent backdrop-close on panel clicks
//   - Transition: `-translate-x-full` ↔ `translate-x-0 duration-200`
// - Children (Sidebar) only mounted when `open=true` (saves DOM when closed)
// - Closes on backdrop tap (backdrop onClick calls onClose)
// - Closes on Escape key (useEffect with keydown listener when open)
// - Scroll lock: sets `document.body.style.overflow = 'hidden'` when open, restores on close
// - Focus trap: on open, focuses first focusable element in drawer; on close, returns focus to hamburger
// - Accessibility:
//   - Panel: `role="dialog" aria-modal="true" aria-label="Session navigation"`
// - Error boundary: wraps children with React ErrorBoundary to prevent full-app crash if Sidebar throws
//
// z-index hierarchy (documented):
//   MobileNav: z-40
//   Drawer backdrop + panel: z-45
//   Modals (settings, destroy confirm, terminal fail): z-50
```

**Implementation sketch:**

```tsx
function MobileDrawer({ open, onClose, children }: Props) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-45 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 z-0 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`absolute top-0 left-0 h-full w-[85vw] max-w-[320px] z-10 bg-surface-secondary border-r border-outline transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Session navigation"
      >
        {open && <ErrorBoundary fallback={<DrawerErrorFallback onRetry={() => onClose()} />}>
          {children}
        </ErrorBoundary>}
      </div>
    </div>
  );
}
```

#### `src/components/MobileNav.tsx`

**Decision:** 3 tabs (not 4). Settings moved into drawer; theme/locale toggles go into Settings dialog. Active tab derived from `drawerOpen` / `showAgentsPanel` / `showChannelPanel` — no separate `activeMobileTab` state needed.

```tsx
// Bottom tab bar — visible only on mobile (<md breakpoint)
//
// Tabs:
//   💬 Sessions  → setDrawerOpen(true)
//   🤖 Agents    → setShowAgentsPanel(true)
//   📡 Channels  → setShowChannelPanel(true)
//
// Behavior:
// - Fixed to bottom of viewport (fixed bottom-0 inset-x-0 z-40)
// - md:hidden on desktop
// - safe-bottom padding for notch devices (pb-safe)
// - Active tab highlighted based on which drawer/dialog is open
// - Badge counts on Agents tab
```

### 4.2 Modified Files

#### `App.tsx` — Layout restructure (single content tree)

**Decision:** Single DOM tree with CSS-driven breakpoint switching via `flex-col md:flex-row`. Avoids duplicate MessageList/MessageInput/TerminalView trees that would lose state on breakpoint changes (iPad rotation, responsive testing). Hamburger in App-level top bar, not in RoomHeader — RoomHeader returns null when no session, so hamburger must live outside it.

**Current:**
```tsx
<div className="h-screen flex bg-surface text-on-surface">
  <Sidebar />
  <main className="flex-1 flex flex-col min-w-0">
    <RoomHeader />  {/* returns null when no active session */}
    {/* MessageList / Terminal / Input / empty state */}
  </main>
</div>
```

**New (single-tree approach):**
```tsx
function App() {
  const drawerOpen = useLobbyStore(s => s.drawerOpen);
  const setDrawerOpen = useLobbyStore(s => s.setDrawerOpen);
  // Dialog state from store (not local useState):
  const showAgentsPanel = useLobbyStore(s => s.showAgentsPanel);
  const showChannelPanel = useLobbyStore(s => s.showChannelPanel);
  const showSettingsDialog = useLobbyStore(s => s.showSettingsDialog);

  return (
    <div className="h-screen h-dvh flex flex-col md:flex-row bg-surface text-on-surface">
      {/* Desktop sidebar — hidden on mobile (CSS), persistent on desktop */}
      <div className="hidden md:flex md:w-72 shrink-0">
        <Sidebar />
      </div>

      {/* Mobile drawer — Sidebar only mounts when open */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Sidebar onSessionSelect={() => setDrawerOpen(false)} />
      </MobileDrawer>

      {/* Single content tree */}
      <main className="flex-1 flex flex-col min-w-0 pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom,0px))] md:pb-0">
        {/* Mobile top bar — always visible on mobile, hidden on desktop */}
        <div className="md:hidden flex items-center px-3 py-2 border-b border-outline bg-surface-secondary">
          <button onClick={() => setDrawerOpen(true)}
                  aria-label="Open navigation menu"
                  aria-expanded={drawerOpen}
                  aria-controls="mobile-drawer"
                  className="w-11 h-11 flex items-center justify-center rounded-lg tap-target">
            <svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="19" y2="1"/><line x1="1" y1="8" x2="19" y2="8"/><line x1="1" y1="15" x2="19" y2="15"/>
            </svg>
          </button>
          <h1 className="text-sm font-bold ml-3">OpenLobby</h1>
        </div>
        <RoomHeader />  {/* unchanged from current */}
        {/* MessageList / Terminal / Input / empty state — single copy, as before */}
      </main>

      {/* Mobile bottom nav — hidden on desktop (md:hidden) */}
      <MobileNav />
      
      {/* Dialogs — moved here from Sidebar, shared by Sidebar + MobileNav */}
      {showAgentsPanel && <AgentsPanel onClose={...} />}
      {showChannelPanel && <ChannelManagePanel onClose={...} />}
      {showSettingsDialog && <GlobalSettingsDialog onClose={...} />}
    </div>
  );
}
```

Key design decisions:
- **`flex-col md:flex-row`** — mobile stacks vertically (top bar → content → nav), desktop side-by-side (sidebar | content)
- **Single content tree** — no duplicate JSX, no mount/unmount on breakpoint change
- **`pb-14 md:pb-0`** on main — leaves room for fixed MobileNav (56px) on mobile
- **Hamburger in App-level top bar** — independent of RoomHeader's `return null` behavior
- **`h-screen h-dvh`** — dvh for modern browsers, vh fallback for older ones
- **`--mobile-nav-height` CSS variable** — single source of truth for bottom nav height, used in main padding
- **Mobile empty state**: on first load with no session, show mobile-specific hint: "Tap ☰ or Sessions to choose a conversation" instead of desktop empty state
- **MatchMedia for resize**: `useEffect` with `matchMedia('(min-width: 768px)')` to auto-close drawer when crossing to desktop breakpoint

#### `Sidebar.tsx` — Mobile-aware + dialog state migration

**Changes:**
1. Remove fixed `w-72` → `w-full md:w-72`
2. Add `onSessionSelect` callback prop (closes drawer on mobile)
3. SessionCard: replace JS `isHovered` state with CSS `md:opacity-0 md:group-hover:opacity-100` — mobile always visible, desktop hover
4. Version/connection status: keep visible
5. **Dialog states moved to Zustand store**: `showAgentsPanel`, `showChannelPanel`, `showSettingsDialog`, `showUpdateDialog` change from local `useState` to `useLobbyStore`. Dialog JSX elements moved from Sidebar to App.tsx.
6. **`showDiscoverDialog` stays in store** (already there) — its JSX also moves to App.tsx for consistency, though its trigger remains only in Sidebar toolbar.
7. Theme toggle (🌙), locale toggle (🌐) remain in sidebar — accessible via drawer on mobile; not in MobileNav

#### `RoomHeader.tsx` — Phase 1: NO changes

**Decision:** RoomHeader untouched in Phase 1. Hamburger moved to App-level top bar (see App.tsx). On mobile the header will flex-wrap (displayName + adapter badge + permission badge + cwd + IM/Terminal toggle + settings in 3-4 lines) — acceptable for Phase 1 skeleton. Mobile-specific RoomHeader simplifications deferred to Phase 2.

### 4.3 i18n Keys to Add

**Decision:** Use flat dot-notation keys matching existing convention (e.g., `'sidebar.agents'`).

```typescript
// en.ts additions — flat keys matching existing pattern
'nav.sessions': 'Sessions',
'nav.agents': 'Agents',
'nav.channels': 'Channels',
// zh-CN.ts additions
'nav.sessions': '会话',
'nav.agents': '代理',
'nav.channels': '频道',
// types.ts Messages interface additions
'nav.sessions': string;
'nav.agents': string;
'nav.channels': string;
```

### 4.4 CSS Additions

```css
/* ══════════════════════════════════════════
   Mobile adaptation: begin
   ══════════════════════════════════════════ */

/* Safe area for notched phones */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* h-dvh with vh fallback — browsers that don't understand dvh ignore it and use 100vh */
.h-dvh-fallback {
  height: 100vh;
  height: 100dvh;
}

/* Touch-friendly tap targets (WCAG 2.5.5) */
.tap-target {
  min-height: 44px;
  min-width: 44px;
}

/* Bottom nav height as CSS variable — single source of truth for main content padding */
:root {
  --mobile-nav-height: 56px;
}

/* Drawer animations — must also include theme transitions so theme switching animates smoothly */
.drawer-backdrop {
  transition: opacity 200ms ease-out, background-color 150ms ease, border-color 150ms ease, color 150ms ease;
}
.drawer-panel {
  transition: transform 200ms ease-out, background-color 150ms ease, border-color 150ms ease, color 150ms ease;
}

/* Respect OS reduced-motion preference */
@media (prefers-reduced-motion: reduce) {
  .drawer-backdrop,
  .drawer-panel {
    transition: none;
  }
}

/* ══════════════════════════════════════════
   Mobile adaptation: end
   ══════════════════════════════════════════ */
```

### 4.5 Tailwind Config Changes

**Decision:** Tailwind 3.4+ has `h-dvh` built-in. No config change needed. Use `h-dvh` directly or the CSS fallback class `.h-dvh-fallback` (see 4.4) for older browser support.

```js
// No changes to tailwind.config.js required.
// Tailwind 3.4+ provides h-dvh, h-svh, h-lvh as built-in utilities.
```

---

## 5. Phase 2: Component Touch Adaptations

### 5.1 SessionCard

**Decision:** CSS `group-hover` approach (no JS hover state) with pinned-item exception. Card uses `group`, controls use `md:opacity-0 md:group-hover:opacity-100`. **Pinned items always show pin icon** (state indicator) — use `opacity-100` when `isPinned` is true. Hidden buttons use `invisible w-0 overflow-hidden` to avoid occupying layout space.

| Current | Mobile | Implementation |
|---------|--------|----------------|
| Pin ✏️ on JS `isHovered` state | Always visible icon buttons | Remove `isHovered` state. Card → `<div className="group">`. Controls: `md:invisible md:w-0 md:overflow-hidden md:group-hover:visible md:group-hover:w-auto`. Pinned items: `opacity-100` always |
| Rename click to edit | Same but larger tap target | `min-h-[44px]` on edit input |
| Right-click context menu | Long-press to show context menu | `onTouchStart` + timer → show action sheet (Phase 3) |

### 5.2 MessageBubble

| Current | Mobile | Implementation |
|---------|--------|----------------|
| `max-w-[75%]` | `max-w-[85%] sm:max-w-[75%]` | Wider bubbles on small screens |
| Code blocks `overflow-x-auto` | Same + `max-w-[calc(100vw-80px)]` | Prevent code from pushing layout |
| Tool result expand/collapse | Touch-friendly toggle button | `min-h-[44px]` |

### 5.3 MessageInput

| Current | Mobile | Implementation |
|---------|--------|----------------|
| `p-3` bottom padding | `pb-[calc(0.75rem+env(safe-area-inset-bottom))]` | Safe area for notched phones |
| Send button `px-4 py-2.5` | `min-h-[44px] min-w-[60px]` | Larger tap target |
| File button `p-2.5` | `min-w-[44px] min-h-[44px]` | Touch target |
| Textarea `minHeight: 42px` | `minHeight: 48px` | Easier typing |

### 5.4 MessageList

| Current | Mobile | Implementation |
|---------|--------|----------------|
| `p-4` | `px-3 py-2` | Tighter padding |
| Auto-scroll on new msg | Same, plus tap-to-scroll-bottom FAB | Floating action button when scrolled up |
| "New messages" button | Larger, centered, bottom-4 | `min-h-[44px]` |

### 5.5 RoomHeader

| Current | Mobile | Implementation |
|---------|--------|----------------|
| All info in one row | Stack on mobile, collapse cwd | `flex-wrap` → hide cwd on mobile |
| Settings dropdown `w-80` | Full-width bottom sheet or centered modal | `md:w-80 w-[calc(100vw-32px)]` |
| IM/Terminal toggle | Same but larger | `min-h-[36px]` |

### 5.6 Dialogs (all)

**Phase 1 minimal guard:** The three dialogs rendered in Phase 1 (AgentsPanel, ChannelManagePanel, GlobalSettingsDialog) get the mobile pattern applied immediately to prevent overflow on short viewports (iPhone SE 568px height). Full dialog polish remains Phase 2.

**Phase 1 applied to: AgentsPanel, ChannelManagePanel, GlobalSettingsDialog**

| Dialog | Mobile Fix |
|--------|-----------|
| AgentsPanel | `max-h-[80dvh] overflow-y-auto w-[calc(100vw-32px)] md:w-96` |
| ChannelManagePanel | Same as above |
| GlobalSettingsDialog | Same as above |

**Phase 2 applied to remaining dialogs:**

| Dialog | Mobile Fix |
|--------|-----------|
| DiscoverDialog | `max-h-[80vh] overflow-y-auto`, full-width on mobile |
| AgentEditDialog | Scrollable content, sticky footer |
| NewSessionDialog | Same as above |
| UpdateDialog | Same as above |
| Destroy confirm | Smaller padding, `w-[calc(100vw-32px)]` |

**Pattern:** All dialogs add these classes:
```
w-[calc(100vw-32px)] md:w-96
max-h-[80dvh] overflow-y-auto
mx-4 md:mx-0
```

---

## 6. Phase 3: Gestures & Polish

### 6.1 Swipe-to-Open Drawer

- Detect swipe-right gesture on the left ~20px edge of the screen
- Use `touchstart/touchmove/touchend` event handlers
- Threshold: 60px horizontal movement + angle < 30° from horizontal
- Spring animation when released mid-swipe

### 6.2 Pull-to-Refresh Message History

**Implementation options:**
1. Use `overscroll-behavior: contain` + custom `touchmove` handler
2. Use a library (react-pull-to-refresh or similar) — evaluate bundle size impact

**Recommendation:** Custom implementation — lightweight, avoids dependency. Detect scrollTop === 0 + touchmove down > threshold → trigger `wsRequestSessionHistory`.

### 6.3 Long-Press Context Menu

On SessionCard:
- `onTouchStart` starts 500ms timer
- `onTouchEnd` / `onTouchMove` cancels timer
- On fire: show a bottom action sheet with Pin/Unpin, Rename, Delete options
- `onTouchEnd` without long-press = normal click (select session)

### 6.4 Keyboard Handling

```tsx
// In MessageInput or App
useEffect(() => {
  const handleResize = () => {
    if (window.visualViewport) {
      const keyboardHeight = window.innerHeight - window.visualViewport.height;
      // Adjust scroll position when keyboard opens
      if (keyboardHeight > 0) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };
  window.visualViewport?.addEventListener('resize', handleResize);
  return () => window.visualViewport?.removeEventListener('resize', handleResize);
}, []);
```

### 6.5 Transition Animations

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Drawer open/close | Slide + fade backdrop | 250ms | `ease-out` |
| Drawer close | Slide + fade | 200ms | `ease-in` |
| Tab switch | Fade content | 150ms | `ease` |
| Long-press menu | Scale-up from bottom | 200ms | `ease-out` |

Use CSS transitions + conditional classes (no animation library needed).

---

## 7. Complete File Change Map

### New Files

| File | Purpose | Phase |
|------|---------|-------|
| `packages/web/src/components/MobileDrawer.tsx` | Slide-out drawer container | 1 |
| `packages/web/src/components/MobileNav.tsx` | Bottom tab bar | 1 |
| `packages/web/src/components/MobileContextMenu.tsx` | Long-press action sheet | 2 |
| `packages/web/src/hooks/useTouchGesture.ts` | Swipe/long-press gesture detection | 3 |
| `packages/web/src/hooks/usePullToRefresh.ts` | Pull-to-refresh logic | 3 |

### Modified Files

| File | Changes Summary | Phase |
|------|----------------|-------|
| `packages/web/src/App.tsx` | Single-tree responsive layout, mobile top bar, drawer/dialog integration | 1 |
| `packages/web/src/components/Sidebar.tsx` | Responsive width, touch-visible controls, `onSessionSelect` prop, dialog state→store | 1 |
| `packages/web/src/components/RoomHeader.tsx` | (Phase 1: NO changes — hamburger in App-level bar) | — |
| `packages/web/src/components/TerminalView.tsx` | Add "Copy last command" button for mobile (no keyboard) | 1 |
| `packages/web/src/index.css` | Safe area, dvh fallback, touch media queries, drawer animations, reduced-motion, CSS vars | 1 |
| `packages/web/tailwind.config.js` | **No changes** — Tailwind 3.4+ has h-dvh built-in | — |
| `packages/web/src/components/SessionCard` (in Sidebar.tsx) | Touch-visible controls, long-press support | 2 |
| `packages/web/src/components/MessageBubble.tsx` | Mobile bubble width, code block sizing | 2 |
| `packages/web/src/components/MessageInput.tsx` | Safe area padding, touch targets ↑ | 2 |
| `packages/web/src/components/MessageList.tsx` | Tight padding, scroll-to-bottom FAB | 2 |
| `packages/web/src/components/RoomHeader.tsx` | Mobile settings as bottom sheet | 2 |
| All dialog components (8 files) | Full-width mobile, scrollable, safe area | 2 |
| `packages/web/src/stores/lobby-store.ts` | Add `drawerOpen` + dialog states (`showAgentsPanel`, `showChannelPanel`, `showSettingsDialog`) | 1 |
| `packages/web/src/i18n/en.ts` | New `nav.sessions`, `nav.agents`, `nav.channels` translation keys (flat dot-notation) | 1 |
| `packages/web/src/i18n/zh-CN.ts` | Same keys, Chinese | 1 |

### Untouched Files

```
packages/core/          ← NO changes
packages/server/        ← NO changes
packages/cli/           ← NO changes
packages/channel-*/     ← NO changes
docs/architecture.md    ← preserved
CLAUDE.md              ← preserved (may append mobile dev notes)
```

---

## 8. State Management

### 8.1 New Store Keys (lobby-store.ts) — Phase 1

```typescript
// Mobile UI state
drawerOpen: boolean;
setDrawerOpen: (open: boolean) => void;

// Dialog states — migrated from Sidebar local useState to store
// (shared by Sidebar toolbar + MobileNav tabs)
// Prefix with `_` or wrap in comment block to avoid upstream collision
showAgentsPanel: boolean;
showChannelPanel: boolean;
showSettingsDialog: boolean;
showUpdateDialog: boolean;     // migrated alongside the others for dual-instance safety
setShowAgentsPanel: (show: boolean) => void;
setShowChannelPanel: (show: boolean) => void;
setShowSettingsDialog: (show: boolean) => void;
setShowUpdateDialog: (show: boolean) => void;
```

**NOT added in Phase 1:**
- `activeMobileTab` — MobileNav derives active tab from `drawerOpen`/`showAgentsPanel`/`showChannelPanel`
- `contextMenu` — deferred to Phase 3 (long-press)
- `useMediaQuery` hook — CSS breakpoints (`hidden md:flex`, `md:hidden`) cover all Phase 1 needs

### 8.2 Responsive Detection — Phase 1

No JS media query hook needed. All breakpoint switching uses Tailwind responsive prefixes:
- Desktop sidebar: `hidden md:flex`
- Mobile drawer: always mounted (CSS handles visibility)
- Mobile top bar: `md:hidden`
- Mobile bottom nav: fixed + `md:hidden`
- Main padding: `pb-14 md:pb-0`

---

## 9. Testing Strategy

### 9.1 Manual Testing Checklist

| # | Scenario | Viewport | Status |
|---|----------|----------|--------|
| 1 | iPhone SE 1st gen (320×568) | Chrome DevTools | ☐ |
| 2 | iPhone SE 3rd gen (375×667) | Chrome DevTools | ☐ |
| 3 | iPhone 12/13/14 (390×844) with notch | Chrome DevTools | ☐ |
| 4 | iPhone 14 Pro Max (430×932) with dynamic island | Chrome DevTools | ☐ |
| 5 | iPad Mini (768×1024) portrait — tablet transition | Chrome DevTools | ☐ |
| 6 | Desktop (1920×1080) — regression check | Real browser | ☐ |
| 7 | Landscape mode (568×320) — iPhone SE | Chrome DevTools | ☐ |
| 8 | Resize between mobile/desktop breakpoints — drawer auto-closes | Chrome DevTools | ☐ |
| 9 | Rotate portrait ↔ landscape — layout stays correct | Real device or DevTools | ☐ |

### 9.2 Touch Interaction Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Tap hamburger → drawer slides in | Backdrop fades, panel slides from left |
| T2 | Tap backdrop → drawer closes | Same animation reversed |
| T3 | Tap session in drawer → drawer closes + session opens | Session selected, chat visible |
| T4 | Swipe-right from left 20px edge → drawer opens | Phase 3 (known UX debt in Phase 1) |
| T5 | Long-press session card → context menu | Phase 3 |
| T6 | Keyboard opens → content scrolls into view | visualViewport API, Phase 3 |
| T7 | Tap Agents tab → AgentsPanel opens | Dialog with mobile-safe sizing |
| T8 | Tap Channels tab → ChannelManagePanel opens | Dialog with mobile-safe sizing |

### 9.2 Key User Flows

1. Open app → see session list drawer → tap session → drawer closes, chat opens
2. Send message → bubble appears → scrolls to bottom
3. Receive AI response → markdown renders correctly on narrow viewport
4. Switch to terminal view → xterm.js fills width (known: no mobile keyboard)
5. Open settings → change theme/locale → applies correctly
6. File upload via "📎" button → uploads and attaches
7. Long-press session → context menu → pin/unpin works
8. Pull down on message list → loads history (Phase 3)

### 9.3 Automated Tests

```bash
# Existing tests — must continue passing
pnpm test

# If we add new component tests (recommended):
# - MobileDrawer: renders, opens/closes, backdrop click
# - MobileNav: renders tabs, triggers callbacks
# - useTouchGesture: detects swipe directions
# - useMediaQuery: matches breakpoint changes
```

### 9.4 Visual Regression

- Take screenshots of all 5 viewports (4 mobile + 1 desktop) before and after
- Compare manually for first pass; consider Percy/Chromatic for CI later

---

## 10. Implementation Order

```
Phase 1 (Skeleton)                Phase 2 (Components)    Phase 3 (Polish)
══════════════════                ════════════════════    ════════════════
1. CSS additions                   1. SessionCard touch    1. useTouchGesture.ts
   (safe-area, dvh-fallback,        (long-press)           2. usePullToRefresh.ts
    tap-target, drawer anims,     2. MessageBubble width  3. Keyboard handling
    reduced-motion, CSS vars)     3. MessageInput safe    4. Transitions/anims
2. MobileDrawer.tsx                  area                 5. Long-press menu
   (fixed pos, stopPropagation,   4. MessageList FAB      6. Swipe-to-open drawer
    Escape key, scroll lock,      5. RoomHeader mobile    7. Edge case testing
    aria, ErrorBoundary)          6. All 8 dialogs mobile
3. lobby-store fields             7. Agents/Channels→
   (drawerOpen, showAgentsPanel,     bottom sheets
   showChannelPanel,
   showSettingsDialog,
   showUpdateDialog)
4. MobileNav.tsx (3 tabs)
5. Sidebar.tsx adapt
   (dialog state → store,
    SessionCard group-hover,
    showUpdateDialog → store)
6. App.tsx layout
   (single tree, h-screen+h-dvh,
    matchMedia resize handler,
    mobile empty state)
7. TerminalView.tsx
   (Copy last command button)
8. 3 dialogs: mobile sizing guard
9. i18n keys (flat dot-notation)
10. RoomHeader: NO changes

Each phase ends with: pnpm build → no errors → test on all breakpoints
```

---

## 11. Upstream Sync Strategy

Since we merge upstream periodically:

1. **All changes in `packages/web/`** — no files touched in core/server/cli
2. **Commit discipline**: one feature per commit, clear messages
3. **Merge upstream**: `git fetch upstream && git merge upstream/main`
4. **Conflict risk areas** (in order of likelihood):
   - `App.tsx` — if upstream changes layout
   - `Sidebar.tsx` — if upstream adds new sidebar features
   - `lobby-store.ts` — if upstream adds new state keys
   - `index.css` — if upstream adds new CSS variables
   - i18n files — if upstream adds translations

5. **Mitigation**: 
   - Extract mobile-specific code into separate components (MobileDrawer, MobileNav) to minimize diff surface
   - Use conditional rendering (`{isMobile ? <A/> : <B/>}`) rather than rewriting components
   - Keep original component names and exports unchanged

---

## 12. Known Limitations & Tradeoffs

### 12.1 Technical Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|------------|
| xterm.js on mobile | Terminal view requires physical keyboard | Add "Copy last command" button (Phase 1); keep terminal accessible |
| File drag-and-drop | Drag events don't fire on mobile | File input button is primary on mobile |
| WebSocket reconnection | Mobile networks drop connections | Existing reconnection in useWebSocket handles this |
| Large message history | DOM nodes multiply on narrow viewport | `will-change: transform` hints for smoother scrolling |
| 3rd-party keyboard | Custom keyboards may interfere | Standard system keyboard works; no mitigation |
| h-dvh browser support | Chrome<108, Safari<15.4 ignore dvh | `h-screen` fallback in class list |

### 12.2 UX Tradeoffs

| Tradeoff | Why | Mitigation |
|----------|-----|------------|
| Drawer vs standalone session list | Session list hidden in drawer = 2 taps to switch vs 1 in standard IM | Accept for Phase 1; consider stacked nav in future |
| Left-edge swipe in Phase 3 | Core mobile gesture deferred — users will try it day one | Documented as known debt; Phase 3 is the fix |
| Landscape on small phones | 320px vertical with top bar + nav → ~220px for content | Accept for Phase 1; optimize in Phase 3 |
| Agents/Channels as dialogs | Full overlay loses session context vs bottom sheets | Accept for Phase 1; consider bottom sheets in Phase 2 |
| Dual Sidebar instances | Desktop + mobile drawer each mount Sidebar → duplicate subscriptions | Accept for Phase 1; matchMedia + single instance possible in future |
| RoomHeader flex-wrap on mobile | 3-4 lines of session info on 375px screen | Accept for Phase 1; Phase 2 simplifies |

---

## 13. Bundle Size Budget

| Metric | Current | After Phase 1 | After Phase 3 | Limit |
|--------|---------|---------------|---------------|-------|
| JS bundle (gzip) | 240.80 KB | ~245 KB | ~250 KB | 300 KB |
| CSS bundle (gzip) | 7.99 KB | ~10 KB | ~12 KB | 20 KB |
| New deps | 0 | 0 | 0 | 0 |

**No new npm dependencies.** All gestures, drawers, menus built with React + CSS. 

---

## 14. Decision Log (from grill-me session 2026-06-27)

| # | Topic | Original Doc Proposal | Final Decision | Rationale |
|---|-------|-----------------------|----------------|-----------|
| D1 | Layout approach | Two DOM trees | Single tree + CSS (`flex-col md:flex-row`) | Avoid state loss on breakpoint change, no duplicate code |
| D2 | Hamburger location | In RoomHeader | App-level top bar | RoomHeader returns null when no session |
| D3 | MobileNav tabs | 4 tabs | 3 tabs (Sessions, Agents, Channels) | Settings low-frequency; theme/locale in drawer |
| D4 | `activeMobileTab` state | In Zustand store | Derived from drawer/dialog states | Avoid redundant state |
| D5 | Dialog state location | Sidebar local `useState` | Zustand store | Two entry points need same dialogs |
| D6 | SessionCard hover | JS `isHovered` | CSS `group-hover` + pinned exception | Pinned items always show indicator |
| D7 | `useMediaQuery` hook | Phase 1 | Skip + use matchMedia for resize only | CSS covers 95%; one matchMedia for drawer-close |
| D8 | RoomHeader Phase 1 | Add hamburger, simplify | NO changes | Flex-wrap acceptable; Phase 2 for polish |
| D9 | Drawer mount strategy | Not specified | Shell always mounted, Sidebar on `open` | Smooth backdrop, save DOM |
| D10 | `h-screen` vs `h-dvh` | `h-dvh` only | `h-screen h-dvh` (fallback) | dvh unsupported on Chrome<108, Safari<15.4 |
| D11 | Implementation order | 8 steps, leads with Drawer | 10 steps, leads with CSS | Dependency-first |
| D12 | Drawer positioning | Not specified | `fixed inset-0` | Must escape flex flow |
| D13 | Backdrop click | No stopPropagation | `onClick={e => e.stopPropagation()}` on panel | Prevents drawer-close on sidebar click |
| D14 | Accessibility | None | aria-label, aria-expanded, aria-modal, role="dialog", focus trap | WCAG compliance |
| D15 | Error boundary | None | Wrap drawer children | Prevents full-app crash |
| D16 | Scroll lock | Not addressed | `document.body.style.overflow = 'hidden'` on open | Prevent background scroll |
| D17 | z-index hierarchy | Not specified | Nav z-40, Drawer z-45, Modals z-50 | Consistent stacking |
| D18 | Safe-area + nav height | Hardcoded `pb-14` | `pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom,0px))]` | CSS variable as single source |
| D19 | Tailwind h-dvh config | Custom `theme.extend.height.dvh` | Removed — Tailwind 3.4+ built-in | Avoid redundancy |
| D20 | i18n key format | Nested object `nav: { sessions: ... }` | Flat dot-notation `'nav.sessions'` | Match existing convention |
| D21 | Dialog mobile guard | Deferred to Phase 2 | 3 dialogs get mobile sizing in Phase 1 | Prevent overflow on iPhone SE |
| D22 | `prefers-reduced-motion` | Not addressed | `@media (prefers-reduced-motion: reduce) { transition: none }` | WCAG 2.3.3 |
| D23 | Theme transitions + drawer anims | Separate transitions | Consolidated: `transition: transform ..., background-color ..., border-color ..., color ...` | Smooth theme switch during drawer open |
| D24 | `showUpdateDialog` | Left as local state | Migrated to store | Dual Sidebar instances diverge otherwise |
| D25 | `showDiscoverDialog` | Already in store but JSX in Sidebar | JSX also moves to App.tsx | Consistency with other dialogs |
| D26 | Resize to desktop with drawer open | Not addressed | `matchMedia('(min-width: 768px)')` auto-closes drawer | Prevent dual-sidebar state |
| D27 | Landscape mode | Not addressed | Documented as known gap (addressed in Phase 3) | Acceptable tradeoff |
| D28 | TerminalView mobile | No mitigation | Add "Copy last command" button in Phase 1 | Low effort, high value |
| D29 | CSS comment block | Not specified | `/* Mobile adaptation: begin */ ... /* end */` | Clear merge conflict boundaries |
| D30 | Left-edge swipe gesture | Phase 3 | Phase 3 (documented as known UX debt) | Scope control; Phase 1 is skeleton only |
| D31 | React.memo | Not specified | Wrap MobileDrawer, useCallback on close handler | Prevent unnecessary re-renders |

## 15. References

- Upstream repo: https://github.com/kkkkk1k1/openlobby
- Our fork: https://github.com/douxt/openlobby
- Tailwind responsive design: https://tailwindcss.com/docs/responsive-design
- WCAG 2.5.5 Target Size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- env() safe-area: https://developer.mozilla.org/en-US/docs/Web/CSS/env
- dynamic viewport units: https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-percentage-lengths
