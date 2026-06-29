---
type: PRD
status: ready
blocked_by: []
---

# PRD: OpenLobby Mobile Adaptation — Phase 1 Core Layout Skeleton

## Problem Statement

OpenLobby Web UI is desktop-only. On mobile phones (320–428px viewport), the fixed 280px sidebar consumes the entire screen, leaving no usable space for the chat room. There is no responsive layout, no touch-optimized navigation, and no mobile-aware state management. Users cannot manage AI coding agent sessions from their phones through the web interface.

Root causes:
- App.tsx uses horizontal flex with fixed `w-72` Sidebar, no `flex-col` stacking on narrow viewports
- No hamburger button or drawer mechanism exists anywhere in the codebase
- SessionCard pin/rename controls rely on CSS `:hover` — invisible on touch devices
- Dialogs (AgentsPanel, ChannelManagePanel, GlobalSettingsDialog) have fixed width and may overflow on short viewports (iPhone SE 568px height)
- No safe-area padding for notched phones
- Portal-level components (dialogs) are rendered inside Sidebar, not accessible from a future mobile navigation

## Solution

Refactor `packages/web/` layout to be responsive using mobile-first CSS. Deliver Phase 1 (core layout skeleton) only: a slide-out drawer for session list, a bottom tab bar for primary navigation, a single shared content tree across breakpoints, and mobile-safe dialog sizing. Desktop unchanged.

### Architecture Principle

Single DOM tree with CSS-driven breakpoint switching (`flex-col md:flex-row`). No duplicate MessageList/MessageInput/TerminalView instances, preserving WebSocket and scroll state across breakpoint changes.

### Key Architectural Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Layout approach | Single tree + CSS | Avoids state loss on breakpoint crossing |
| Drawer mounting | Shell always mounted, children conditional | Smooth backdrop, no DOM thrashing |
| Drawer positioning | `fixed inset-0` | Must escape flex flow |
| Hamburger location | App-level top bar, not RoomHeader | RoomHeader returns null when no session |
| Nav tabs | 3 (Sessions, Agents, Channels) | Settings low-frequency; in drawer |
| Dialog state | Zustand store, not local useState | Sidebar + MobileNav both trigger dialogs |
| SessionCard hover | CSS `group-hover`, not JS `isHovered` | Eliminates touch-state gap |
| z-index | Nav z-40, Drawer z-45, Modals z-50 | Consistent stacking |
| Height unit | `h-screen h-dvh` (cascade) | dvh fallback for Chrome<108, Safari<15.4 |

### New Modules

1. **MobileDrawer** — React component with open/onClose/children props. Fixed overlay, CSS slide+backdrop animation, Escape key, scroll lock, focus trap, ARIA, ErrorBoundary, React.memo.

2. **MobileNav** — Bottom tab bar, 3 tabs (Sessions/Agents/Channels), fixed bottom, safe-area padding, active tab derived from store state, badge count on Agents.

### Modified Modules

3. **App.tsx** — Root layout: `flex-col md:flex-row`, dvh+vh fallback, mobile top bar with hamburger, matchMedia auto-close drawer at >=768px, dialog JSX lifted from Sidebar, mobile-specific empty state.

4. **Sidebar.tsx** — Responsive width (`w-full md:w-72`), `onSessionSelect` prop, dialog state migrated to store, JS hover replaced with CSS group-hover.

5. **lobby-store.ts** — 5 new boolean fields + setters: drawerOpen, showAgentsPanel, showChannelPanel, showSettingsDialog, showUpdateDialog.

6. **index.css** — Safe-area utilities, dvh fallback class, touch target min-size, drawer animations with theme transitions, reduced-motion media query, CSS variable `--mobile-nav-height`.

7. **i18n (en.ts, zh-CN.ts, types.ts)** — 3 flat dot-notation keys: `nav.sessions`, `nav.agents`, `nav.channels`.

8. **TerminalView.tsx** — "Copy last command" button for mobile.

9. **AgentsPanel/ChannelManagePanel/GlobalSettingsDialog** — Mobile-safe sizing: `max-h-[80dvh] overflow-y-auto w-[calc(100vw-32px)] md:w-96`.

## User Stories

US-001. As a mobile user, I want the session list in a slide-out drawer, so that I can browse and select sessions without the sidebar consuming my screen.
  AC: Tap hamburger -> drawer slides in from left (200ms), backdrop at 50% opacity. Tap session -> drawer closes, session activates.

US-002. As a mobile user, I want a bottom tab bar, so that I can navigate between Sessions, Agents, and Channels with one thumb.
  AC: 3 tabs visible on <768px only. Active tab highlighted. Tap Agents -> showAgentsPanel = true. Tap backdrop -> closes.

