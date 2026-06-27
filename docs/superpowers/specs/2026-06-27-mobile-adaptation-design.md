## Problem Statement

OpenLobby Web UI is desktop-only. On mobile phones (320–428px viewport), the fixed 280px sidebar consumes the entire screen, leaving no usable space for the Room (chat area). There is no responsive layout, no touch-optimized controls, and no mobile navigation pattern. Users cannot manage AI coding agent sessions from their phones through the web interface.

## Solution

Refactor the web frontend layout to be responsive using a mobile-first CSS approach. On mobile, the persistent Sidebar becomes a slide-out Drawer accessible via hamburger button and bottom tab navigation. The Room (MessageList, MessageInput, TerminalView) renders in a single content tree shared across breakpoints. Desktop experience is preserved with zero regression.

Phase 1 delivers the core layout skeleton: Drawer, bottom tab bar, responsive App layout, and store integration. Phase 2 (component touch adaptations) and Phase 3 (gestures & polish) are out of scope for this PRD.

## User Stories

1. As a mobile user, I want to see the session list in a slide-out drawer, so that I can browse and select sessions without the sidebar consuming my entire screen.
2. As a mobile user, I want a bottom tab bar (Sessions, Agents, Channels), so that I can navigate between core functions with one thumb tap.
3. As a mobile user, I want a hamburger button always visible at the top, so that I can open the session drawer even when no session is active.
4. As a mobile user, I want tapping a session in the drawer to close the drawer and open the session, so that I can start chatting immediately without extra steps.
5. As a mobile user, I want tapping the backdrop to close the drawer, so that I can dismiss it intuitively.
6. As a mobile user, I want the app to fill the visible viewport (not the address-bar-inclusive height), so that I don't see a scrollbar on the root layout.
7. As a mobile user with a notched phone (iPhone 14 Pro+), I want bottom content to not be hidden behind the home indicator bar, so that the MessageInput and bottom nav are fully visible.
8. As a desktop user, I want the existing persistent sidebar on the left to work exactly as before, so that my workflow is not disrupted.
9. As a user resizing between mobile and desktop viewports (e.g., iPad rotation), I want the session content (messages, scroll position) to be preserved, so that I don't lose context during a breakpoint change.
10. As a mobile user with no active session, I want a clear hint telling me to open the Sessions tab, so that I understand how to start using the app.
11. As a keyboard user, I want pressing Escape to close the drawer, so that I can dismiss it without touching the backdrop.
12. As a screen reader user, I want the hamburger button and drawer to have proper ARIA labels and roles, so that I can navigate the mobile UI.
13. As a mobile user, I want the drawer not to close when I tap on the sidebar content inside it, so that I can interact with session cards and buttons normally.
14. As a user with reduced-motion preferences, I want drawer animations to be disabled, so that the UI respects my OS accessibility settings.
15. As a mobile user, I want to see which sessions are pinned at a glance in the session list, so that I can quickly access my important sessions.
16. As a developer, I want the drawer content to have an error boundary, so that a Sidebar crash displays a fallback UI (e.g., "Something went wrong loading the sidebar. Tap to retry.") instead of taking down the entire application.
17. As a mobile user in landscape orientation, I want the layout to not break (basic flex stacking works), so that I can still read messages. Full landscape optimization is deferred to Phase 3.
18. As a user with an older browser (Chrome older than 108, Safari older than 15.4), I want the app layout to still have a height fallback, so that I don't see a blank page.
19. As a mobile user, I want the Agents and Channels dialogs to be scrollable on short screens, so that I can reach all content and buttons on iPhone SE.
20. As a mobile user viewing a Terminal session, I want a "Copy last command" button, so that I can interact with the terminal even without a physical keyboard.

## Implementation Decisions

### Architecture

**Single content tree with CSS breakpoint switching.** The root layout uses responsive flex direction. On mobile, elements stack vertically (top bar → content → bottom nav). On desktop, elements lay out horizontally (sidebar | content). Only the Sidebar wrapper switches between persistent and drawer modes; the Room content (MessageList, MessageInput, TerminalView) renders exactly once, preserving WebSocket state and scroll position across breakpoint changes.

**Hamburger lives outside RoomHeader.** RoomHeader returns nothing when no session is active. The hamburger button must always be visible on mobile, so it lives in a dedicated mobile top bar at the App level, independent of RoomHeader.

### New Modules

**MobileDrawer** (deep module). A React component that encapsulates all drawer behavior behind a simple interface. Props: open, onClose, children. Uses fixed positioning to escape the flex flow layout. Backdrop fades in/out via CSS opacity transition. Panel slides from left via CSS transform, with click-stop-propagation to prevent backdrop-close on panel content. Closes on Escape key. Locks body scroll when open. Implements focus trap: moves focus into drawer on open, returns to hamburger on close. Children wrapped in React ErrorBoundary. Shell always mounted for smooth transitions; children mount only when open. Respects prefers-reduced-motion. Full ARIA: role=dialog, aria-modal, aria-label. Wrapped in React.memo to prevent unnecessary re-renders of the always-mounted shell. The onClose callback should be stabilized with useCallback in the parent.

