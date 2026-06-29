import { describe, it, expect } from 'vitest';
import { useLobbyStore } from '../lobby-store';

describe('lobby-store mobile adaptation fields', () => {
  it('should have all 5 mobile fields default to false', () => {
    const state = useLobbyStore.getState();
    expect(state.drawerOpen).toBe(false);
    expect(state.showAgentsPanel).toBe(false);
    expect(state.showChannelPanel).toBe(false);
    expect(state.showSettingsDialog).toBe(false);
    expect(state.showUpdateDialog).toBe(false);
  });

  it('setDrawerOpen should toggle drawerOpen', () => {
    const store = useLobbyStore;
    store.getState().setDrawerOpen(true);
    expect(store.getState().drawerOpen).toBe(true);
    store.getState().setDrawerOpen(false);
    expect(store.getState().drawerOpen).toBe(false);
    store.getState().setDrawerOpen(true);
    expect(store.getState().drawerOpen).toBe(true);
  });

  it('setShowAgentsPanel should toggle showAgentsPanel', () => {
    const store = useLobbyStore;
    store.getState().setShowAgentsPanel(true);
    expect(store.getState().showAgentsPanel).toBe(true);
    store.getState().setShowAgentsPanel(false);
    expect(store.getState().showAgentsPanel).toBe(false);
  });

  it('setShowChannelPanel should toggle showChannelPanel', () => {
    const store = useLobbyStore;
    store.getState().setShowChannelPanel(true);
    expect(store.getState().showChannelPanel).toBe(true);
    store.getState().setShowChannelPanel(false);
    expect(store.getState().showChannelPanel).toBe(false);
  });

  it('setShowSettingsDialog should toggle showSettingsDialog', () => {
    const store = useLobbyStore;
    store.getState().setShowSettingsDialog(true);
    expect(store.getState().showSettingsDialog).toBe(true);
    store.getState().setShowSettingsDialog(false);
    expect(store.getState().showSettingsDialog).toBe(false);
  });

  it('setShowUpdateDialog should toggle showUpdateDialog', () => {
    const store = useLobbyStore;
    store.getState().setShowUpdateDialog(true);
    expect(store.getState().showUpdateDialog).toBe(true);
    store.getState().setShowUpdateDialog(false);
    expect(store.getState().showUpdateDialog).toBe(false);
  });

  it('should not affect existing fields when setting new fields', () => {
    const store = useLobbyStore;

    // Capture existing state
    const before = store.getState();

    // Set one of the new fields
    store.getState().setDrawerOpen(true);

    // Verify existing key fields remain unchanged
    const after = store.getState();
    expect(after.connected).toBe(before.connected);
    expect(after.activeSessionId).toBe(before.activeSessionId);
    expect(after.lmAvailable).toBe(before.lmAvailable);
    expect(after.amAvailable).toBe(before.amAvailable);
    expect(after.showDiscoverDialog).toBe(before.showDiscoverDialog);

    // Reset
    store.getState().setDrawerOpen(false);
  });
});