US-003. As a mobile user, I want tapping the drawer backdrop to close it, so that I can dismiss the drawer intuitively.
  AC: Tap backdrop -> drawer closes (200ms, reversed animation). No action on panel itself.

US-004. As a mobile user with no active session, I want a hint telling me to open the Sessions tab.
  AC: Empty state shows "Tap the menu or Sessions tab to choose a conversation".

US-005. As a desktop user, I want the sidebar to look and behave exactly as before.
  AC: On >=768px: sidebar persistent at 280px, no drawer, no MobileNav, no hamburger, all hover states work.

US-006. As a user rotating between landscape and portrait on a tablet, I want state to survive the breakpoint crossing.
  AC: Single DOM tree ensures state preserved. matchMedia auto-closes drawer >=768px.

US-007. As a mobile user with a notched phone, I want bottom content visible behind the home indicator.
  AC: MobileNav and main content use `env(safe-area-inset-bottom)`.

US-008. As a user with reduced-motion OS setting, I want drawer animations disabled.
  AC: `@media (prefers-reduced-motion: reduce)` disables all drawer transitions.

US-009. As a screen reader user, I want the hamburger and drawer to have proper labels.
  AC: Hamburger: `aria-label="Open navigation menu"`, `aria-expanded`. Drawer: `role="dialog" aria-modal="true"`.

US-010. As a keyboard user, I want Escape to close the drawer.
  AC: keydown listener on drawer open: Escape triggers onClose().

US-011. As a mobile user, I want tapping sidebar content inside the drawer not to close it.
  AC: Panel has `onClick={e => e.stopPropagation()}`.

US-012. As a mobile user, I want the body not to scroll behind the drawer.
  AC: Drawer open sets `document.body.style.overflow = 'hidden'`. Restored on close.

US-013. As a mobile user with a Sidebar crash, I want the drawer to show a fallback instead of taking down the app.
  AC: ErrorBoundary wraps drawer children. Fallback with retry button.

US-014. As a mobile user, I want pinned sessions to be visually identifiable in the drawer.
  AC: Pinned items always show pin icon (opacity-100). Non-pinned: visible on mobile always, hover on desktop.

US-015. As a mobile user, I want to see Agents panel scrollable on a short screen.
  AC: AgentsPanel: `max-h-[80dvh] overflow-y-auto`. Tested at 568px viewport height.

US-016. As a mobile user in a Terminal session, I want a "Copy last command" button.
  AC: Button appears in TerminalView on mobile viewport. Tapping copies last terminal command to clipboard.

US-017. As a mobile user with an older browser, I want the layout to have a height.
  AC: Root uses `h-screen h-dvh` cascade — browsers without dvh support use vh.

US-018. As a developer, I want all mobile CSS changes grouped in a comment block for merge clarity.
  AC: `/* Mobile adaptation: begin */` and `/* Mobile adaptation: end */` delimiters.

US-019. As a user on a 320px-wide phone, I want the drawer to not overflow the viewport.
  AC: Drawer panel: `w-[85vw] max-w-[320px]`. On 320px viewport: 272px.

US-020. As a user opening the app on mobile, I want the layout to fill the visible viewport.
  AC: `h-dvh` ensures viewport excludes address-bar height.

## Implementation Decisions

### Module Breakdown

**MobileDrawer** (new, testable in isolation)
- Interface: `{ open: boolean, onClose: () => void, children: ReactNode }`
- Implementation: fixed overlay -> backdrop + panel, CSS transitions, event handlers
- Design constraints: z-45 (between Nav z-40 and Modals z-50), panel stopPropagation, body scroll lock, focus trap, ErrorBoundary, React.memo, prefers-reduced-motion

**MobileNav** (new, shallow)
- Interface: pulls setDrawerOpen/setShowAgentsPanel/setShowChannelPanel from store
- Implementation: fixed bottom-0, 3 tab buttons, safe-bottom, md:hidden

**App.tsx** (modified, integration point)
- Interface: none (entry component)
- Implementation: flex-col md:flex-row, mobile top bar + hamburger, matchMedia auto-close

**Sidebar.tsx** (modified)
- Interface changes: add `onSessionSelect: (sessionId: string) => void` prop
- Removal: local useState for dialog visibility, JS hover state

**lobby-store.ts** (modified)
- New fields with Zustand immer pattern, no middleware changes

### z-index Hierarchy

| Layer | z-index | Elements |
|-------|---------|----------|
| Nav | 40 | MobileNav |
| Drawer | 45 | MobileDrawer backdrop + panel |
| Modals | 50 | All dialogs |

