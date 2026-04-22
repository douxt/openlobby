import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AgentAdapter,
  AgentProcess,
  ChannelIdentity,
  ChannelProvider,
  InboundChannelMessage,
  OutboundChannelMessage,
  ResumeOptions,
  SpawnOptions,
} from '@openlobby/core';
import { initDb, getBinding, upsertBinding } from '../db.js';
import { SessionManager } from '../session-manager.js';
import { AgentRegistry } from '../agent-registry.js';
import { ChannelRouterImpl } from '../channel-router.js';

class StubProcess extends EventEmitter implements AgentProcess {
  sessionId: string;
  readonly adapter = 'stub';
  status: AgentProcess['status'] = 'running';
  public killed = false;
  public sentMessages: string[] = [];

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  sendMessage(text: string): void {
    this.sentMessages.push(text);
  }
  respondControl(): void {}
  updateOptions(): void {}
  interrupt(): void {}
  kill(): void {
    this.killed = true;
    this.status = 'stopped';
    this.emit('exit', 0);
  }
}

interface StubAdapter extends AgentAdapter {
  spawnCount: number;
  resumeCount: number;
  spawnedProcesses: StubProcess[];
  lastSpawn?: SpawnOptions;
}

function createStubAdapter(name = 'stub'): StubAdapter {
  let counter = 0;
  const spawnedProcesses: StubProcess[] = [];
  const adapter: StubAdapter = {
    name,
    displayName: 'Stub',
    spawnCount: 0,
    resumeCount: 0,
    spawnedProcesses,
    permissionMeta: {
      modeLabels: {
        auto: 'auto',
        supervised: 'supervised',
        readonly: 'readonly',
      },
    },
    async detect() {
      return { installed: true, version: 'test' };
    },
    async spawn(options: SpawnOptions) {
      adapter.lastSpawn = options;
      adapter.spawnCount += 1;
      counter += 1;
      const proc = new StubProcess(`${name}-session-${counter}`);
      spawnedProcesses.push(proc);
      return proc;
    },
    async resume(sessionId: string, _options?: ResumeOptions) {
      adapter.resumeCount += 1;
      const proc = new StubProcess(sessionId);
      spawnedProcesses.push(proc);
      return proc;
    },
    getSessionStoragePath() {
      return '/tmp';
    },
    async readSessionHistory() {
      return [];
    },
    async discoverSessions() {
      return [];
    },
    getResumeCommand(sessionId: string) {
      return `stub --resume ${sessionId}`;
    },
    async listCommands() {
      return [];
    },
  };
  return adapter;
}

interface RecordedMessage {
  text: string;
  kind?: string;
  peerId: string;
}

function createStubProvider(
  channelName: string,
  accountId: string,
  sent: RecordedMessage[],
): ChannelProvider {
  return {
    channelName,
    accountId,
    async start() {},
    async stop() {},
    async sendMessage(msg: OutboundChannelMessage) {
      sent.push({
        text: msg.text,
        kind: msg.kind,
        peerId: msg.identity.peerId,
      });
    },
    isHealthy() {
      return true;
    },
  };
}

function bindAgent(
  db: Database.Database,
  identity: ChannelIdentity,
  agentId: string,
): void {
  const now = Date.now();
  upsertBinding(db, {
    identity_key: `${identity.channelName}:${identity.accountId}:${identity.peerId}`,
    channel_name: identity.channelName,
    account_id: identity.accountId,
    peer_id: identity.peerId,
    peer_display_name: identity.peerDisplayName ?? null,
    peer_kind: identity.peerKind,
    target: 'lobby-manager',
    active_session_id: null,
    agent_id: agentId,
    created_at: now,
    last_active_at: now,
  });
}

function makeInbound(
  identity: ChannelIdentity,
  text: string,
): InboundChannelMessage {
  return {
    externalMessageId: `msg-${Math.random().toString(36).slice(2, 10)}`,
    identity,
    text,
    timestamp: Date.now(),
  };
}

