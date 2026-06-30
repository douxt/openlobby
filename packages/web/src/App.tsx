import { useCallback, useEffect } from 'react';
import { useWebSocketInit, wsSendMessage, wsRespondControl, wsConfigureSession, wsRecoverSession } from './hooks/useWebSocket';
import { useLobbyStore } from './stores/lobby-store';
import { useTheme } from './hooks/useTheme';
import { ThemeContext } from './contexts/ThemeContext';
import { I18nContext, useI18nContext } from './contexts/I18nContext';
import { useI18n } from './hooks/useI18n';
import { useVersionCheck } from './hooks/useVersionCheck';
import Sidebar from './components/Sidebar';
import RoomHeader from './components/RoomHeader';
import MessageList from './components/MessageList';
import MessageInput from './components/MessageInput';
import TerminalView from './components/TerminalView';
import { MobileDrawer } from './components/MobileDrawer';
import DiscoverDialog from './components/DiscoverDialog';
import ChannelManagePanel from './components/ChannelManagePanel';
import AgentsPanel from './components/AgentsPanel';
import GlobalSettingsDialog from './components/GlobalSettingsDialog';
import { UpdateDialog } from './components/UpdateDialog';

const DEV_BACKEND_HOST =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? '127.0.0.1'
    : window.location.hostname;

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  (import.meta.env.DEV
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${DEV_BACKEND_HOST}:3001/ws`
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`);

