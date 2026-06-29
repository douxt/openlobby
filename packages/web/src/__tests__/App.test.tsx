import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { useLobbyStore } from '../stores/lobby-store';

// Mock all WebSocket hooks to prevent actual connections
vi.mock('../hooks/useWebSocket', () => ({
  useWebSocketInit: vi.fn(),
  wsSendMessage: vi.fn(),
  wsRespondControl: vi.fn(),
  wsConfigureSession: vi.fn(),
  wsRecoverSession: vi.fn(),
  wsListProviders: vi.fn(),
  wsAddProvider: vi.fn(),
  wsRemoveProvider: vi.fn(),
  wsToggleProvider: vi.fn(),
  wsListBindings: vi.fn(),
  wsListAccountBindings: vi.fn(),
  wsUnbind: vi.fn(),
  wsChannelBind: vi.fn(),
  wsBindAgentToAccount: vi.fn(),
  wsUnbindAgentFromAccount: vi.fn(),
  wsWecomQrStart: vi.fn(),
  wsWecomQrCancel: vi.fn(),
  wsAgentList: vi.fn(),
  wsAgentDelete: vi.fn(),
  wsAgentRecover: vi.fn(),
  wsAgentHardDelete: vi.fn(),
  wsDiscoverSessions: vi.fn(),
  wsRequestSessionHistory: vi.fn(),
  wsPinSession: vi.fn(),
  wsRenameSession: vi.fn(),
  wsOpenPty: vi.fn(),
  wsPtyInput: vi.fn(),
  wsPtyResize: vi.fn(),
  wsDestroySession: vi.fn(),
  wsOpenTerminal: vi.fn(),
  wsChannelUnbind: vi.fn(),
  wsSetAdapterDefault: vi.fn(),
  wsSetConfig: vi.fn(),
}));

vi.mock('../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({ hasUpdate: false }),
}));

let matchMediaListeners: Array<() => void> = [];

beforeEach(() => {
  matchMediaListeners = [];
  useLobbyStore.setState({
    drawerOpen: false,
    activeSessionId: undefined,
    sessions: {},
    connected: false,
    viewModeBySession: {},
    showDiscoverDialog: false,
    showChannelPanel: false,
    showAgentsPanel: false,
    showSettingsDialog: false,
    showUpdateDialog: false,
    agentsPanelRequest: null,
    agents: [],
    channelProviders: [],
    channelBindings: [],
    accountBindings: [],
    adapterDefaults: [],
    adapterPermissionMeta: {},
    serverConfig: { defaultAdapter: 'claude-code', defaultMessageMode: 'msg-tidy', defaultViewMode: 'im' },
  });

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: (_event: string, handler: () => void) => {
      matchMediaListeners.push(handler);
    },
    removeEventListener: vi.fn(),
  }));
});

function getRoot() {
  return document.querySelector('.h-screen');
}

function getDesktopSidebar() {
  return document.querySelector('.hidden.md\\:flex');
}

// ── AC10: h-dvh fallback ──

describe('AC10: h-dvh double-value fallback', () => {
  it('root layout uses h-screen h-dvh', () => {
    render(<App />);
    const root = getRoot();
    expect(root).toBeInTheDocument();
    expect(root!.className).toContain('h-dvh');
  });
});

// ── AC1–2: Responsive sidebar ──

describe('AC1: Desktop sidebar 280px', () => {
  it('renders sidebar in hidden md:flex container', () => {
    render(<App />);
    const container = getDesktopSidebar();
    expect(container).toBeInTheDocument();
    expect(container!.className).toContain('md:w-72');
  });
});

describe('AC2: Mobile hamburger and top bar', () => {
  it('renders mobile top bar with hamburger button', () => {
    render(<App />);
    const topBars = document.querySelectorAll('.md\\:hidden');
    const mobileTopBar = Array.from(topBars).find(
      (el) => el.textContent?.includes('OpenLobby'),
    );
    expect(mobileTopBar).toBeTruthy();
    const hamburger = mobileTopBar!.querySelector('button');
    expect(hamburger).toBeInTheDocument();
  });
});

// ── AC5: matchMedia auto-close ──

describe('AC5: matchMedia auto-close drawer on >=768px', () => {
  it('closes drawer when initial matchMedia matches', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    useLobbyStore.setState({ drawerOpen: true });
    render(<App />);
    // Effect checks mql.matches on mount → closes drawer
    expect(useLobbyStore.getState().drawerOpen).toBe(false);
  });

  it('closes drawer on resize from <768 to >=768', () => {
    render(<App />);
    useLobbyStore.setState({ drawerOpen: true });

    // Simulate matchMedia firing change event with matches=true
    matchMediaListeners.forEach((fn) => fn({ matches: true }));
    expect(useLobbyStore.getState().drawerOpen).toBe(false);
  });
});

// ── AC6: Mobile empty state ──

describe('AC6: Mobile empty state', () => {
  it('shows empty state on both desktop and mobile when no session', () => {
    render(<App />);
    // Both desktop (hidden md:flex) and mobile (md:hidden) variants render
    const els = screen.getAllByText(/Select a session or create a new one/i);
    expect(els.length).toBe(2);
  });
});

// ── AC7: 5 dialogs from App ──

describe('AC7: Dialogs rendered from App.tsx', () => {
  it('renders DiscoverDialog when showDiscoverDialog is true', () => {
    useLobbyStore.setState({ showDiscoverDialog: true });
    render(<App />);
    expect(screen.getByText('Import')).toBeInTheDocument();
  });

  it('renders ChannelManagePanel when showChannelPanel is true', () => {
    useLobbyStore.setState({ showChannelPanel: true });
    render(<App />);
    expect(screen.getByText(/IM Channels/i)).toBeInTheDocument();
  });

  it('renders AgentsPanel when showAgentsPanel is true', () => {
    useLobbyStore.setState({ showAgentsPanel: true });
    render(<App />);
    expect(screen.getByRole('heading', { name: /Agents/i })).toBeInTheDocument();
  });

  it('renders GlobalSettingsDialog when showSettingsDialog is true', () => {
    useLobbyStore.setState({ showSettingsDialog: true });
    render(<App />);
    expect(screen.getByText(/Settings/i)).toBeInTheDocument();
  });

  it('renders MobileNav', () => {
    render(<App />);
    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
  });
});