**MobileNav** (shallow module). Bottom tab bar with 3 tabs: Sessions (opens drawer), Agents (opens AgentsPanel dialog), Channels (opens ChannelManagePanel dialog). Fixed to viewport bottom. Active tab derived from whether corresponding drawer/dialog is open. Badge count on Agents tab. Accounts for safe-area-inset-bottom. Height defined as CSS variable.

### Modified Modules

**App layout.** Root uses dvh with vh fallback. Mobile top bar with hamburger SVG icon and ARIA attributes. Main content area padding accounts for MobileNav height plus safe-area. MatchMedia listener auto-closes drawer on breakpoint crossing to desktop. Dialog JSX moved from Sidebar to App level. Mobile-specific empty state.

**Sidebar.** Width responsive (full on mobile, 280px on desktop). Accepts onSessionSelect callback prop. Dialog states migrated from local useState to Zustand store. Dialog JSX moved to App. DiscoverDialog JSX also relocated from Sidebar to App for consistency, though its trigger remains only in the Sidebar toolbar. SessionCard replaces JS hover state with CSS group-hover; hidden controls use invisible+zero-width to avoid consuming layout space; pinned items always show pin indicator.

**lobby-store.** New fields: drawerOpen, showAgentsPanel, showChannelPanel, showSettingsDialog, showUpdateDialog with corresponding setter actions. Follows existing Zustand pattern.

**CSS system.** New utilities: safe-area padding, touch target sizing, drawer animations with consolidated theme-color transitions, CSS variable for mobile nav height. Reduced-motion media query disables transitions. All mobile CSS wrapped in comment block for merge clarity. dvh uses CSS cascade fallback pattern.

**i18n.** Three new flat dot-notation keys: nav.sessions, nav.agents, nav.channels (en + zh-CN). Corresponding type additions required in the Messages interface in types.ts.

**TerminalView.** Adds "Copy last command" button for mobile users without physical keyboard.

**Dialog mobile guards.** Three dialogs in Phase 1 (AgentsPanel, ChannelManagePanel, GlobalSettingsDialog) receive minimal mobile sizing to prevent overflow on short viewports.

### z-index Hierarchy

MobileNav z-40, Drawer z-45, all modals and dialog overlays z-50.

### Breakpoint Strategy

All layout switching uses Tailwind responsive prefixes. No useMediaQuery hook. Single matchMedia listener in App for drawer auto-close on breakpoint crossing.

## Testing Decisions

**What makes a good test.** Tests verify external behavior, not implementation details. Components: test rendered output and interactions. Store: test state transitions.

**Unit tested modules:**
1. MobileDrawer — open/close, backdrop click, Escape key, stopPropagation, scroll lock, ARIA, reduced-motion
2. lobby-store additions — setters toggle boolean fields, defaults are false
3. MobileNav — renders 3 tabs, correct store setter on tap, active tab derivation, desktop hidden

**Visually verified modules:**
- App layout: responsive across 5 breakpoints plus landscape, resize behavior
- Sidebar: desktop unchanged, mobile drawer scroll, session-select closes drawer
- CSS: safe-area on notched phones, dvh fallback, touch targets, animation smoothness
- Dialogs: scrollable on iPhone SE, no overflow
- i18n: keys display in both locales

**Test framework.** vitest, following existing project patterns. Each implementation step independently verified via pnpm build and pnpm test before proceeding to the next step. The design document provides a detailed 9-scenario manual testing checklist (viewport sizes + orientation + resize) and 8 touch-interaction scenarios for traceability.

## Out of Scope

- Phase 2: RoomHeader mobile simplification, MessageBubble width, MessageInput safe-area, MessageList FAB, full dialog polish, SessionCard long-press menu
- Phase 3: swipe-to-open drawer, pull-to-refresh, keyboard handling, long-press context menu, landscape optimization
- PWA features (service worker, offline caching, push notifications)
- Native app wrappers (Capacitor, Tauri)
- Backend changes (core, server, CLI packages)
- New npm dependencies (zero added)
- Virtual scrolling for large message history

## Further Notes

- **Upstream sync.** All changes isolated to web package only. No core/server/cli changes. Merge conflict risk low. CSS wrapped in comment blocks.
- **Known UX debt.** Left-edge swipe gesture in Phase 3. Landscape vertical space limited. Both accepted for scope control.
- **Known tradeoff: dual Sidebar instances.** Desktop persistent sidebar and mobile drawer each mount a Sidebar instance, causing duplicate subscriptions and potential local-state divergence during breakpoint crossing. Accepted for Phase 1; mitigation via matchMedia auto-close and showUpdateDialog store migration.
- **showUpdateDialog mobile guard.** The store field for showUpdateDialog is added in Phase 1, but the UpdateDialog mobile scroll guard (max-h-80dvh, overflow-y-auto) is deferred to Phase 2.
- **Tailwind.** Project uses Tailwind 3.4+ which has dvh built-in. No config changes needed.
- **Design document.** Full technical specification at docs/mobile-adaptation.md (671 lines, 31-item decision log).
- **Branch.** feat/mobile-adaptation on fork douxt/openlobby.
- **Bundle budget.** No new dependencies. Estimated +5KB JS, +3KB CSS after Phase 1.
