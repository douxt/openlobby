import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import App from '../App';
import { useLobbyStore } from '../stores/lobby-store';

// ── Global Mocks ──

beforeAll(() => {
  // jsdom doesn't implement matchMedia or scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocketInit: vi.fn(),
  wsSendMessage: vi.fn(),
  wsRespondControl: vi.fn(),
  wsConfigureSession: vi.fn(),
  wsRecoverSession: vi.fn(),
  wsOpenPty: vi.fn(),
  wsPtyInput: vi.fn(),
  wsPtyResize: vi.fn(),
  wsRequestSessionHistory: vi.fn(),
  wsDiscoverSessions: vi.fn(),
  wsPinSession: vi.fn(),
  wsRenameSession: vi.fn(),
  // Dialog components
  wsAgentList: vi.fn(),
  wsAgentDelete: vi.fn(),
  wsAgentRecover: vi.fn(),
  wsAgentHardDelete: vi.fn(),
  wsListProviders: vi.fn(),
  wsListBindings: vi.fn(),
  wsListAccountBindings: vi.fn(),
  wsAddProvider: vi.fn(),
  wsRemoveProvider: vi.fn(),
  wsToggleProvider: vi.fn(),
  wsUnbind: vi.fn(),
  wsChannelBind: vi.fn(),
  wsBindAgentToAccount: vi.fn(),
  wsUnbindAgentFromAccount: vi.fn(),
  wsWecomQrStart: vi.fn(),
  wsWecomQrCancel: vi.fn(),
  wsSetAdapterDefault: vi.fn(),
  wsSetConfig: vi.fn(),
  wsImportSession: vi.fn(),
}));

vi.mock('../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({
    hasUpdate: false,
    latest: null,
    installMode: 'npm',
    recheckNow: vi.fn(),
  }),
}));

// ── Helpers ──

function resetStore() {
  useLobbyStore.setState({
    sessions: {},
    activeSessionId: null,
    connected: true,
    drawerOpen: false,
    showAgentsPanel: false,
    showChannelPanel: false,
    showSettingsDialog: false,
    showUpdateDialog: false,
    showDiscoverDialog: false,
    messagesBySession: {},
    pendingControlBySession: {},
    typingBySession: {},
    discoveredSessions: [],
    viewModeBySession: {},
    ptyReadyBySession: {},
    ptyOutputListeners: {},
    lmAvailable: false,
    lmSessionId: null,
    amAvailable: false,
    amSessionId: null,
    agents: [],
    deletedAgents: [],
    agentsPanelRequest: null,
    channelProviders: [],
    channelBindings: [],
    accountBindings: [],
    accountBindingConflict: null,
    commandsBySession: {},
    commandsLoadingBySession: {},
    toolAggregatorBySession: {},
    serverConfig: {},
    adapterPermissionMeta: {},
    adapterDefaults: [],
    wecomQrStatus: null,
    terminalFailDialog: null,
  });
}

beforeEach(resetStore);

// ── Tests ──

describe('AC1 — Desktop layout (>=768px)', () => {
  it('renders desktop sidebar wrapper with md:flex class', () => {
    render(<App />);
    const sidebarWrapper = document.querySelector('.md\\:flex');
    expect(sidebarWrapper).toBeInTheDocument();
  });

  it('renders Sidebar component inside desktop wrapper', () => {
    render(<App />);
    const aside = document.querySelector('aside');
    expect(aside).toBeInTheDocument();
  });
});

describe('AC2 — Mobile layout (<768px)', () => {
  it('renders hamburger button in mobile top bar', () => {
    render(<App />);
    const hamburger = document.querySelector('button[aria-label="Open navigation menu"]');
    expect(hamburger).toBeInTheDocument();
  });

  it('hamburger button has md:hidden parent', () => {
    render(<App />);
    const hamburger = screen.getByLabelText('Open navigation menu');
    const mobileTopBar = hamburger.closest('.md\\:hidden');
    expect(mobileTopBar).toBeInTheDocument();
  });
});

