import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from '../App';
import { useLobbyStore } from '../stores/lobby-store';

const wsMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useWebSocket', () => ({
  useWebSocketInit: wsMock,
  wsSendMessage: wsMock,
  wsRespondControl: wsMock,
  wsConfigureSession: wsMock,
  wsRecoverSession: wsMock,
  wsAgentList: wsMock,
  wsAgentDelete: wsMock,
  wsAgentRecover: wsMock,
  wsAgentHardDelete: wsMock,
  wsListProviders: wsMock,
  wsListBindings: wsMock,
  wsListAccountBindings: wsMock,
  wsAddProvider: wsMock,
  wsRemoveProvider: wsMock,
  wsToggleProvider: wsMock,
  wsChannelBind: wsMock,
  wsUnbind: wsMock,
  wsBindAgentToAccount: wsMock,
  wsUnbindAgentFromAccount: wsMock,
  wsWecomQrStart: wsMock,
  wsWecomQrCancel: wsMock,
  wsSetConfig: wsMock,
  wsSetAdapterDefault: wsMock,
  wsRequestSessionHistory: wsMock,
  wsDiscoverSessions: wsMock,
  wsPinSession: wsMock,
  wsRenameSession: wsMock,
}));

vi.mock('../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({
    current: '0.6.3',
    latest: null,
    hasUpdate: false,
    installMode: 'npx' as const,
    checking: false,
  }),
}));

vi.mock('../hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'app.emptyStateTitle': 'Select a session or create a new one',
        'app.emptyStateHint': 'Click "+ Import" in the sidebar to get started',
        'app.emptyStateMobile': 'Tap the menu or Sessions tab to choose a conversation',
        'app.sessionErrored': 'Session errored.',
        'app.sessionStopped': 'Session stopped.',
        'app.recoverToIdle': 'Recover to Idle',
        'app.sessionEndedHint': 'Session has ended.',
        'agents.title': 'Agents',
        'channelManage.title': 'IM Channels',
        'globalSettings.title': 'Settings',
      };
      return map[key] ?? key;
    },
    locale: 'en' as const,
    setLocale: vi.fn(),
  }),
}));

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark' as const,
    resolvedTheme: 'dark' as const,
    setTheme: vi.fn(),
  }),
}));

type MatchMediaHandler = (e: MediaQueryListEvent) => void;

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<MatchMediaHandler>();
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: (_type: string, handler: MatchMediaHandler) => {
      listeners.add(handler);
    },
    removeEventListener: (_type: string, handler: MatchMediaHandler) => {
      listeners.delete(handler);
    },
    _simulate(matches: boolean) {
      const event = { matches, media: query } as MediaQueryListEvent;
      listeners.forEach((h) => h(event));
    },
  }));
}

beforeEach(() => {
  useLobbyStore.setState({
    sessions: {},
    activeSessionId: null,
    drawerOpen: false,
    showAgentsPanel: false,
    showChannelPanel: false,
    showSettingsDialog: false,
    showUpdateDialog: false,
    showDiscoverDialog: false,
    connected: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App layout integration', () => {
  it('AC1: renders app root without crashing', () => {
    window.matchMedia = stubMatchMedia(false);
    render(<App />);
    expect(document.querySelector('.h-screen')).toBeInTheDocument();
  });

  it('AC5: matchMedia auto-closes drawer on breakpoint up', () => {
    let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, handler: (e: MediaQueryListEvent) => void) => {
        if (_type === 'change') changeHandler = handler;
      },
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    useLobbyStore.setState({ drawerOpen: true });
    render(<App />);
    expect(useLobbyStore.getState().drawerOpen).toBe(true);

    act(() => {
      changeHandler!({ matches: true } as MediaQueryListEvent);
    });

    expect(useLobbyStore.getState().drawerOpen).toBe(false);
  });

  it('AC6: shows mobile empty state text when no session', () => {
    window.matchMedia = stubMatchMedia(false);
    render(<App />);
    expect(
      screen.getByText('Tap the menu or Sessions tab to choose a conversation'),
    ).toBeInTheDocument();
  });

  it('AC6: shows desktop empty state hint', () => {
    window.matchMedia = stubMatchMedia(true);
    render(<App />);
    expect(
      screen.getByText('Click "+ Import" in the sidebar to get started'),
    ).toBeInTheDocument();
  });

  it('AC7: renders AgentsPanel from App level', () => {
    window.matchMedia = stubMatchMedia(false);
    useLobbyStore.setState({ showAgentsPanel: true });
    render(<App />);
    expect(screen.getByText('Agents')).toBeInTheDocument();
  });

  it('AC7: renders ChannelManagePanel from App level', () => {
    window.matchMedia = stubMatchMedia(false);
    useLobbyStore.setState({ showChannelPanel: true });
    render(<App />);
    expect(screen.getByText('IM Channels')).toBeInTheDocument();
  });

  it('AC7: renders GlobalSettingsDialog from App level', () => {
    window.matchMedia = stubMatchMedia(false);
    useLobbyStore.setState({ showSettingsDialog: true });
    render(<App />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('AC10: root div has h-dvh class', () => {
    window.matchMedia = stubMatchMedia(false);
    render(<App />);
    expect(document.querySelector('.h-dvh')).toBeInTheDocument();
  });
});
