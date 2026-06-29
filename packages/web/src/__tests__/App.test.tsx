import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useLobbyStore } from '../stores/lobby-store';
import App from '../App';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocketInit: vi.fn(),
  wsSendMessage: vi.fn(),
  wsRespondControl: vi.fn(),
  wsConfigureSession: vi.fn(),
  wsRecoverSession: vi.fn(),
  wsDiscoverSessions: vi.fn(),
  wsRequestSessionHistory: vi.fn(),
  wsPinSession: vi.fn(),
  wsRenameSession: vi.fn(),
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
  wsSetAdapterDefault: vi.fn(),
  wsSetConfig: vi.fn(),
  wsOpenPty: vi.fn(),
  wsPtyInput: vi.fn(),
  wsPtyResize: vi.fn(),
}));

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

vi.mock('../hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'en',
    setLocale: vi.fn(),
  }),
}));

vi.mock('../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({ hasUpdate: false, latest: undefined, installMode: 'prompt' as const }),
}));

vi.mock('../contexts/I18nContext', () => ({
  I18nContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
  useI18nContext: () => ({ locale: 'en', setLocale: vi.fn(), t: (k: string) => k }),
}));

vi.mock('../contexts/ThemeContext', () => ({
  ThemeContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useThemeContext: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));

// Mock matchMedia
let mqlChangeHandlers: Array<(e: MediaQueryListEvent) => void> = [];

beforeEach(() => {
  mqlChangeHandlers = [];
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: (_type: string, handler: (e: MediaQueryListEvent) => void) => {
      mqlChangeHandlers.push(handler);
    },
    removeEventListener: (_type: string, handler: (e: MediaQueryListEvent) => void) => {
      mqlChangeHandlers = mqlChangeHandlers.filter(h => h !== handler);
    },
  }));

  useLobbyStore.setState({
    sessions: {},
    activeSessionId: undefined,
    connected: true,
    agents: [],
    deletedAgents: [],
    channelProviders: [],
    channelBindings: [],
    accountBindings: [],
    drawerOpen: false,
    showAgentsPanel: false,
    showChannelPanel: false,
    showSettingsDialog: false,
    showDiscoverDialog: false,
    showUpdateDialog: false,
    lmAvailable: false,
    lmSessionId: undefined,
    amAvailable: false,
    amSessionId: undefined,
    agentsPanelRequest: undefined,
    serverConfig: {},
    adapterDefaults: [],
    adapterPermissionMeta: {},
    accountBindingConflict: null,
    viewModeBySession: {},
    wecomQrStatus: null,
    ptyReadyBySession: {},
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── AC10: h-dvh double-value fallback ──────────────────────────────────────

describe('AC10: h-dvh fallback', () => {
  it('root div has h-dvh-fallback class', () => {
    render(<App />);
    expect(screen.getByTestId('app-root').className).toContain('h-dvh-fallback');
  });
});

// ─── AC1: Desktop sidebar 280px, no MobileNav/hamburger ─────────────────────

describe('AC1: Desktop sidebar', () => {
  it('desktop sidebar has md:w-[280px] and hidden md:flex', () => {
    render(<App />);
    const sidebar = screen.getByTestId('desktop-sidebar');
    expect(sidebar.className).toContain('md:w-[280px]');
    expect(sidebar.className).toContain('hidden');
    expect(sidebar.className).toContain('md:flex');
  });
});

// ─── AC2: Mobile hamburger visible, MobileNav visible ───────────────────────

describe('AC2: Mobile elements', () => {
  it('hamburger button is present', () => {
    render(<App />);
    expect(screen.getByTestId('hamburger-btn')).toBeInTheDocument();
  });

  it('mobile top bar has md:hidden', () => {
    render(<App />);
    expect(screen.getByTestId('mobile-topbar').className).toContain('md:hidden');
  });

  it('MobileNav is rendered', () => {
    render(<App />);
    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
  });
});

// ─── AC3: Hamburger → drawer ───────────────────────────────────────────────

describe('AC3: Hamburger opens drawer', () => {
  it('hamburger click sets drawerOpen in store', () => {
    const setterSpy = vi.fn();
    useLobbyStore.setState({ setDrawerOpen: setterSpy });
    render(<App />);
    fireEvent.click(screen.getByTestId('hamburger-btn'));
    expect(setterSpy).toHaveBeenCalledWith(true);
  });

  it('drawer has visible backdrop when open', () => {
    useLobbyStore.setState({ drawerOpen: true });
    render(<App />);
    const backdrop = screen.getByTestId('drawer-backdrop');
    expect(backdrop.className).toContain('opacity-100');
  });
});

// ─── AC5: matchMedia auto-close drawer ─────────────────────────────────────

describe('AC5: matchMedia auto-close', () => {
  it('calls setDrawerOpen(false) when crossing >=768px', () => {
    const setterSpy = vi.fn();
    useLobbyStore.setState({ drawerOpen: true, setDrawerOpen: setterSpy });
    render(<App />);

    act(() => {
      mqlChangeHandlers.forEach(fn =>
        fn({ matches: true } as MediaQueryListEvent),
      );
    });

    expect(setterSpy).toHaveBeenCalledWith(false);
  });
});

// ─── AC6: Mobile empty state ────────────────────────────────────────────────

describe('AC6: Mobile empty state', () => {
  it('shows empty state when no active session', () => {
    render(<App />);
    expect(screen.getByTestId('mobile-empty-state')).toBeInTheDocument();
  });
});

// ─── AC11: App renders without crashing ────────────────────────────────────

describe('AC11: App renders', () => {
  it('renders root without errors', () => {
    const { container } = render(<App />);
    expect(container.querySelector('[data-testid="app-root"]')).toBeInTheDocument();
  });
});