describe('ChannelRouter Agent routing', () => {
  let tmp: string;
  let db: Database.Database;
  let agentsRoot: string;
  let sessionManager: SessionManager;
  let registry: AgentRegistry;
  let adapter: StubAdapter;
  let router: ChannelRouterImpl;
  let sent: RecordedMessage[];
  let provider: ChannelProvider;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'ol-cr-agent-'));
    db = initDb(join(tmp, 'sessions.db'));
    agentsRoot = join(tmp, 'agents');

    sessionManager = new SessionManager(db);
    adapter = createStubAdapter('stub');
    sessionManager.registerAdapter(adapter);

    registry = new AgentRegistry(db, agentsRoot);
    sessionManager.setAgentRegistry(registry);

    router = new ChannelRouterImpl(sessionManager, null, registry, db);

    sent = [];
    provider = createStubProvider('telegram', 'bot1', sent);
    await router.registerProvider(provider);
  });

  it('silently drops group messages when the agent has no groupChat config', async () => {
    registry.create({
      id: 'reviewer',
      displayName: 'Code Reviewer',
      description: '',
      adapter: 'stub',
      contextFiles: [],
    });

    const groupIdentity: ChannelIdentity = {
      channelName: 'telegram',
      accountId: 'bot1',
      peerId: 'group-1',
      peerDisplayName: 'Group 1',
      peerKind: 'group',
    };
    bindAgent(db, groupIdentity, 'reviewer');

    await router.handleInbound(makeInbound(groupIdentity, 'hello bot'));

    // No session spawned
    expect(adapter.spawnCount).toBe(0);
    // No reply (silent drop)
    expect(sent).toEqual([]);
  });

  it('forwards group messages when mention pattern matches', async () => {
    registry.create({
      id: 'mentionbot',
      displayName: 'Mention Bot',
      description: '',
      adapter: 'stub',
      contextFiles: [],
      groupChat: {
        mentionPatterns: ['@bot'],
        requireMention: true,
      },
    });

    const groupIdentity: ChannelIdentity = {
      channelName: 'telegram',
      accountId: 'bot1',
      peerId: 'group-2',
      peerDisplayName: 'Group 2',
      peerKind: 'group',
    };
    bindAgent(db, groupIdentity, 'mentionbot');

    // No mention → dropped
    await router.handleInbound(makeInbound(groupIdentity, 'just chatting'));
    expect(adapter.spawnCount).toBe(0);

    // Mention present → session spawns and message is forwarded
    await router.handleInbound(makeInbound(groupIdentity, 'hey @bot please help'));

    expect(adapter.spawnCount).toBe(1);
    const proc = adapter.spawnedProcesses[0]!;
    expect(proc.sentMessages).toEqual(['hey @bot please help']);

    // Binding was updated to point at the real agent session
    const updated = getBinding(
      db,
      `${groupIdentity.channelName}:${groupIdentity.accountId}:${groupIdentity.peerId}`,
    );
    expect(updated?.agent_id).toBe('mentionbot');
    expect(updated?.active_session_id).toBe(proc.sessionId);
    expect(updated?.target).toBe(proc.sessionId);
  });

  it('rejects /exit in an Agent-bound DM with the lock message and does not spawn', async () => {
    registry.create({
      id: 'locked',
      displayName: 'Locked Agent',
      description: '',
      adapter: 'stub',
      contextFiles: [],
    });

    const dmIdentity: ChannelIdentity = {
      channelName: 'telegram',
      accountId: 'bot1',
      peerId: 'user-9',
      peerDisplayName: 'User9',
      peerKind: 'direct',
    };
    bindAgent(db, dmIdentity, 'locked');

    await router.handleInbound(makeInbound(dmIdentity, '/exit'));

    expect(adapter.spawnCount).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('bound to Agent "Locked Agent"');
    expect(sent[0]!.text).toContain('cannot switch sessions');

    // /goto also rejected
    await router.handleInbound(makeInbound(dmIdentity, '/goto other'));
    expect(adapter.spawnCount).toBe(0);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.text).toContain('cannot switch sessions');
  });

  it('replies with a removal notice when the agent is soft-deleted and does not spawn', async () => {
    registry.create({
      id: 'gone',
      displayName: 'Gone Agent',
      description: '',
      adapter: 'stub',
      contextFiles: [],
    });
    registry.softDelete('gone');

    const dmIdentity: ChannelIdentity = {
      channelName: 'telegram',
      accountId: 'bot1',
      peerId: 'user-10',
      peerDisplayName: 'User10',
      peerKind: 'direct',
    };
    bindAgent(db, dmIdentity, 'gone');

    await router.handleInbound(makeInbound(dmIdentity, 'anyone home?'));

    expect(adapter.spawnCount).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('🚫');
    expect(sent[0]!.text).toContain('Gone Agent');
    expect(sent[0]!.text).toContain('has been removed');

    // Binding is preserved (recovery path expects it to still be there)
    const stillBound = getBinding(
      db,
      `${dmIdentity.channelName}:${dmIdentity.accountId}:${dmIdentity.peerId}`,
    );
    expect(stillBound?.agent_id).toBe('gone');
  });
});
