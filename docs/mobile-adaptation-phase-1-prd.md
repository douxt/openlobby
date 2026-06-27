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
- dialogs (AgentsPanel, ChannelManagePanel, GlobalSettingsDialog) have fixed width and may overflow on short viewports (iPhone SE 568px height)
- No safe-area padding for notched phones — MessageInput and potential bottom nav sit flush against screen edge
- Portal-level components (dialogs) are rendered inside Sidebar, not accessible from a future mobile navigation

The side effect on product growth is severe: every user who wants to check session status, approve a tool call, or read a response from their phone currently hits a broken layout and bounces.

## Solution

Refactor `packages/web/` layout to be responsive using mobile-first CSS. Deliver Phase 1 (core layout skeleton) only: a slide-out drawer for session list, a bottom tab bar for primary navigation, a single shared content tree across breakpoints, and mobile-safe dialog sizing. Desktop unchanged.

### Architecture Principle

Single DOM tree with CSS-driven breakpoint switching (`flex-col md:flex-row`). No duplicate MessageList/MessageInput/TerminalView instances, preserving WebSocket and scroll state across breakpoint changes (iPad rotation, responsive test resize).

### Key Architectural Decisions (justified)

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
| Safe area | `env(safe-area-inset-bottom)` CSS var | Single source of truth |

### New Modules

1. **MobileDrawer** (deep module) — React component with open/onClose/children props. Fixed overlay, CSS slide+backdrop animation, Escape key, scroll lock, focus trap, ARIA, ErrorBoundary, React.memo. Shell always mounted (animates), children mounted only when open (saves DOM).

2. **MobileNav** (shallow module) — Bottom tab bar, 3 tabs (Sessions/Agents/Channels), fixed bottom, safe-area padding, active tab derived from store state, badge count on Agents.

### Modified Modules

3. **App.tsx** — Root layout restructured: `flex-col md:flex-row`, dvh+vh fallback, mobile top bar with hamburger, matchMedia auto-close drawer at >=768px, dialog JSX lifted from Sidebar, mobile-specific empty state.

4. **Sidebar.tsx** — Responsive width (`w-full md:w-72`), `onSessionSelect` prop, dialog state migrated to store (showAgentsPanel, showChannelPanel, showSettingsDialog, showUpdateDialog), JS hover replaced with CSS group-hover, pinned items always show pin, invisible+zero-width hidden controls.

5. **lobby-store.ts** — 5 new boolean fields + setters: drawerOpen, showAgentsPanel, showChannelPanel, showSettingsDialog, showUpdateDialog.

6. **index.css** — Safe-area utilities, dvh fallback class, touch target min-size, drawer animations with theme transitions, reduced-motion media query, CSS variable `--mobile-nav-height`, all wrapped in `/* Mobile adaptation: begin/end */` comment block.

7. **i18n (en.ts, zh-CN.ts, types.ts)** — 3 flat dot-notation keys per locale: `nav.sessions`, `nav.agents`, `nav.channels`.

8. **TerminalView.tsx** — "Copy last command" button for mobile.

9. **AgentsPanel/ChannelManagePanel/GlobalSettingsDialog** — Mobile-safe sizing: `max-h-[80dvh] overflow-y-auto w-[calc(100vw-32px)] md:w-96`.

## User Stories

US-001. As a mobile user, I want the session list in a slide-out drawer, so that I can browse and select sessions without the sidebar consuming my screen.
  AC: Tap hamburger -> drawer slides in from left (200ms), backdrop at 50% opacity. Tap session -> drawer closes, session activates.

US-002. As a mobile user, I want a bottom tab bar, so that I can navigate between Sessions, Agents, and Channels with one thumb.
  AC: 3 tabs visible on <768px only. Active tab highlighted. Tap Agents -> showAgentsPanel = true. Tap backdrop -> closes.

US-003. As a mobile user, I want tapping the drawer backdrop to close it, so that I can dismiss the drawer intuitively.
  AC: Tap backdrop -> drawer closes (200ms, reversed animation). No action on panel itself.