### Integration Contract

- No changes to packages/core, packages/server, packages/cli, packages/channel-*
- All new files under packages/web/src/components/
- Store changes backward-compatible (new optional fields with defaults)
- All CSS changes wrapped in comment blocks for merge conflict clarity

## Testing Decisions

### Unit-Tested Modules

1. **lobby-store** — verify default values are false, setters toggle correctly
2. **MobileDrawer** — open/close states, backdrop click, Escape key, stopPropagation, scroll lock, ARIA, ErrorBoundary
3. **MobileNav** — renders 3 buttons, store setter calls, hidden on desktop

### Manual Verification

- 5 viewports (320x568, 375x667, 390x844, 430x932, 768x1024)
- Desktop regression (1920x1080)
- Landscape mode (568x320)
- Breakpoint resizing
- i18n switch

### Exception Path Coverage

| Category | Scenario | Expected |
|----------|----------|----------|
| Empty state | No session, drawer closed, mobile first load | Mobile-specific hint |
| Error state | Sidebar throws in drawer | ErrorBoundary fallback + retry |
| Boundary | Drawer open at 767px, resize to 768px | matchMedia auto-closes |
| Boundary | 320px viewport | 85vw = 272px, no overflow |

## Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|:----------:|:------:|------------|
| 1 | matchMedia listener causes re-render loop | Medium | Medium | useCallback + ref for unsubscribe |
| 2 | Sidebar dual instances cause state divergence | Medium | High | showUpdateDialog in store; matchMedia auto-close |
| 3 | Upstream merges conflict in App.tsx | Medium | High | CSS in comment blocks; new code in separate files |
| 4 | h-dvh not supported on user's browser | Low | Medium | Cascade fallback: `h-screen h-dvh` |
| 5 | Tailwind v3.4+ dvh assumption wrong | Low | High | Verify with `pnpm list tailwindcss` |
| 6 | Focus trap breaks existing keyboard nav | Low | Medium | Only active when drawer open |
| 7 | React.memo causes stale children | Low | Low | useCallback on onClose |

## Out of Scope

- Phase 2: RoomHeader mobile, MessageBubble width, MessageInput safe-area, MessageList FAB, full dialog polish, SessionCard long-press
- Phase 3: swipe-to-open drawer, pull-to-refresh, visualViewport keyboard, long-press menu, landscape optimization
- PWA features, native app wrapper, npm dependencies outside packages/web/

## Workload Estimate

**4 person-days** (Phase 1 only). Within the ≤5d constitutional limit. Phase 2+3 to be separate PRDs.

## Architecture Constraints Referenced

| # | Constraint | Source |
|---|-----------|--------|
| R1 | No changes to packages/core, packages/server, packages/cli | §1.2 |
| R2 | Zero new npm dependencies | §Bundle |
| R3 | Single DOM tree | Decision D1 |
| R4 | Mobile CSS delimited by comment blocks | Decision D29 |
| R5 | z-index hierarchy | Decision D17 |
| R6 | No useMediaQuery hook for layout | Decision D7 |

## PRD Quality Constitution Compliance Table

| # | Rule | Status | Evidence |
|---|------|:----:|----------|
| 1 | 章节完整 | ✅ | Problem/Solution/US/Implementation/Testing/OOS |
| 2 | Risks ≥5 + 缓解 | ✅ | 7 risks with mitigation |
| 3 | 定量成功标准 | ✅ | All ACs use EARS format |
| 4 | 异常路径 4 类 | ✅ | Empty/Error/Boundary/Permission(N/A) |
| 5 | 接口签名明确 | ✅ | Module interfaces + z-index table |
| 6 | 内外一致性 | ✅ | US match Implementation modules |
| 7 | 工作量 ≤5d | ✅ | 4d |
| 8 | US 可验证 | ✅ | 20 US with independent ACs |
| 9 | OOS 不含未来期 | ✅ | Phase 2/3 explicitly separated |
| 10 | 技术选型有理由 | ✅ | Architecture Principles table |
| 11 | 架构约束已引用 | ✅ | R1-R6 |

## Further Notes

- Full 31-item decision log: `docs/mobile-adaptation.md` §14
- Upstream sync: merge conflicts isolated to `packages/web/` only
- Known UX debt: left-edge swipe deferred to Phase 3
- Bundle budget: zero new dependencies, ~+5KB JS, ~+3KB CSS
- Accessibility baseline: ARIA labels, focus trap, reduced-motion, tap targets ≥44px (WCAG 2.5.5)