export default function App() {
  useWebSocketInit(WS_URL);
  const themeValue = useTheme();
  const i18nValue = useI18n();

  const activeSessionId = useLobbyStore((s) => s.activeSessionId);
  const connected = useLobbyStore((s) => s.connected);
  const activeSession = useLobbyStore((s) =>
    s.activeSessionId ? s.sessions[s.activeSessionId] : undefined,
  );
  const isSessionAlive =
    activeSession != null &&
    activeSession.status !== 'stopped' &&
    activeSession.status !== 'error';

  const viewMode = useLobbyStore((s) =>
    s.activeSessionId ? (s.viewModeBySession[s.activeSessionId] ?? 'im') : 'im',
  );

  const drawerOpen = useLobbyStore((s) => s.drawerOpen);
  const setDrawerOpen = useLobbyStore((s) => s.setDrawerOpen);
  const showDiscoverDialog = useLobbyStore((s) => s.showDiscoverDialog);
  const showChannelPanel = useLobbyStore((s) => s.showChannelPanel);
  const showAgentsPanel = useLobbyStore((s) => s.showAgentsPanel);
  const showSettingsDialog = useLobbyStore((s) => s.showSettingsDialog);
  const showUpdateDialog = useLobbyStore((s) => s.showUpdateDialog);
  const setShowDiscoverDialog = useLobbyStore((s) => s.setShowDiscoverDialog);
  const setShowChannelPanel = useLobbyStore((s) => s.setShowChannelPanel);
  const setShowAgentsPanel = useLobbyStore((s) => s.setShowAgentsPanel);
  const setShowSettingsDialog = useLobbyStore((s) => s.setShowSettingsDialog);
  const setShowUpdateDialog = useLobbyStore((s) => s.setShowUpdateDialog);
  const versionInfo = useVersionCheck();

  const handleChoiceSelect = useCallback(
    (label: string) => {
      if (!activeSessionId) return;
      if (label === 'Execute Plan') {
        wsConfigureSession(activeSessionId, { permissionMode: 'supervised' });
        wsSendMessage(activeSessionId, 'Please execute the plan above.');
      } else {
        wsSendMessage(activeSessionId, label);
      }
    },
    [activeSessionId],
  );

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, [setDrawerOpen]);

  // AC5: matchMedia auto-close drawer at >=768px
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setDrawerOpen(false);
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [setDrawerOpen]);

  return (
    <ThemeContext.Provider value={themeValue}>
      <I18nContext.Provider value={i18nValue}>
        <div data-testid="app-root" className="h-dvh-fallback flex flex-col md:flex-row bg-surface text-on-surface">
          {/* AC1: Desktop sidebar — hidden on mobile */}
          <div data-testid="desktop-sidebar" className="hidden md:flex md:w-[280px]">
            <Sidebar onSessionSelect={handleCloseDrawer} />
          </div>

          {/* AC3: Mobile drawer */}
          <MobileDrawer open={drawerOpen} onClose={handleCloseDrawer}>
            <Sidebar onSessionSelect={handleCloseDrawer} />
          </MobileDrawer>

          <main className="flex-1 flex flex-col min-w-0 pb-mobile-nav md:pb-0">
            {/* AC2: Mobile top bar with hamburger */}
            <div data-testid="mobile-topbar" className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-outline bg-surface-secondary">
              <button
                data-testid="hamburger-btn"
                onClick={() => setDrawerOpen(true)}
                className="tap-target flex items-center justify-center text-on-surface-secondary hover:text-on-surface"
                aria-label="Open menu"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <h1 className="text-lg font-bold text-on-surface">OpenLobby</h1>
            </div>

            <RoomHeader />

            {activeSessionId ? (
              <>
                {viewMode === 'terminal' ? (
                  <TerminalView sessionId={activeSessionId} />
                ) : (
                  <>
                    <MessageList
                      sessionId={activeSessionId}
                      onControlRespond={wsRespondControl}
                      onChoiceSelect={handleChoiceSelect}
                    />
                    {!isSessionAlive && activeSession && (activeSession.status === 'stopped' || activeSession.status === 'error') && (
                      <SessionStatusBanner
                        sessionId={activeSessionId}
                        isErrored={activeSession.status === 'error'}
                      />
                    )}
                    <MessageInput
                      onSend={(content) => wsSendMessage(activeSessionId, content)}
                      disabled={!connected || !isSessionAlive}
                      placeholder={
                        isSessionAlive
                          ? undefined
                          : i18nValue.t('app.sessionEndedHint')
                      }
                    />
                  </>
                )}
              </>
            ) : (
              <div data-testid="mobile-empty-state" className="flex-1 flex items-center justify-center">
                <div className="text-center text-on-surface-muted px-6">
                  <p className="text-lg mb-2">{i18nValue.t('app.emptyStateTitle')}</p>
                  <p className="text-sm mb-4">{i18nValue.t('app.emptyStateHint')}</p>
                  <p className="text-xs text-on-surface-muted/70 md:hidden">
                    {i18nValue.t('app.mobileEmptyHint')}
                  </p>
                </div>
              </div>
            )}
          </main>

          {/* AC7: 5 dialogs lifted from Sidebar to App.tsx */}
          {showDiscoverDialog && (
            <div data-testid="discover-dialog">
              <DiscoverDialog onClose={() => setShowDiscoverDialog(false)} />
            </div>
          )}
          {showChannelPanel && (
            <div data-testid="channel-manage-panel">
              <ChannelManagePanel onClose={() => setShowChannelPanel(false)} />
            </div>
          )}
          {showAgentsPanel && (
            <div data-testid="agents-panel">
              <AgentsPanel onClose={() => setShowAgentsPanel(false)} />
            </div>
          )}
          {showSettingsDialog && (
            <div data-testid="settings-dialog">
              <GlobalSettingsDialog onClose={() => setShowSettingsDialog(false)} />
            </div>
          )}
          {showUpdateDialog && versionInfo.latest && (
            <div data-testid="update-dialog">
              <UpdateDialog
                latestVersion={versionInfo.latest}
                installMode={versionInfo.installMode}
                onClose={() => setShowUpdateDialog(false)}
              />
            </div>
          )}
        </div>
      </I18nContext.Provider>
    </ThemeContext.Provider>
  );
}

function SessionStatusBanner({ sessionId, isErrored }: { sessionId: string; isErrored: boolean }) {
  const { t } = useI18nContext();

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-2 bg-surface-secondary border-t border-outline">
      <span className="text-xs text-on-surface-muted">
        {isErrored ? t('app.sessionErrored') : t('app.sessionStopped')}
      </span>
      <button
        onClick={() => wsRecoverSession(sessionId)}
        className="text-xs px-3 py-1 rounded bg-primary hover:bg-primary-hover text-primary-on transition-colors"
      >
        {t('app.recoverToIdle')}
      </button>
    </div>
  );
}
