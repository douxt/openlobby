import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AgentAdapter,
  AgentProcess,
  ChannelIdentity,
  ResumeOptions,
  SpawnOptions,
} from '@openlobby/core';
import { initDb, getBinding, upsertBinding } from '../db.js';
import { SessionManager } from '../session-manager.js';
import { AgentRegistry } from '../agent-registry.js';

class StubProcess extends EventEmitter implements AgentProcess {
  sessionId: string;
  readonly adapter = 'stub';
  status: AgentProcess['status'] = 'running';
  public killed = false;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  sendMessage(): void {}
  respondControl(): void {}
  updateOptions(): void {}
  interrupt(): void {}
  kill(): void {
    this.killed = true;
    this.status = 'stopped';
  }
}

interface StubAdapter extends AgentAdapter {
  lastSpawn?: SpawnOptions;
  spawnCount: number;
  spawnedProcesses: StubProcess[];
}

function createStubAdapter(name = 'stub'): StubAdapter {
  let counter = 0;
  const spawnedProcesses: StubProcess[] = [];
  const adapter: StubAdapter = {
    name,
    displayName: 'Stub',
    spawnCount: 0,
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
    async resume(_sessionId: string, _options?: ResumeOptions) {
      counter += 1;
      const proc = new StubProcess(`${name}-session-${counter}`);
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

describe('SessionManager agent-session flows', () => {
  let tmp: string;
  let db: Database.Database;
  let agentsRoot: string;
  let manager: SessionManager;
  let adapter: StubAdapter;
  let registry: AgentRegistry;

  const identity: ChannelIdentity = {
    channelName: 'telegram',
    accountId: 'bot1',
    peerId: 'user-42',
    peerDisplayName: 'Alice',
    peerKind: 'direct',
  };

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'ol-sm-agent-'));
    db = initDb(join(tmp, 'sessions.db'));
    agentsRoot = join(tmp, 'agents');

    manager = new SessionManager(db);
    adapter = createStubAdapter('stub');
    manager.registerAdapter(adapter);

    registry = new AgentRegistry(db, agentsRoot);
    manager.setAgentRegistry(registry);
  });

  it('spawns with cwd under overridden agents root + peerHash subdir', async () => {
    const def = registry.create({
      id: 'reviewer',
      displayName: 'Code Reviewer',
      description: 'reviews code',
      adapter: 'stub',
      systemPrompt: 'Inline base prompt.',
      contextFiles: [],
    });

    const session = await manager.getOrCreateAgentSession(def, identity);

    // cwd must sit under the override root — not the module-level default (~/.openlobby).
    const sessionsRoot = join(agentsRoot, 'reviewer', 'sessions');
    expect(session.cwd.startsWith(sessionsRoot)).toBe(true);
    expect(session.cwd).not.toBe(sessionsRoot);
    expect(existsSync(session.cwd)).toBe(true);

    // peerHash subdir is a 16-char hex slice
    const peerHashDir = session.cwd.slice(sessionsRoot.length + 1);
    expect(peerHashDir).toMatch(/^[0-9a-f]{16}$/);

    expect(adapter.lastSpawn?.cwd).toBe(session.cwd);
    expect(session.agentId).toBe('reviewer');
    expect(session.displayName).toBe('Code Reviewer · Alice');
  });

  it('returns the same session on the second call with the same identity', async () => {
    const def = registry.create({
      id: 'helper',
      displayName: 'Helper',
      description: '',
      adapter: 'stub',
      contextFiles: [],
    });

    const first = await manager.getOrCreateAgentSession(def, identity);
    const second = await manager.getOrCreateAgentSession(def, identity);

    expect(second.id).toBe(first.id);
    expect(adapter.spawnCount).toBe(1);
  });

  it('forwards systemPrompt, allowedTools and deniedTools into SpawnOptions', async () => {
    const def = registry.create({
      id: 'scoped',
      displayName: 'Scoped',
      description: '',
      adapter: 'stub',
      systemPrompt: 'Base directive.',
      contextFiles: ['SOUL.md'],
      allowedTools: ['Read', 'Grep'],
      deniedTools: ['Bash'],
    });

    // Drop a context file so resolveSystemPrompt has something to concatenate
    const ws = registry.getAgentWorkspaceDir('scoped');
    writeFileSync(join(ws, 'SOUL.md'), 'Be terse.');

    await manager.getOrCreateAgentSession(def, identity);

    expect(adapter.lastSpawn?.allowedTools).toEqual(['Read', 'Grep']);
    expect(adapter.lastSpawn?.deniedTools).toEqual(['Bash']);
    expect(adapter.lastSpawn?.systemPrompt).toContain('Base directive.');
    expect(adapter.lastSpawn?.systemPrompt).toContain('Be terse.');
  });

  it('stopAllSessionsForAgent kills all agent sessions and clears binding.agent_id', async () => {
    const def = registry.create({
      id: 'multi',
      displayName: 'Multi',
      description: '',
      adapter: 'stub',
      contextFiles: [],
    });

    const idA: ChannelIdentity = { ...identity, peerId: 'peer-A' };
    const idB: ChannelIdentity = { ...identity, peerId: 'peer-B' };

    const sessionA = await manager.getOrCreateAgentSession(def, idA);
    const sessionB = await manager.getOrCreateAgentSession(def, idB);

    // Simulate bindings pointing at the two sessions with agent_id set.
    const now = Date.now();
    upsertBinding(db, {
      identity_key: `${idA.channelName}:${idA.accountId}:${idA.peerId}`,
      channel_name: idA.channelName,
      account_id: idA.accountId,
      peer_id: idA.peerId,
      peer_display_name: idA.peerDisplayName ?? null,
      peer_kind: idA.peerKind,
      target: sessionA.id,
      active_session_id: sessionA.id,
      agent_id: 'multi',
      created_at: now,
      last_active_at: now,
    });
    upsertBinding(db, {
      identity_key: `${idB.channelName}:${idB.accountId}:${idB.peerId}`,
      channel_name: idB.channelName,
      account_id: idB.accountId,
      peer_id: idB.peerId,
      peer_display_name: idB.peerDisplayName ?? null,
      peer_kind: idB.peerKind,
      target: sessionB.id,
      active_session_id: sessionB.id,
      agent_id: 'multi',
      created_at: now,
      last_active_at: now,
    });

    const processA = sessionA.process as StubProcess;
    const processB = sessionB.process as StubProcess;
    expect(processA.killed).toBe(false);
    expect(processB.killed).toBe(false);

    await manager.stopAllSessionsForAgent('multi');

    expect(processA.killed).toBe(true);
    expect(processB.killed).toBe(true);

    const bindingA = getBinding(db, `${idA.channelName}:${idA.accountId}:${idA.peerId}`);
    const bindingB = getBinding(db, `${idB.channelName}:${idB.accountId}:${idB.peerId}`);
    expect(bindingA?.agent_id).toBeNull();
    expect(bindingB?.agent_id).toBeNull();

    // Index is cleared so a subsequent inbound spawns a fresh session.
    const sessionC = await manager.getOrCreateAgentSession(def, idA);
    expect(sessionC.id).not.toBe(sessionA.id);
  });
});