US-004. As a mobile user with no active session, I want a hint telling me to open the Sessions tab, so that I know how to start.
  AC: Empty state on first load (no session, drawer not open) shows "Tap the menu or Sessions tab to choose a conversation". Not shown if drawer is open.

US-005. As a desktop user, I want the sidebar to look and behave exactly as before, so that my workflow is unchanged.
  AC: On >=768px: sidebar persistent at 280px, no drawer, no MobileNav, no hamburger, all hover states work, all controls present.

US-006. As a user rotating between landscape and portrait on a tablet, I want my message list scroll position, input text, and active session to survive the breakpoint crossing.
  AC: Single DOM tree ensures state preserved. matchMedia auto-closes drawer when crossing from <768px to >=768px.

US-007. As a mobile user with a notched phone, I want bottom content visible behind the home indicator, so that buttons and nav are not clipped.
  AC: MobileNav and main content use `env(safe-area-inset-bottom)`. Verified on iPhone 14 Pro (390x844) viewport.

US-008. As a user with reduced-motion OS setting, I want drawer animations disabled, so that the UI respects my accessibility preference.
  AC: `@media (prefers-reduced-motion: reduce)` disables all drawer transitions.

US-009. As a screen reader user, I want the hamburger and drawer to have proper labels, so that I can navigate with VoiceOver/TalkBack.
  AC: Hamburger: `aria-label="Open navigation menu"`, `aria-expanded`. Drawer panel: `role="dialog" aria-modal="true" aria-label="Session navigation"`.

US-010. As a keyboard user, I want Escape to close the drawer, so that I don't need to reach for the backdrop.
  AC: keydown listener on drawer open: Escape triggers onClose().

US-011. As a mobile user, I want tapping sidebar content inside the drawer not to close it, so that I can interact with session cards.
  AC: Panel has `onClick={e => e.stopPropagation()}`.

US-012. As a mobile user, I want the body not to scroll behind the drawer, so that I can focus on the drawer content.
  AC: Drawer open sets `document.body.style.overflow = 'hidden'`. Restored on close.

US-013. As a mobile user with a Sidebar crash, I want the drawer to show a fallback instead of taking down the app, so that I can recover.
  AC: ErrorBoundary wraps drawer children. Fallback: "Something went wrong loading the sidebar." with retry button.

US-014. As a mobile user, I want pinned sessions to be visually identifiable in the drawer, so that I can find important sessions fast.
  AC: Pinned items always show pin icon (opacity-100). Non-pinned: visible on desktop hover, always visible on mobile.

US-015. As a mobile user, I want to see Agents panel scrollable on a short screen, so that all agent cards and buttons are reachable on iPhone SE.
  AC: AgentsPanel: `max-h-[80dvh] overflow-y-auto`. Tested at 568px viewport height — all content scrollable, Done button always reachable.

US-016. As a mobile user in a Terminal session, I want a "Copy last command" button, so that I can reuse terminal output without a physical keyboard.
  AC: Button appears in TerminalView on mobile viewport. Tapping copies last terminal command to clipboard.

US-017. As a mobile user with an older browser (Chrome <108), I want the layout to have a height, so that I don't see a blank page.
  AC: Root uses `h-screen h-dvh` — browsers that don't understand dvh use vh.

US-018. As a developer, I want all mobile CSS changes grouped in a comment block, so that merging upstream updates is clear.
  AC: `/* Mobile adaptation: begin */` and `/* Mobile adaptation: end */` delimiters in index.css, App.tsx, Sidebar.tsx.

US-019. As a user on a 320px-wide phone (iPhone SE 1st gen), I want the drawer to not overflow the viewport, so that all content fits.
  AC: Drawer panel: `w-[85vw] max-w-[320px]`. On 320px viewport: 272px.

US-020. As a user opening the app on mobile, I want the layout to fill the visible viewport, so that there is no vertical scrollbar on the root.
  AC: `h-dvh` ensures viewport excludes address-bar height. Verified on Chrome Android DevTools.

