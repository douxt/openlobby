import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileDrawer } from '../MobileDrawer';

describe('MobileDrawer', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
  });

  describe('AC1: open=true', () => {
    it('panel has translate-x-0 class', () => {
      render(<MobileDrawer open={true} onClose={onClose}>content</MobileDrawer>);
      const panel = screen.getByTestId('drawer-panel');
      expect(panel.className).toContain('translate-x-0');
    });

    it('backdrop has opacity-100 class', () => {
      render(<MobileDrawer open={true} onClose={onClose}>content</MobileDrawer>);
      const backdrop = screen.getByTestId('drawer-backdrop');
      expect(backdrop.className).toContain('opacity-100');
    });

    it('body overflow is hidden', () => {
      render(<MobileDrawer open={true} onClose={onClose}>content</MobileDrawer>);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('has aria-modal role=dialog', () => {
      render(<MobileDrawer open={true} onClose={onClose}>content</MobileDrawer>);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
  });

  describe('AC2: open=false', () => {
    it('panel has -translate-x-full class', () => {
      render(<MobileDrawer open={false} onClose={onClose}>content</MobileDrawer>);
      const panel = screen.getByTestId('drawer-panel');
      expect(panel.className).toContain('-translate-x-full');
    });

    it('backdrop has opacity-0 and pointer-events-none', () => {
      render(<MobileDrawer open={false} onClose={onClose}>content</MobileDrawer>);
      const backdrop = screen.getByTestId('drawer-backdrop');
      expect(backdrop.className).toContain('opacity-0');
      expect(backdrop.className).toContain('pointer-events-none');
    });

    it('children are not mounted', () => {
      render(
        <MobileDrawer open={false} onClose={onClose}>
          <span data-testid="child-content">visible</span>
        </MobileDrawer>,
      );
      expect(screen.queryByTestId('child-content')).toBeNull();
    });
  });

  describe('AC3: backdrop click', () => {
    it('calls onClose when backdrop clicked', () => {
      render(<MobileDrawer open={true} onClose={onClose}>content</MobileDrawer>);
      fireEvent.click(screen.getByTestId('drawer-backdrop'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC4: Escape key', () => {
    it('calls onClose on Escape keydown', () => {
      render(<MobileDrawer open={true} onClose={onClose}>content</MobileDrawer>);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose on other keys', () => {
      render(<MobileDrawer open={true} onClose={onClose}>content</MobileDrawer>);
      fireEvent.keyDown(document, { key: 'Enter' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not call onClose when closed', () => {
      render(<MobileDrawer open={false} onClose={onClose}>content</MobileDrawer>);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('AC5: panel click propagation', () => {
    it('does not call onClose when clicking inside panel', () => {
      render(<MobileDrawer open={true} onClose={onClose}>
        <button data-testid="inner-btn">click</button>
      </MobileDrawer>);
      fireEvent.click(screen.getByTestId('inner-btn'));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('AC6: ErrorBoundary', () => {
    it('renders children normally when no error', () => {
      render(<MobileDrawer open={true} onClose={onClose}>
        <span data-testid="normal-child">ok</span>
      </MobileDrawer>);
      expect(screen.getByTestId('normal-child')).toBeInTheDocument();
    });

    it('catches rendering errors and shows fallback', () => {
      const Buggy = () => { throw new Error('broken'); };
      render(<MobileDrawer open={true} onClose={onClose}>
        <Buggy />
      </MobileDrawer>);
      // App should not crash — drawer container still rendered
      expect(screen.getByTestId('drawer-container')).toBeInTheDocument();
    });
  });
});
