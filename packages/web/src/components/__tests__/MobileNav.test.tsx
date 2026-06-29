import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileNav } from '../MobileNav';
import { useLobbyStore } from '../../stores/lobby-store';
import { I18nContext } from '../../contexts/I18nContext';
import type { ReactNode } from 'react';

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nContext.Provider value={{ locale: 'en', setLocale: vi.fn(), t: ((key: string) => key) as any }}>
      {children}
    </I18nContext.Provider>
  );
}

function renderWithCtx(el: ReactNode) {
  return render(<Wrapper>{el}</Wrapper>);
}

describe('MobileNav', () => {
  beforeEach(() => {
    useLobbyStore.setState({
      drawerOpen: false,
      showAgentsPanel: false,
      showChannelPanel: false,
      agents: [],
    });
  });

  describe('AC7: renders 3 tabs', () => {
    it('renders Sessions tab with correct label', () => {
      renderWithCtx(<MobileNav />);
      expect(screen.getByText('nav.sessions')).toBeInTheDocument();
    });

    it('renders Agents tab with correct label', () => {
      renderWithCtx(<MobileNav />);
      expect(screen.getByText('nav.agents')).toBeInTheDocument();
    });

    it('renders Channels tab with correct label', () => {
      renderWithCtx(<MobileNav />);
      expect(screen.getByText('nav.channels')).toBeInTheDocument();
    });

    it('shows agents count badge when agents > 0', () => {
      useLobbyStore.setState({ agents: [{ id: 'a1', displayName: 'a1', adapterName: 'claude-code' } as any] });
      renderWithCtx(<MobileNav />);
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  describe('AC8: tab click calls store setters', () => {
    it('clicking Sessions tab calls setDrawerOpen(true)', () => {
      const spy = vi.spyOn(useLobbyStore.getState(), 'setDrawerOpen');
      renderWithCtx(<MobileNav />);
      fireEvent.click(screen.getByText('nav.sessions'));
      expect(spy).toHaveBeenCalledWith(true);
    });

    it('clicking Agents tab calls setShowAgentsPanel(true)', () => {
      const spy = vi.spyOn(useLobbyStore.getState(), 'setShowAgentsPanel');
      renderWithCtx(<MobileNav />);
      fireEvent.click(screen.getByText('nav.agents'));
      expect(spy).toHaveBeenCalledWith(true);
    });

    it('clicking Channels tab calls setShowChannelPanel(true)', () => {
      const spy = vi.spyOn(useLobbyStore.getState(), 'setShowChannelPanel');
      renderWithCtx(<MobileNav />);
      fireEvent.click(screen.getByText('nav.channels'));
      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  describe('AC9: hidden on desktop', () => {
    it('has md:hidden class', () => {
      renderWithCtx(<MobileNav />);
      const nav = screen.getByTestId('mobile-nav');
      expect(nav.className).toContain('md:hidden');
    });
  });

  describe('AC10: reduced-motion', () => {
    it('applies motion-safe transition classes', () => {
      renderWithCtx(<MobileNav />);
      const nav = screen.getByTestId('mobile-nav');
      expect(nav.className).toContain('motion-safe:transition-transform');
    });
  });
});