## Implementation Decisions

### Module Breakdown

**Module: MobileDrawer** (new, testable in isolation)
- Interface: `{ open: boolean, onClose: () => void, children: ReactNode }`
- Implementation: fixed overlay -> backdrop + panel, CSS transitions, event handlers
- Design constraints: z-45 (between Nav z-40 and Modals z-50), panel stopPropagation, body scroll lock, focus trap, ErrorBoundary, React.memo, prefers-reduced-motion
- Test strategy: mount with open=true/false, simulate backdrop click, simulate Escape key, verify scroll lock, verify ARIA attributes

**Module: MobileNav** (new, shallow)
- Interface: pulls setDrawerOpen/setShowAgentsPanel/setShowChannelPanel from store
- Implementation: fixed bottom-0, 3 tab buttons, safe-bottom, md:hidden
- Test strategy: render, verify 3 buttons, verify store setters called on tap, verify hidden at >=768px

**Module: Layout (App.tsx)** (modified, integration)
- Interface: none (entry component)
- Implementation: flex-col md:flex-row, mobile top bar + hamburger, matchMedia auto-close, dialog JSX moved from Sidebar
- Verification: manual breakpoint testing (5 viewports), matchMedia handler unit test

**Module: Sidebar** (modified)
- Interface changes: add `onSessionSelect: (sessionId: string) => void` prop
- Removal: local useState for dialog visibility, JS hover state for controls
- Addition: CSS group-hover, pinned-item always-visible, responsive width

**Module: lobby-store** (modified)
- New fields: `drawerOpen: boolean` + `setDrawerOpen(open: boolean)`, showAgentsPanel, showChannelPanel, showSettingsDialog, showUpdateDialog with corresponding setters
- Pattern: existing Zustand immer pattern, no middleware changes

**Module: CSS system** (modified)
- New utilities in index.css: .pb-safe, .h-dvh-fallback, .tap-target, :root { --mobile-nav-height }, drawer transition classes, reduced-motion
- Delimited by comment block

**Module: i18n** (modified)
- 3 flat keys per locale file + Messages interface

**Module: TerminalView** (modified)
- Add "Copy last command" button, visible on mobile, hidden on desktop

**Module: Dialogs** (3 modified)
- AgentsPanel, ChannelManagePanel, GlobalSettingsDialog: add mobile sizing classes

### z-index Hierarchy (binding)

| Layer | z-index | Elements |
|-------|---------|----------|
| Nav (bottom tab) | 40 | MobileNav |
| Drawer | 45 | MobileDrawer backdrop + panel |
| Modals/Overlays | 50 | AgentsPanel, ChannelManagePanel, GlobalSettingsDialog, DiscoverDialog, AgentEditDialog, NewSessionDialog, UpdateDialog, destroy confirm |

### Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| base | 0-768px | Mobile: top bar, content, bottom nav |
| md | >=768px | Desktop: sidebar + content |

### Integration Contract

- No changes to packages/core, packages/server, packages/cli, packages/channel-*
- All new files under packages/web/src/components/
- Store changes backward-compatible (new optional fields with defaults)
- All CSS changes wrapped in comment blocks for merge conflict clarity

## Testing Decisions

**What makes a good test.** Tests verify external behavior, not implementation details. Avoid testing CSS class strings, internal state variable names, or refs. Prefer testing DOM output, accessibility attributes, and callback invocations.

### Unit-Tested Modules

1. **lobby-store** — verify default values are false, setters toggle correctly, no other state is affected
2. **MobileDrawer** — open=true renders panel with aria-modal, backdrop click fires onClose, Escape key fires onClose, stopPropagation on panel click, scroll lock applied/removed, closed/false: no children rendered, panel has `-translate-x-full`, ErrorBoundary wraps children. Test in isolation via mount + simulate events.
3. **MobileNav** — renders 3 buttons with correct labels (Sessions, Agents, Channels), each button calls the correct store setter, hidden on desktop via responsive (verify with matchMedia mock), active tab derived correctly