describe('AC3 — Hamburger toggles drawer', () => {
  it('clicking hamburger sets drawerOpen store to true', () => {
    render(<App />);
    const hamburger = screen.getByLabelText('Open navigation menu');
    fireEvent.click(hamburger);
    expect(useLobbyStore.getState().drawerOpen).toBe(true);
  });

  it('hamburger aria-expanded reflects drawer open state', () => {
    render(<App />);
    const hamburger = screen.getByLabelText('Open navigation menu');
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');
  });

  it('hamburger aria-controls points to mobile-drawer', () => {
    render(<App />);
    const hamburger = screen.getByLabelText('Open navigation menu');
    expect(hamburger).toHaveAttribute('aria-controls', 'mobile-drawer');
  });

  it('renders MobileDrawer dialog when drawer is open', () => {
    useLobbyStore.setState({ drawerOpen: true });
    render(<App />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });
});

describe('AC4 — Session click closes drawer + activates session', () => {
  it('selects session on click via Sidebar', () => {
    useLobbyStore.setState({
      sessions: {
        'sess-1': {
          id: 'sess-1',
          adapterName: 'claude-code',
          displayName: 'Test Session',
          status: 'idle',
          lastActiveAt: Date.now(),
          messageCount: 0,
          cwd: '/test',
          origin: 'user',
          resumeCommand: 'echo hi',
        },
      },
    });
    render(<App />);
    const sessionBtn = screen.getByText('Test Session');
    fireEvent.click(sessionBtn);
    expect(useLobbyStore.getState().activeSessionId).toBe('sess-1');
  });
});

describe('AC5 — matchMedia closes drawer on breakpoint', () => {
  it('registers matchMedia change listener on mount', () => {
    const addEventListenerSpy = vi.fn();
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(min-width: 768px)',
      onchange: null,
      addEventListener: addEventListenerSpy,
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);

    render(<App />);
    expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('matchMedia crossing to >=768px closes drawer', () => {
    let registeredHandler: (e: MediaQueryListEvent) => void = () => {};
    const mockMql = {
      matches: false,
      media: '(min-width: 768px)',
      onchange: null,
      addEventListener: vi.fn((_event: string, handler: EventListener) => {
        registeredHandler = handler as (e: MediaQueryListEvent) => void;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(mockMql as unknown as MediaQueryList);

    useLobbyStore.setState({ drawerOpen: true });
    render(<App />);
    expect(useLobbyStore.getState().drawerOpen).toBe(true);

    // MediaQueryListEvent not available in jsdom; call handler directly
    registeredHandler({ matches: true } as MediaQueryListEvent);

    expect(useLobbyStore.getState().drawerOpen).toBe(false);
  });
});

describe('AC6 — Mobile empty state', () => {
  it('shows mobile empty state text when no session and drawer closed', () => {
    useLobbyStore.setState({
      sessions: {},
      activeSessionId: null,
      drawerOpen: false,
    });
    render(<App />);
    expect(screen.getByText(/Tap the menu/i)).toBeInTheDocument();
  });
});

describe('AC7 — Dialogs rendered from App.tsx', () => {
  it('renders AgentsPanel when showAgentsPanel is true', () => {
    useLobbyStore.setState({ showAgentsPanel: true });
    render(<App />);
    // AgentsPanel heading is an h2 (distinct from MobileNav's button text)
    expect(screen.getByRole('heading', { name: 'Agents' })).toBeInTheDocument();
  });

  it('renders ChannelManagePanel when showChannelPanel is true', () => {
    useLobbyStore.setState({ showChannelPanel: true });
    render(<App />);
    expect(screen.getByRole('heading', { name: 'IM Channels' })).toBeInTheDocument();
  });

  it('renders GlobalSettingsDialog when showSettingsDialog is true', () => {
    useLobbyStore.setState({ showSettingsDialog: true });
    render(<App />);
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  it('renders DiscoverDialog when showDiscoverDialog is true', () => {
    useLobbyStore.setState({
      showDiscoverDialog: true,
      discoveredSessions: [{
        id: 's-1', adapterName: 'cc', displayName: 'Disc',
        status: 'idle', lastActiveAt: 0, messageCount: 0,
        cwd: '/', origin: 'user', resumeCommand: '',
      }],
    });
    render(<App />);
    expect(screen.getByText('Discover CLI Sessions')).toBeInTheDocument();
  });

  it('does not render dialogs when all flags are false', () => {
    render(<App />);
    // Dialog headings are h2 elements — verify they don't exist
    expect(screen.queryByRole('heading', { name: 'Agents' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'IM Channels' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  });
});

describe('AC10 — h-dvh double value', () => {
  it('root div has both h-screen and h-dvh classes', () => {
    render(<App />);
    const rootDiv = document.querySelector('.h-screen');
    expect(rootDiv).toHaveClass('h-dvh');
  });
});
