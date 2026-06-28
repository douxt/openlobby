import { describe, it, expect, beforeEach } from 'vitest';
import { useLobbyStore } from '../lobby-store';

beforeEach(() => {
  // Reset all mobile-ui fields to default before each test
  const store = useLobbyStore;
  store.setState({
    drawerOpen: false,
    showAgentsPanel: false,
    showChannelPanel: false,
    showSettingsDialog: false,
    showUpdateDialog: false,
  });
});

describe('lobby-store mobile UI fields', () => {
  it('defaults all 5 mobile-ui booleans to false', () => {
    const state = useLobbyStore.getState();
    expect(state.drawerOpen).toBe(false);
    expect(state.showAgentsPanel).toBe(false);
    expect(state.showChannelPanel).toBe(false);
    expect(state.showSettingsDialog).toBe(false);
    expect(state.showUpdateDialog).toBe(false);
  });

  it('setDrawerOpen toggles drawerOpen', () => {
    const store = useLobbyStore;
    expect(store.getState().drawerOpen).toBe(false);
    store.getState().setDrawerOpen(true);
    expect(store.getState().drawerOpen).toBe(true);
    store.getState().setDrawerOpen(false);
    expect(store.getState().drawerOpen).toBe(false);
  });

  it('setShowAgentsPanel toggles showAgentsPanel', () => {
    const store = useLobbyStore;
    store.getState().setShowAgentsPanel(true);
    expect(store.getState().showAgentsPanel).toBe(true);
    store.getState().setShowAgentsPanel(false);
    expect(store.getState().showAgentsPanel).toBe(false);
  });

  it('setShowChannelPanel toggles showChannelPanel', () => {
    const store = useLobbyStore;
    store.getState().setShowChannelPanel(true);
    expect(store.getState().showChannelPanel).toBe(true);
    store.getState().setShowChannelPanel(false);
    expect(store.getState().showChannelPanel).toBe(false);
  });

  it('setShowSettingsDialog toggles showSettingsDialog', () => {
    const store = useLobbyStore;
    store.getState().setShowSettingsDialog(true);
    expect(store.getState().showSettingsDialog).toBe(true);
    store.getState().setShowSettingsDialog(false);
    expect(store.getState().showSettingsDialog).toBe(false);
  });

  it('setShowUpdateDialog toggles showUpdateDialog', () => {
    const store = useLobbyStore;
    store.getState().setShowUpdateDialog(true);
    expect(store.getState().showUpdateDialog).toBe(true);
    store.getState().setShowUpdateDialog(false);
    expect(store.getState().showUpdateDialog).toBe(false);
  });

  it('does not affect existing fields', () => {
    const store = useLobbyStore;
    const before = { ...store.getState() };

    store.getState().setDrawerOpen(true);
    store.getState().setShowAgentsPanel(true);
    store.getState().setShowChannelPanel(true);
    store.getState().setShowSettingsDialog(true);
    store.getState().setShowUpdateDialog(true);

    const after = store.getState();
    // Existing core fields should still be present and unchanged
    expect(after.activeSessionId).toBe(before.activeSessionId);
    expect(after.connected).toBe(before.connected);
    expect(after.lmAvailable).toBe(before.lmAvailable);
    expect(typeof after.setConnected).toBe('function');
  });
});