**Prior art:** Existing tests in packages/web/ (vitest + @testing-library/react patterns to be established — this will be the first component tests for web package).

### Manually Verified

- App layout at 5 viewports (320x568, 375x667, 390x844, 430x932, 768x1024)
- Drawer open/close animation (200ms)
- Landscape mode (568x320) — no crash, basic stacking correct
- Rotate/resize across breakpoint — state preserved
- Desktop regression (1920x1080) — sidebar, hover, all dialogs, all interactions identical to baseline
- i18n switch zh-CN shows Chinese tab labels
- pnpm test passes, pnpm build succeeds

### Exception Path Coverage

| Category | Scenario | Expected Behavior |
|----------|----------|-------------------|
| Empty state | No session exists, drawer closed, mobile user first load | Mobile-specific hint: "Tap the menu or Sessions tab to choose a conversation" |
| Empty state | No session exists, drawer open | Hint hidden, drawer shows session list (empty) |
| Error state | Sidebar component throws during render inside drawer | ErrorBoundary catches: fallback UI with "Something went wrong loading the sidebar" + retry button. App continues running. |
| Error state | MobileNav fails to render | Individual tab button failure isolated; other buttons still work |
| Boundary | Drawer open at 767px, resize to 768px | matchMedia handler fires, drawer auto-closes via setDrawerOpen(false) |
| Boundary | Drawer panel width at 320px viewport | 85vw = 272px, max-w-[320px] means 272px actual. No overflow, no horizontal scroll. |
| Boundary | Dialog (AgentsPanel) opened on 568px-height viewport | max-h-[80dvh] = 454px, overflow-y-auto enables scroll. All content + Done button reachable. |
| Permission denied | Not applicable (no auth/permissions in Phase 1) | N/A — permission model does not exist in current codebase |

## Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|:----------:|:------:|------------|
| 1 | matchMedia listener causes re-render loop on resize | Medium | Medium | useCallback + ref for unsubscribe. useEffect cleanup verifiable. |
| 2 | Sidebar dual instances (desktop + drawer) cause state divergence | Medium | High | showUpdateDialog migrated to store (shared state). matchMedia auto-close at 768px hides desktop instance when drawer would be open. |
| 3 | Upstream merges conflict in App.tsx layout | Medium | High | Mobile CSS changes delimited by comment blocks. All new code in separate components (MobileDrawer, MobileNav). Original component names/exports unchanged. |
| 4 | h-dvh not supported on user's browser | Low | Medium | Cascade fallback: `h-screen h-dvh`. Ignored-property fallback works. |
| 5 | Tailwind v3.4+ dvh built-in assumption wrong | Low | High | Verify with `pnpm list tailwindcss`. If <3.4, add custom extension. |
| 6 | Focus trap implementation breaks existing keyboard nav | Low | Medium | Focus trap only active when drawer open. Restores focus to hamburger on close. |
| 7 | React.memo on MobileDrawer causes stale children | Low | Low | Wrap onClose with useCallback in App. Children are Sidebar which re-renders from store subscriptions. |

## Out of Scope

- Phase 2: RoomHeader mobile simplification, MessageBubble mobile width, MessageInput safe-area, MessageList FAB, all 8 dialog full polish, SessionCard long-press
- Phase 3: swipe-to-open drawer, pull-to-refresh, visualViewport keyboard handling, long-press context menu, landscape optimization
- PWA features (service worker, offline caching, push notifications)
- Native app wrapper (Capacitor, Tauri)
- Packages outside `packages/web/` (core, server, CLI, channels)
- New npm dependencies (zero new deps)
- Virtual scrolling, message history pagination
- Dark/light theme changes beyond inherited CSS variables
- iOS/Android native features (haptics, gestures API, share sheet)

## Workload Estimate

