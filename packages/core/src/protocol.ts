import type {
  SpawnOptions,
  ControlDecision,
  SessionSummary,
  LobbyMessage,
  ControlRequest,
  AdapterCommand,
} from './types.js';
import type {
  ChannelProviderConfig,
  ChannelProviderInfo,
  ChannelBinding,
  ChannelAccountBinding,
  ChannelPluginInfo,
} from './channel.js';
import type { AgentDefinition } from './agent.js';

/** 前端 → 后端 */
export type ClientMessage =
  | { type: 'session.create'; adapterName: string; options: SpawnOptions; displayName?: string }
  | { type: 'session.resume'; sessionId: string }
  | { type: 'session.destroy'; sessionId: string }
  | { type: 'session.interrupt'; sessionId: string }
  | { type: 'session.list' }
  | { type: 'session.history'; sessionId: string }
  | { type: 'message.send'; sessionId: string; content: string }
  | { type: 'session.configure'; sessionId: string; options: Partial<SpawnOptions> }
  | {
      type: 'control.respond';
      sessionId: string;
      requestId: string;
      decision: ControlDecision;
      payload?: Record<string, unknown>;
    }
  | { type: 'session.discover'; cwd?: string }
  | {
      type: 'session.import';
      sessionId: string;
      adapterName: string;
      displayName?: string;
      cwd: string;
      jsonlPath?: string;
    }
  | { type: 'channel.list-providers' }
  | { type: 'channel.add-provider'; config: ChannelProviderConfig }
  | { type: 'channel.remove-provider'; providerId: string }
  | { type: 'channel.toggle-provider'; providerId: string; enabled: boolean }
  | { type: 'channel.list-bindings' }
  | {
      type: 'channel.bind';
      identityKey: string;
      target: 'lobby-manager' | string;
      /** NEW: when set, the binding is an Agent binding (locked). */
      agentId?: string;
    }
  | { type: 'channel.unbind'; identityKey: string }
  | { type: 'channel.list-account-bindings' }
  | {
      /**
       * Bind an Agent to an entire IM bot account. Applies to every peer
       * (every 1:1 and every group) of (channelName, accountId). Mutually
       * exclusive with peer-level rows for the same (channel, account).
       */
      type: 'channel.bind-agent-to-account';
      channelName: string;
      accountId: string;
      agentId: string;
    }
  | {
      type: 'channel.unbind-agent-from-account';
      channelName: string;
      accountId: string;
    }
  | { type: 'session.plan-mode'; sessionId: string; enabled: boolean }
  | { type: 'session.recover'; sessionId: string }
  | { type: 'completion.request'; sessionId: string }
  | { type: 'session.view'; sessionId: string | null }
  | { type: 'channel.discover-plugins' }
  | { type: 'config.get'; key: string }
  | { type: 'config.set'; key: string; value: string }
  | { type: 'adapter.get-defaults' }
  | { type: 'adapter.set-default'; adapterName: string; permissionMode: string }
  | { type: 'adapter.get-meta' }
  | { type: 'wecom.qr-start' }
  | { type: 'wecom.qr-cancel' }
  | { type: 'compact'; sessionId: string; instructions?: string }
  | { type: 'session.pin'; sessionId: string; pinned: boolean }
  | { type: 'session.rename'; sessionId: string; displayName: string }
  | { type: 'session.open-terminal'; sessionId: string }
  | { type: 'session.open-pty'; sessionId: string; cols: number; rows: number }
  | { type: 'session.close-pty'; sessionId: string }
  | { type: 'pty.input'; sessionId: string; data: string }
  | { type: 'pty.resize'; sessionId: string; cols: number; rows: number }
  | { type: 'agent.list'; includeDeleted?: boolean }
  | {
      type: 'agent.create';
      definition: Omit<AgentDefinition, 'createdAt' | 'updatedAt' | 'deletedAt'>;
    }
  | { type: 'agent.update'; id: string; patch: Partial<Omit<AgentDefinition, 'id' | 'createdAt'>> }
  | { type: 'agent.delete'; id: string }
  | { type: 'agent.recover'; id: string }
  | { type: 'agent.hard-delete'; id: string };

/** 后端 → 前端 */
export type ServerMessage =
  | { type: 'session.created'; session: SessionSummary }
  | { type: 'session.updated'; session: SessionSummary; previousId?: string }
  | { type: 'session.destroyed'; sessionId: string }
  | { type: 'session.list'; sessions: SessionSummary[] }
  | {
      type: 'session.history';
      sessionId: string;
      messages: LobbyMessage[];
    }
  | { type: 'message'; sessionId: string; message: LobbyMessage }
  | {
      type: 'control.request';
      sessionId: string;
      request: ControlRequest;
    }
  | { type: 'session.discovered'; sessions: SessionSummary[] }
  | { type: 'session.navigate'; sessionId: string }
  | { type: 'lm.status'; available: boolean; sessionId?: string }
  | { type: 'am.status'; available: boolean; sessionId?: string }
  | { type: 'error'; sessionId?: string; error: string }
  | { type: 'session.open-terminal-result'; sessionId: string; ok: true; terminal: string }
  | { type: 'session.open-terminal-result'; sessionId: string; ok: false; resumeCommand: string; reason: string }
  | { type: 'channel.providers-list'; providers: ChannelProviderInfo[] }
  | { type: 'channel.provider-status'; providerId: string; healthy: boolean }
  | { type: 'channel.bindings-list'; bindings: ChannelBinding[] }
  | { type: 'channel.binding-updated'; binding: ChannelBinding }
  | { type: 'channel.binding-removed'; identityKey: string }
  | { type: 'channel.account-bindings-list'; bindings: ChannelAccountBinding[] }
  | { type: 'channel.account-binding-updated'; binding: ChannelAccountBinding }
  | {
      type: 'channel.account-binding-conflict';
      channelName: string;
      accountId: string;
      conflicts: ChannelBinding[];
    }
  | { type: 'completion.response'; sessionId: string; commands: AdapterCommand[]; cached?: boolean }
  | { type: 'channel.plugins-list'; plugins: ChannelPluginInfo[] }
  | { type: 'config.value'; key: string; value: string }
  | { type: 'adapter.defaults'; defaults: Array<{ adapterName: string; permissionMode: string; displayName: string }> }
  | { type: 'adapter.meta'; meta: Record<string, { displayName: string; modeLabels: Record<string, string> }> }
  | { type: 'wecom.qr-status'; status: 'generating' | 'waiting' | 'success' | 'expired' | 'error'; qrUrl?: string; botId?: string; secret?: string; error?: string }
  | { type: 'pty.opened'; sessionId: string }
  | { type: 'pty.output'; sessionId: string; data: string }
  | { type: 'pty.closed'; sessionId: string }
  | { type: 'pty.error'; sessionId: string; error: string }
  | { type: 'agent.list'; agents: AgentDefinition[]; includesDeleted: boolean }
  | { type: 'agent.updated'; agent: AgentDefinition }
  | { type: 'agent.deleted'; id: string; hard: boolean };
