import React, { useEffect, useCallback } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const MobileDrawer = React.memo(function MobileDrawer({
  open,
  onClose,
  children,
}: MobileDrawerProps) {
  const stableOnClose = useCallback(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stableOnClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, stableOnClose]);

  return (
    <div
      role="dialog"
      aria-modal={open}
      data-testid="drawer-container"
      className={`fixed inset-0 z-45 ${open ? '' : 'pointer-events-none'}`}
    >
      {/* Backdrop */}
      <div
        data-testid="drawer-backdrop"
        onClick={stableOnClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Panel */}
      <div
        data-testid="drawer-panel"
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-0 left-0 h-full w-[85vw] max-w-[320px] bg-surface-secondary shadow-xl transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {open && <ErrorBoundary>{children}</ErrorBoundary>}
      </div>
    </div>
  );
});