**4 person-days** (Phase 1 only). Broken down:
- MobileDrawer + MobileNav + store fields: 1d
- App.tsx layout restructure + Sidebar adaptation: 1d
- CSS system, i18n, TerminalView, dialog guards: 1d
- Testing, manual verification, desktop regression: 1d

Within the ≤5d constitutional limit. Phase 2+3 to be separate PRDs.

## Architecture Constraints Referenced (Binding)

| # | Constraint | Source | Applies To |
|---|-----------|--------|------------|
| R1 | No changes to packages/core, packages/server, packages/cli | Design doc §1.2 | All implementation |
| R2 | Zero new npm dependencies | Design doc §13 | MobileDrawer, MobileNav, animations |
| R3 | Single DOM tree — no duplicate MessageList/MessageInput/TerminalView instances | Decision D1 | App.tsx layout |
| R4 | Mobile CSS delimited by comment blocks for merge clarity | Decision D29 | index.css, App.tsx, Sidebar.tsx |
| R5 | z-index hierarchy: Nav 40 < Drawer 45 < Modals 50 | Decision D17 | All z-index assignments |
| R6 | No useMediaQuery hook — CSS breakpoints for layout, single matchMedia for drawer only | Decision D7 | Layout switching |

## PRD Quality Constitution Compliance Table

| # | Rule | Status | Evidence / Location |
|---|------|:----:|----------|
| 1 | 章节完整 | ✅ | §Problem / §Solution / §User Stories (20) / §Implementation / §Testing / §Out of Scope |
| 2 | Risks & Mitigations ≥5 | ✅ | §Risks — 7 risks, each with likelihood/impact/mitigation |
| 3 | 定量成功标准 (EARS) | ✅ | §US AC use EARS: "Tap X -> Y happens in Z ms", "On <768px only", "Verified at 568px height" |
| 4 | 异常路径覆盖 4 类 | ✅ | §Exception Path Coverage — Empty (2), Error (2), Boundary (3), Permission Denied (N/A documented) |
| 5 | 接口签名明确 | ✅ | §Implementation Decisions — Module Breakdown: each module's interface, props, store fields specified; z-index hierarchy table; breakpoint contract |
| 6 | 内外一致性 | ✅ | US references match Implementation modules (MobileDrawer open/close matches US-001). OOS matches Phase scope. Decision log in design doc cross-referenced (D1-D31). |
| 7 | 工作量估算 ≤5d | ✅ | §Workload Estimate: 4d (within ≤5d). Phase 2/3 separated as future PRDs. |
| 8 | User Story 可验证 | ✅ | US-001 through US-020 each have independent ACs with quantitative/observable criteria |
| 9 | Out of Scope 不含未来期 | ✅ | §Out of Scope explicitly lists Phase 2 and Phase 3 items — no Phase N+1 content. Future phases called out as separate PRDs. |
| 10 | 技术选型有理由 | ✅ | §Architecture Principles table: 11 decisions, each with explicit choice + "Why" justification. Detailed module justifications in §Implementation Decisions. |
| 11 | 架构约束已引用 | ✅ | §Architecture Constraints Referenced: R1-R6, binding, with sources from design doc |

## Further Notes

- **Design reference:** Full 31-item decision log in `docs/mobile-adaptation.md` §14. All D1-D31 decisions respected.
- **Design reference:** Full component-level spec in `docs/superpowers/specs/2026-06-27-mobile-adaptation-design.md`.
- **Upstream sync:** merge conflicts isolated to `packages/web/` only. CSS wrapped in comment blocks. Extract mobile-specific code into separate components (MobileDrawer, MobileNav) to minimize diff.
- **Known UX debt:** left-edge swipe gesture deferred to Phase 3. Dual Sidebar instances accepted per D26. Landscape vertical space limited (220px content on 320px phone).
- **Bundle budget:** zero new dependencies. Estimated +5KB JS, +3KB CSS after Phase 1.
- **Accessibility baseline:** ARIA labels, focus trap, reduced-motion, tap targets >=44px per WCAG 2.5.5.
