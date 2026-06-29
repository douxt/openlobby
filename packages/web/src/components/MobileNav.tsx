import { useLobbyStore } from '../stores/lobby-store';
import { useI18nContext } from '../contexts/I18nContext';

interface TabDef {
  key: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: number;
}

export function MobileNav() {
  const drawerOpen = useLobbyStore((s) => s.drawerOpen);
  const showAgentsPanel = useLobbyStore((s) => s.showAgentsPanel);
  const showChannelPanel = useLobbyStore((s) => s.showChannelPanel);
  const agentsCount = useLobbyStore((s) => s.agents.length);
  const setDrawerOpen = useLobbyStore((s) => s.setDrawerOpen);
  const setShowAgentsPanel = useLobbyStore((s) => s.setShowAgentsPanel);
  const setShowChannelPanel = useLobbyStore((s) => s.setShowChannelPanel);
  const { t } = useI18nContext();

  const tabs: TabDef[] = [
    {
      key: 'sessions',
      label: t('nav.sessions'),
      isActive: drawerOpen,
      onClick: () => setDrawerOpen(true),
    },
    {
      key: 'agents',
      label: t('nav.agents'),
      isActive: showAgentsPanel,
      onClick: () => setShowAgentsPanel(true),
      badge: agentsCount > 0 ? agentsCount : undefined,
    },
    {
      key: 'channels',
      label: t('nav.channels'),
      isActive: showChannelPanel,
      onClick: () => setShowChannelPanel(true),
    },
  ];

  return (
    <nav
      data-testid="mobile-nav"
      className="fixed bottom-0 inset-x-0 z-40 md:hidden motion-safe:transition-transform h-[var(--mobile-nav-height)] bg-surface-secondary border-t border-outline flex items-center safe-area-bottom"
    >
      <div className="flex w-full h-full items-center justify-around px-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={tab.onClick}
            className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-xs font-medium transition-colors ${
              tab.isActive
                ? 'text-primary'
                : 'text-on-surface-muted hover:text-on-surface-secondary'
            }`}
          >
            {tab.badge != null && (
              <span className="absolute top-1 right-1/2 translate-x-[14px] min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-on text-[9px] leading-none flex items-center justify-center font-medium border border-surface-secondary">
                {tab.badge}
              </span>
            )}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
