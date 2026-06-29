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
import { MobileNav } from './components/MobileNav';
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

  // Mobile drawer state
  const drawerOpen = useLobbyStore((s) => s.drawerOpen);
  const setDrawerOpen = useLobbyStore((s) => s.setDrawerOpen);

  // Dialog state (lifted from Sidebar)
  const showDiscoverDialog = useLobbyStore((s) => s.showDiscoverDialog);
  const showChannelPanel = useLobbyStore((s) => s.showChannelPanel);
  const showAgentsPanel = useLobbyStore((s) => s.showAgentsPanel);
  const showSettingsDialog = useLobbyStore((s) => s.showSettingsDialog);
  const showUpdateDialog = useLobbyStore((s) => s.showUpdateDialog);
  const setShowDiscoverDialog = useLobbyStore((s) => s.setShowDiscoverDialog);
  const setShowChannelPanel = useLobbyStore((s) => s.setShowChannelPanel);
  const setShowAgentsPanel = useLobbyStore((s) => s.setShowAgentsPanel);
  const setShowSettingsDialog = useLobbyStore((s) => s.setShowSettingsDialog);
  const agentsPanelRequest = useLobbyStore((s) => s.agentsPanelRequest);
  const dismissAgentsPanel = useLobbyStore((s) => s.dismissAgentsPanel);
  const versionInfo = useVersionCheck();

  // AC5: auto-close drawer at >=768px
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setDrawerOpen(false);
    };
    mql.addEventListener('change', handler as EventListener);
    handler(mql);
    return () => mql.removeEventListener('change', handler as EventListener);
  }, [setDrawerOpen]);

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

  // AC4: drawer session select → close drawer
  const handleDrawerSessionSelect = useCallback(() => {
    setDrawerOpen(false);
  }, [setDrawerOpen]);

  return (
    <ThemeContext.Provider value={themeValue}>
      <I18nContext.Provider value={i18nValue}>
        <div className="flex-col md:flex-row h-screen h-dvh bg-surface text-on-surface">
          {/* AC1: Desktop sidebar */}
          <div className="hidden md:flex md:w-72 shrink-0">
            <Sidebar onSessionSelect={handleDrawerSessionSelect} />
          </div>

          {/* AC2+AC3+AC4: Mobile drawer */}
          <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
            <Sidebar onSessionSelect={handleDrawerSessionSelect} />
          </MobileDrawer>

          <main className="flex-1 flex flex-col min-w-0 pb-[var(--mobile-nav-height)] md:pb-0">
            {/* AC2: Mobile top bar */}
            <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-outline bg-surface-secondary shrink-0">
              <button
                onClick={() => setDrawerOpen(true)}
                className="p-1 rounded hover:bg-[var(--color-sidebar-hover)] text-on-surface-secondary"
                aria-label="Open menu"
              >
                ☰
              </button>
              <span className="font-bold text-on-surface">OpenLobby</span>
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
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-on-surface-muted px-4">
                  {/* AC6: Mobile empty state */}
                  <div className="md:hidden">
                    <p className="text-lg mb-2">{i18nValue.t('app.emptyStateTitle')}</p>
                    <p className="text-sm mb-4">{i18nValue.t('app.emptyStateHint')}</p>
                    <button
                      onClick={() => setDrawerOpen(true)}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-on text-sm font-medium"
                    >
                      {i18nValue.t('app.openSessions')}
                    </button>
                  </div>
                  <div className="hidden md:block">
                    <p className="text-lg mb-2">{i18nValue.t('app.emptyStateTitle')}</p>
                    <p className="text-sm">{i18nValue.t('app.emptyStateHint')}</p>
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* AC2: Mobile navigation */}
          <MobileNav />

          {/* AC7: 5 dialogs rendered from App.tsx level */}
          {showDiscoverDialog && (
            <DiscoverDialog onClose={() => setShowDiscoverDialog(false)} />
          )}
          {showChannelPanel && (
            <ChannelManagePanel onClose={() => setShowChannelPanel(false)} />
          )}
          {showAgentsPanel && (
            <AgentsPanel
              highlightId={agentsPanelRequest?.highlightId}
              onClose={() => {
                setShowAgentsPanel(false);
                dismissAgentsPanel();
              }}
            />
          )}
          {showSettingsDialog && (
            <GlobalSettingsDialog onClose={() => setShowSettingsDialog(false)} />
          )}
          {showUpdateDialog && versionInfo.latest && (
            <UpdateDialog
              latestVersion={versionInfo.latest}
              installMode={versionInfo.installMode}
              onClose={() => setShowUpdateDialog(false)}
            />
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
