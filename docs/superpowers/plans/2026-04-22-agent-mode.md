# Agent Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-22-agent-mode-design.md`](../specs/2026-04-22-agent-mode-design.md)

**Goal:** Introduce Agent mode — a declarative template (`AgentDefinition`) that spawns focused, channel-bound, non-switchable sessions with per-peer isolation, tool allow/deny enforcement, soft-delete, group-chat mention rules, and a Web UI for management.

**Architecture:** Hybrid storage (SQLite structured fields + on-disk context files under `~/.openlobby/agents/<id>/workspace/`), deterministic per-peer session derivation (`agent:<id>:<channel>:<kind>:<peerId>`), routing lock via `binding.agentId != null`, cross-adapter tool policy via a shared helper invoked inside each adapter's approval hook.

**Tech Stack:** TypeScript 5, Node.js 20, better-sqlite3, Fastify/WebSocket, React 19 + Zustand, vitest.

**Commit discipline:** One task = one commit (per the project's workflow rules). Each task below ends with a verify + commit step.

---

### Task 1: Core types, protocol, and backward-compatible helpers

**Files:**
- Create: `packages/core/src/agent.ts`
- Modify: `packages/core/src/channel.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/protocol.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create `packages/core/src/agent.ts`**

```typescript
import type { PermissionMode } from './types.js';

/** Adapter selector for an Agent; 'any' = first installed adapter at spawn time. */
export type AgentAdapterSelector =
  | 'claude-code'
  | 'codex-cli'
  | 'opencode'
  | 'gsd'
  | 'any';

/** Group-chat behavior for an Agent. */
export interface AgentGroupChatConfig {
  /** Case-insensitive substrings that trigger the agent in a group chat. */
  mentionPatterns: string[];
  /**
   * When true (default), the agent only responds to group messages matching
   * mentionPatterns. When false, the agent responds to all group messages.
   */
  requireMention: boolean;
}

/** Declarative template for an Agent-mode session. */
export interface AgentDefinition {
  /** Unique slug-like id. 'lobby-manager' is reserved and cannot be used. */
  id: string;
  displayName: string;
  description: string;

  adapter: AgentAdapterSelector;

  /** Inline system prompt (optional). Combined with contextFiles at spawn. */
  systemPrompt?: string;

  /**
   * Files under the agent's workspace directory to concatenate into the final
   * systemPrompt. Separator: "\n\n---\n\n". Missing files are skipped with a warning.
   * OpenClaw-compatible names: SOUL.md, USER.md, AGENTS.md, TOOLS.md, IDENTITY.md.
   */
  contextFiles: string[];

  model?: string;
  permissionMode?: PermissionMode;

  /** Tool allow-list. null/undefined = no restriction. */
  allowedTools?: string[];
  /** Tool deny-list. Takes precedence over allow-list. */
  deniedTools?: string[];

  /**
   * Group-chat behavior. When undefined, agent does NOT respond in groups
   * (safe default, aligned with OpenClaw).
   */
  groupChat?: AgentGroupChatConfig;

  /** Soft-delete marker. null/undefined = active. */
  deletedAt?: number;

  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Extend `ChannelIdentity` with `peerKind` in `packages/core/src/channel.ts`**

At top of the file, right after the doc-comment of `ChannelIdentity`:

```typescript
/** Kind of conversation the peer represents. */
export type ChannelPeerKind = 'direct' | 'group' | 'channel';

/** 标识一个特定通道+账号下的外部用户 */
export interface ChannelIdentity {
  channelName: string;
  accountId: string;
  peerId: string;
  peerDisplayName?: string;
  /**
   * Conversation type. Required for group-chat mention rules.
   * Providers that cannot distinguish default to 'direct'.
   */
  peerKind: ChannelPeerKind;
}
```

Inside the same file, extend `ChannelBinding`:

```typescript
export interface ChannelBinding {
  identityKey: ChannelIdentityKey;
  channelName: string;
  accountId: string;
  peerId: string;
  peerDisplayName?: string;
  /** NEW: populated by provider; stored for mention rule and UI display. */
  peerKind: ChannelPeerKind;
  /** 'lobby-manager' 或具体 sessionId — semantics unchanged. */
  target: 'lobby-manager' | string;
  activeSessionId: string | null;
  /**
   * NEW: when set, this binding is driven by an Agent template.
   * Presence implies the binding is locked (no /exit, /goto, or LM routing).
   */
  agentId?: string;
  createdAt: number;
  lastActiveAt: number;
}
```

- [ ] **Step 3: Add `agentId` to `SessionSummary` in `packages/core/src/types.ts`**

In the `SessionSummary` interface (line ~94), add after `pinned?: boolean`:

```typescript
  /** NEW: set when this session was spawned from an AgentDefinition. */
  agentId?: string;
```

- [ ] **Step 4: Extend `ClientMessage` and `ServerMessage` in `packages/core/src/protocol.ts`**

Add to the imports at top:

```typescript
import type { AgentDefinition } from './agent.js';
import type { ChannelIdentity } from './channel.js';
```

In the `ClientMessage` union, add new variants (just before the closing `;`):

```typescript
  | { type: 'agent.list'; includeDeleted?: boolean }
  | {
      type: 'agent.create';
      definition: Omit<AgentDefinition, 'createdAt' | 'updatedAt' | 'deletedAt'>;
    }
  | { type: 'agent.update'; id: string; patch: Partial<Omit<AgentDefinition, 'id' | 'createdAt'>> }
  | { type: 'agent.delete'; id: string }
  | { type: 'agent.recover'; id: string }
  | { type: 'agent.hard-delete'; id: string }
```

Modify the existing `channel.bind` variant to accept `agentId`:

```typescript
  | {
      type: 'channel.bind';
      identityKey: string;
      target: 'lobby-manager' | string;
      /** NEW: when set, the binding is an Agent binding (locked). */
      agentId?: string;
    }
```

In the `ServerMessage` union, add:

```typescript
  | { type: 'agent.list'; agents: AgentDefinition[]; includesDeleted: boolean }
  | { type: 'agent.updated'; agent: AgentDefinition }
  | { type: 'agent.deleted'; id: string; hard: boolean }
```

- [ ] **Step 5: Re-export from `packages/core/src/index.ts`**

Add after the existing `channel.js` re-exports:

```typescript
export type {
  AgentDefinition,
  AgentAdapterSelector,
  AgentGroupChatConfig,
} from './agent.js';

export type { ChannelPeerKind } from './channel.js';
```

- [ ] **Step 6: Build-check**

Run: `pnpm -r build 2>&1 | tail -30`
Expected: errors flagging `peerKind` missing in existing `InboundChannelMessage` / `ChannelBinding` construction sites. These sites are fixed in later tasks — **it is OK for this task to leave those call sites unresolved**, but the `packages/core` build must succeed.

Run: `pnpm --filter @openlobby/core build 2>&1 | tail -20`
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/agent.ts packages/core/src/channel.ts packages/core/src/types.ts packages/core/src/protocol.ts packages/core/src/index.ts
git commit -m "feat(core): add AgentDefinition, peerKind, and binding.agentId types"
```

---

### Task 2: SQLite schema, migrations, and CRUD helpers

**Files:**
- Modify: `packages/server/src/db.ts`

- [ ] **Step 1: Add `agent_definitions` table + migrations in `initDb()`**

In `packages/server/src/db.ts`, inside `initDb()`, **after** the `adapter_defaults` block (~line 118), add:

```typescript
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_definitions (
      id                  TEXT PRIMARY KEY,
      display_name        TEXT NOT NULL,
      description         TEXT NOT NULL DEFAULT '',
      adapter             TEXT NOT NULL,
      system_prompt       TEXT,
      context_files_json  TEXT NOT NULL DEFAULT '[]',
      model               TEXT,
      permission_mode     TEXT,
      allowed_tools_json  TEXT,
      denied_tools_json   TEXT,
      group_chat_json     TEXT,
      deleted_at          INTEGER,
      created_at          INTEGER NOT NULL,
      updated_at          INTEGER NOT NULL
    )
  `);

  // Migration: add agent_id column to sessions
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN agent_id TEXT`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: add agent_id column to channel_bindings
  try {
    db.exec(`ALTER TABLE channel_bindings ADD COLUMN agent_id TEXT`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: add peer_kind column to channel_bindings (default 'direct' for backfill)
  try {
    db.exec(`ALTER TABLE channel_bindings ADD COLUMN peer_kind TEXT NOT NULL DEFAULT 'direct'`);
  } catch {
    // Column already exists — ignore
  }
```

- [ ] **Step 2: Update `SessionRow` and `ChannelBindingRow` interfaces**

```typescript
export interface SessionRow {
  // ...existing fields unchanged...
  pinned: number;
  agent_id: string | null;         // NEW
}

export interface ChannelBindingRow {
  identity_key: string;
  channel_name: string;
  account_id: string;
  peer_id: string;
  peer_display_name: string | null;
  peer_kind: string;               // NEW ('direct' | 'group' | 'channel')
  target: string;
  active_session_id: string | null;
  agent_id: string | null;         // NEW
  created_at: number;
  last_active_at: number;
}
```

- [ ] **Step 3: Update `upsertSession` and `upsertBinding` to include new columns**

```typescript
export function upsertSession(db: Database.Database, row: SessionRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO sessions
      (id, adapter_name, display_name, cwd, jsonl_path, origin, status, created_at, last_active_at, model, tags, permission_mode, message_mode, pinned, agent_id)
    VALUES
      (@id, @adapter_name, @display_name, @cwd, @jsonl_path, @origin, @status, @created_at, @last_active_at, @model, @tags, @permission_mode, @message_mode, @pinned, @agent_id)
  `).run(row);
}

export function upsertBinding(db: Database.Database, row: ChannelBindingRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO channel_bindings
      (identity_key, channel_name, account_id, peer_id, peer_display_name, peer_kind, target, active_session_id, agent_id, created_at, last_active_at)
    VALUES
      (@identity_key, @channel_name, @account_id, @peer_id, @peer_display_name, @peer_kind, @target, @active_session_id, @agent_id, @created_at, @last_active_at)
  `).run(row);
}
```

- [ ] **Step 4: Add `AgentDefinitionRow` + CRUD helpers at the bottom of `db.ts`**

```typescript
// ─── Agent Definitions ──────────────────────────────────────────────

export interface AgentDefinitionRow {
  id: string;
  display_name: string;
  description: string;
  adapter: string;
  system_prompt: string | null;
  context_files_json: string;
  model: string | null;
  permission_mode: string | null;
  allowed_tools_json: string | null;
  denied_tools_json: string | null;
  group_chat_json: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export function upsertAgentDefinition(db: Database.Database, row: AgentDefinitionRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO agent_definitions
      (id, display_name, description, adapter, system_prompt, context_files_json, model, permission_mode, allowed_tools_json, denied_tools_json, group_chat_json, deleted_at, created_at, updated_at)
    VALUES
      (@id, @display_name, @description, @adapter, @system_prompt, @context_files_json, @model, @permission_mode, @allowed_tools_json, @denied_tools_json, @group_chat_json, @deleted_at, @created_at, @updated_at)
  `).run(row);
}

export function getAgentDefinition(db: Database.Database, id: string): AgentDefinitionRow | undefined {
  return db.prepare('SELECT * FROM agent_definitions WHERE id = ?').get(id) as AgentDefinitionRow | undefined;
}

export function getAllAgentDefinitions(
  db: Database.Database,
  includeDeleted: boolean,
): AgentDefinitionRow[] {
  const sql = includeDeleted
    ? 'SELECT * FROM agent_definitions ORDER BY created_at ASC'
    : 'SELECT * FROM agent_definitions WHERE deleted_at IS NULL ORDER BY created_at ASC';
  return db.prepare(sql).all() as AgentDefinitionRow[];
}

export function softDeleteAgentDefinition(db: Database.Database, id: string, deletedAt: number): void {
  db.prepare('UPDATE agent_definitions SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id);
}

export function recoverAgentDefinition(db: Database.Database, id: string, updatedAt: number): void {
  db.prepare('UPDATE agent_definitions SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(updatedAt, id);
}

export function hardDeleteAgentDefinition(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM agent_definitions WHERE id = ?').run(id);
}

/** Get all sessions spawned by a given agent id (active or stopped). */
export function getSessionsByAgent(db: Database.Database, agentId: string): SessionRow[] {
  return db.prepare('SELECT * FROM sessions WHERE agent_id = ?').all(agentId) as SessionRow[];
}

/** Clear agent_id on bindings when the underlying session is removed. */
export function clearBindingAgentBySession(db: Database.Database, sessionId: string): void {
  db.prepare('UPDATE channel_bindings SET agent_id = NULL WHERE active_session_id = ?').run(sessionId);
}
```

- [ ] **Step 5: Update `resetBindingTargetBySession` to also clear `agent_id`**

```typescript
export function resetBindingTargetBySession(db: Database.Database, sessionId: string): void {
  db.prepare(
    `UPDATE channel_bindings SET target = 'lobby-manager', active_session_id = NULL, agent_id = NULL WHERE target = ? OR active_session_id = ?`,
  ).run(sessionId, sessionId);
}
```

- [ ] **Step 6: Update callers of `upsertSession` / `upsertBinding` to supply new fields**

Run: `grep -rn "upsertSession\|upsertBinding" packages/server/src`
Expected: a handful of call sites. At each call, add `agent_id: null` (or the real value when known) and `peer_kind: 'direct'` (for bindings) — the provider-populated value is wired in Task 7.

- [ ] **Step 7: Build + run existing tests**

```bash
pnpm --filter @openlobby/server build 2>&1 | tail -20
pnpm --filter @openlobby/server test 2>&1 | tail -40
```
Expected: build clean. Tests may fail only if they assume old row shapes — fix by padding fields with `null`/`'direct'`.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/db.ts
git commit -m "feat(server): add agent_definitions table + agent_id/peer_kind columns"
```

---

### Task 3: `AgentRegistry` service

**Files:**
- Create: `packages/server/src/agent-registry.ts`
- Create: `packages/server/src/__tests__/agent-registry.test.ts`

- [ ] **Step 1: Create `packages/server/src/agent-registry.ts`**

```typescript
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type Database from 'better-sqlite3';
import type { AgentDefinition, AgentGroupChatConfig } from '@openlobby/core';
import {
  upsertAgentDefinition,
  getAgentDefinition,
  getAllAgentDefinitions,
  softDeleteAgentDefinition,
  recoverAgentDefinition,
  hardDeleteAgentDefinition,
  type AgentDefinitionRow,
} from './db.js';

/** Root directory that holds per-agent workspaces. */
export function getAgentRoot(agentId: string): string {
  return join(homedir(), '.openlobby', 'agents', agentId);
}

export function getAgentWorkspaceDir(agentId: string): string {
  return join(getAgentRoot(agentId), 'workspace');
}

export function getAgentDir(agentId: string): string {
  return join(getAgentRoot(agentId), 'agent-dir');
}

export function getAgentSessionsRoot(agentId: string): string {
  return join(getAgentRoot(agentId), 'sessions');
}

const RESERVED_IDS = new Set(['lobby-manager']);

function rowToDef(row: AgentDefinitionRow): AgentDefinition {
  return {
    id: row.id,
    displayName: row.display_name,
    description: row.description,
    adapter: row.adapter as AgentDefinition['adapter'],
    systemPrompt: row.system_prompt ?? undefined,
    contextFiles: JSON.parse(row.context_files_json) as string[],
    model: row.model ?? undefined,
    permissionMode: (row.permission_mode ?? undefined) as AgentDefinition['permissionMode'],
    allowedTools: row.allowed_tools_json ? JSON.parse(row.allowed_tools_json) : undefined,
    deniedTools: row.denied_tools_json ? JSON.parse(row.denied_tools_json) : undefined,
    groupChat: row.group_chat_json
      ? (JSON.parse(row.group_chat_json) as AgentGroupChatConfig)
      : undefined,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function defToRow(def: AgentDefinition): AgentDefinitionRow {
  return {
    id: def.id,
    display_name: def.displayName,
    description: def.description,
    adapter: def.adapter,
    system_prompt: def.systemPrompt ?? null,
    context_files_json: JSON.stringify(def.contextFiles),
    model: def.model ?? null,
    permission_mode: def.permissionMode ?? null,
    allowed_tools_json: def.allowedTools ? JSON.stringify(def.allowedTools) : null,
    denied_tools_json: def.deniedTools ? JSON.stringify(def.deniedTools) : null,
    group_chat_json: def.groupChat ? JSON.stringify(def.groupChat) : null,
    deleted_at: def.deletedAt ?? null,
    created_at: def.createdAt,
    updated_at: def.updatedAt,
  };
}

export class AgentRegistry {
  constructor(private db: Database.Database) {}

  list(includeDeleted = false): AgentDefinition[] {
    return getAllAgentDefinitions(this.db, includeDeleted).map(rowToDef);
  }

  get(id: string): AgentDefinition | null {
    const row = getAgentDefinition(this.db, id);
    return row ? rowToDef(row) : null;
  }

  create(input: Omit<AgentDefinition, 'createdAt' | 'updatedAt' | 'deletedAt'>): AgentDefinition {
    if (RESERVED_IDS.has(input.id)) {
      throw new Error(`Agent id "${input.id}" is reserved.`);
    }
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(input.id)) {
      throw new Error(`Agent id must match /^[a-z0-9][a-z0-9-_]*$/.`);
    }
    if (getAgentDefinition(this.db, input.id)) {
      throw new Error(`Agent "${input.id}" already exists.`);
    }

    const now = Date.now();
    const def: AgentDefinition = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    upsertAgentDefinition(this.db, defToRow(def));

    // Ensure workspace layout exists
    mkdirSync(getAgentWorkspaceDir(def.id), { recursive: true });
    mkdirSync(getAgentDir(def.id), { recursive: true });
    mkdirSync(getAgentSessionsRoot(def.id), { recursive: true });
    return def;
  }

  update(id: string, patch: Partial<Omit<AgentDefinition, 'id' | 'createdAt'>>): AgentDefinition {
    const existing = this.get(id);
    if (!existing) throw new Error(`Agent "${id}" not found.`);
    const merged: AgentDefinition = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    upsertAgentDefinition(this.db, defToRow(merged));
    return merged;
  }

  softDelete(id: string): void {
    softDeleteAgentDefinition(this.db, id, Date.now());
  }

  recover(id: string): void {
    recoverAgentDefinition(this.db, id, Date.now());
  }

  hardDelete(id: string): void {
    const def = this.get(id);
    if (def && def.deletedAt == null) {
      throw new Error(`Cannot hard-delete an active agent. Soft-delete first.`);
    }
    hardDeleteAgentDefinition(this.db, id);
  }

  /**
   * Build the effective systemPrompt by concatenating:
   *   definition.systemPrompt + each existing contextFile's content
   * separated by "\n\n---\n\n". Missing files are logged and skipped.
   */
  resolveSystemPrompt(id: string): string {
    const def = this.get(id);
    if (!def) throw new Error(`Agent "${id}" not found.`);

    const parts: string[] = [];
    if (def.systemPrompt?.trim()) parts.push(def.systemPrompt.trim());

    const workspace = getAgentWorkspaceDir(id);
    for (const relPath of def.contextFiles) {
      const full = join(workspace, relPath);
      if (!existsSync(full)) {
        console.warn(`[AgentRegistry] context file missing: ${full}`);
        continue;
      }
      try {
        const text = readFileSync(full, 'utf-8').trim();
        if (text) parts.push(text);
      } catch (err) {
        console.warn(`[AgentRegistry] failed to read ${full}:`, err);
      }
    }

    return parts.join('\n\n---\n\n');
  }
}
```

- [ ] **Step 2: Add vitest coverage in `packages/server/src/__tests__/agent-registry.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb } from '../db.js';
import { AgentRegistry, getAgentWorkspaceDir } from '../agent-registry.js';

describe('AgentRegistry', () => {
  let db: Database.Database;
  let registry: AgentRegistry;

  beforeEach(() => {
    const tmp = mkdtempSync(join(tmpdir(), 'ol-agent-'));
    db = initDb(join(tmp, 'sessions.db'));
    registry = new AgentRegistry(db);
  });

  it('rejects reserved id', () => {
    expect(() => registry.create({
      id: 'lobby-manager',
      displayName: 'x',
      description: '',
      adapter: 'any',
      contextFiles: [],
    })).toThrow(/reserved/);
  });

  it('creates / lists / soft-deletes / recovers', () => {
    const a = registry.create({
      id: 'support',
      displayName: 'Support',
      description: 'help desk',
      adapter: 'claude-code',
      contextFiles: [],
    });
    expect(a.id).toBe('support');
    expect(registry.list()).toHaveLength(1);

    registry.softDelete('support');
    expect(registry.list()).toHaveLength(0);
    expect(registry.list(true)).toHaveLength(1);
    expect(registry.list(true)[0].deletedAt).toBeGreaterThan(0);

    registry.recover('support');
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0].deletedAt).toBeUndefined();
  });

  it('resolveSystemPrompt concatenates inline + files', () => {
    registry.create({
      id: 'foo',
      displayName: 'Foo',
      description: '',
      adapter: 'any',
      systemPrompt: 'Inline prompt',
      contextFiles: ['SOUL.md', 'MISSING.md'],
    });
    const ws = getAgentWorkspaceDir('foo');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'SOUL.md'), 'I am a bot.');

    const prompt = registry.resolveSystemPrompt('foo');
    expect(prompt).toContain('Inline prompt');
    expect(prompt).toContain('I am a bot.');
  });
});
```

- [ ] **Step 3: Run test**

```bash
pnpm --filter @openlobby/server test -- agent-registry 2>&1 | tail -30
```
Expected: 3 passing tests.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/agent-registry.ts packages/server/src/__tests__/agent-registry.test.ts
git commit -m "feat(server): add AgentRegistry service with CRUD + systemPrompt resolution"
```

---

### Task 4: Shared adapter tool policy + wire into all 4 adapters

**Files:**
- Create: `packages/core/src/adapters/policy.ts`
- Create: `packages/core/src/adapters/__tests__/policy.test.ts`
- Modify: `packages/core/src/adapters/claude-code.ts`
- Modify: `packages/core/src/adapters/codex-cli.ts`
- Modify: `packages/core/src/adapters/opencode.ts`
- Modify: `packages/core/src/adapters/gsd.ts`
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Extend `SpawnOptions` with allow/deny**

In `packages/core/src/types.ts`, inside `SpawnOptions`:

```typescript
export interface SpawnOptions {
  // ...existing...
  /** Tool allow-list. If set, only these tools can be invoked. */
  allowedTools?: string[];
  /** Tool deny-list. Takes precedence over allow-list. */
  deniedTools?: string[];
}
```

(Note: `allowedTools` already exists in `ClaudeCodeSpawnOptions`. Move it up to the shared type and remove the duplicate from `ClaudeCodeSpawnOptions`.)

- [ ] **Step 2: Create `packages/core/src/adapters/policy.ts`**

```typescript
export interface ToolPolicy {
  allowedTools?: string[];
  deniedTools?: string[];
}

export type PolicyDecision =
  | { decision: 'allow' }
  | { decision: 'deny'; reason: string };

/**
 * Apply allow/deny policy to a tool call.
 * - Deny-list wins.
 * - If allowedTools is undefined, all non-denied tools are allowed.
 * - If allowedTools is set, only those tools are allowed.
 */
export function enforceToolPolicy(toolName: string, policy: ToolPolicy): PolicyDecision {
  if (policy.deniedTools?.includes(toolName)) {
    return { decision: 'deny', reason: `Tool "${toolName}" is denied by Agent policy.` };
  }
  if (policy.allowedTools && !policy.allowedTools.includes(toolName)) {
    return { decision: 'deny', reason: `Tool "${toolName}" is not in the allow-list.` };
  }
  return { decision: 'allow' };
}
```

- [ ] **Step 3: Policy unit tests in `packages/core/src/adapters/__tests__/policy.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { enforceToolPolicy } from '../policy.js';

describe('enforceToolPolicy', () => {
  it('allows all when policy is empty', () => {
    expect(enforceToolPolicy('Write', {}).decision).toBe('allow');
  });
  it('deny takes precedence over allow', () => {
    expect(enforceToolPolicy('Write', { allowedTools: ['Write'], deniedTools: ['Write'] }))
      .toEqual({ decision: 'deny', reason: expect.stringContaining('denied') });
  });
  it('allow-list blocks unlisted', () => {
    expect(enforceToolPolicy('Bash', { allowedTools: ['Read'] }).decision).toBe('deny');
  });
  it('allow-list permits listed', () => {
    expect(enforceToolPolicy('Read', { allowedTools: ['Read'] }).decision).toBe('allow');
  });
});
```

- [ ] **Step 4: Wire `enforceToolPolicy` into each adapter's approval hook**

**claude-code.ts** — inside `handleToolApproval()` (line ~646), after extracting `toolName`, before mode dispatch:

```typescript
  private async handleToolApproval(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolUseID?: string,
  ): Promise<{ behavior: 'allow'; updatedInput?: Record<string, unknown> } | { behavior: 'deny'; message: string }> {
    // Agent policy gate — runs BEFORE mode logic
    const policyDecision = enforceToolPolicy(toolName, {
      allowedTools: this.spawnOptions.allowedTools,
      deniedTools: this.spawnOptions.deniedTools,
    });
    if (policyDecision.decision === 'deny') {
      console.log('[ClaudeCode] Policy deny:', toolName, policyDecision.reason);
      return { behavior: 'deny', message: policyDecision.reason };
    }
    // ...existing auto/readonly/supervised logic unchanged...
  }
```

Add at top of file:
```typescript
import { enforceToolPolicy } from './policy.js';
```

Also ensure the SDK's own `allowedTools` is NOT passed unconditionally — it would short-circuit `canUseTool` and bypass our deny check. Trace line ~462:

```typescript
allowedTools: this.spawnOptions.allowedTools ?? [...READONLY_TOOLS],
```
Change the behavior: if `deniedTools` is set, always force the SDK to call `canUseTool` for those tools. Simplest fix — when any policy is present, pass an empty array so every tool goes through `canUseTool`:

```typescript
const hasPolicy = !!(this.spawnOptions.allowedTools || this.spawnOptions.deniedTools);
const queryAllowed = hasPolicy ? [] : (this.spawnOptions.allowedTools ?? READONLY_TOOLS);
// then:
allowedTools: queryAllowed,
```

**codex-cli.ts** — in the JSON-RPC `requestApproval` handler (search for `requestApproval`). Before current approval logic, apply policy and short-circuit with a deny RPC response. Same pattern as Claude Code.

**opencode.ts** — in `handlePermissionUpdated` (line ~291), before the mode dispatch:

```typescript
const policyDecision = enforceToolPolicy(toolName, {
  allowedTools: this.spawnOptions.allowedTools,
  deniedTools: this.spawnOptions.deniedTools,
});
if (policyDecision.decision === 'deny') {
  console.log('[OpenCode] Policy deny:', toolName, policyDecision.reason);
  this.client.postSessionIdPermissionsPermissionId({
    path: { id: this.sessionId, permissionID: props.id },
    body: { response: 'reject' },
  }).catch(() => {});
  return;
}
```

**gsd.ts** — in the `extension_ui_request` event handler (line ~353), before mode dispatch, same pattern (deny by sending `confirmed: false, cancelled: true`).

- [ ] **Step 5: Run tests + build**

```bash
pnpm --filter @openlobby/core test 2>&1 | tail -30
pnpm -r build 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/adapters/policy.ts packages/core/src/adapters/__tests__/policy.test.ts packages/core/src/adapters/claude-code.ts packages/core/src/adapters/codex-cli.ts packages/core/src/adapters/opencode.ts packages/core/src/adapters/gsd.ts packages/core/src/types.ts
git commit -m "feat(core): add shared enforceToolPolicy helper and wire into all adapters"
```

---

### Task 5: SessionManager Agent session API

**Files:**
- Modify: `packages/server/src/session-manager.ts`

- [ ] **Step 1: Add imports and the agent-session index**

Add at top:
```typescript
import { createHash } from 'node:crypto';
import type { AgentDefinition, ChannelIdentity } from '@openlobby/core';
import type { AgentRegistry } from './agent-registry.js';
import { getAgentSessionsRoot } from './agent-registry.js';
import { getSessionsByAgent, clearBindingAgentBySession } from './db.js';
```

Inside the `SessionManager` class, add a new member:
```typescript
  /** Index: "agentId:channel:accountId:peerId" → sessionId */
  private agentSessionIndex = new Map<string, string>();
  private agentRegistry: AgentRegistry | null = null;
```

Add a setter (called from server `index.ts`):
```typescript
  setAgentRegistry(registry: AgentRegistry): void {
    this.agentRegistry = registry;
    // Rebuild index from DB: find all sessions with agent_id + binding tied to them
    for (const session of this.sessions.values()) {
      if (session.agentId && session.channelIdentity) {
        const key = this.agentIndexKey(session.agentId, session.channelIdentity);
        this.agentSessionIndex.set(key, session.id);
      }
    }
  }

  private agentIndexKey(agentId: string, id: ChannelIdentity): string {
    return `${agentId}:${id.channelName}:${id.accountId}:${id.peerId}`;
  }

  private peerHash(id: ChannelIdentity): string {
    return createHash('sha256')
      .update(`${id.channelName}:${id.accountId}:${id.peerId}`)
      .digest('hex')
      .slice(0, 16);
  }
```

Extend `ManagedSession` (wherever it's defined in this file) with:
```typescript
  agentId?: string;
  /** Snapshot of the channel identity the session was spawned for (Agent mode only) */
  channelIdentity?: ChannelIdentity;
```

- [ ] **Step 2: Implement `getOrCreateAgentSession`**

Add a method near `createSession`:

```typescript
  /**
   * Spawn (or resume) a session derived from an AgentDefinition for a given channel identity.
   * Enforces per-peer cwd isolation, injects resolved system prompt, and registers the session
   * with agentId so ChannelRouter recognizes it as locked.
   */
  async getOrCreateAgentSession(
    agent: AgentDefinition,
    identity: ChannelIdentity,
  ): Promise<ManagedSession> {
    if (!this.agentRegistry) throw new Error('AgentRegistry not set on SessionManager');

    const key = this.agentIndexKey(agent.id, identity);
    const existingId = this.agentSessionIndex.get(key);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (existing) {
        if (existing.status === 'stopped' || existing.status === 'error') {
          // Lazy resume via existing resumeSession path
          return this.resumeSession(existingId);
        }
        return existing;
      }
      // stale index entry
      this.agentSessionIndex.delete(key);
    }

    // Resolve adapter
    const adapterName = agent.adapter === 'any'
      ? this.firstAvailableAdapterName()
      : agent.adapter;
    const adapter = this.adapters.get(adapterName);
    if (!adapter) throw new Error(`Adapter "${adapterName}" is not available.`);

    // Build per-session cwd
    const peerHash = this.peerHash(identity);
    const cwd = join(getAgentSessionsRoot(agent.id), peerHash);
    mkdirSync(cwd, { recursive: true });

    const systemPrompt = this.agentRegistry.resolveSystemPrompt(agent.id);

    const displayName = `${agent.displayName} · ${identity.peerDisplayName ?? identity.peerId}`;

    const proc = await adapter.spawn({
      cwd,
      systemPrompt,
      model: agent.model,
      permissionMode: agent.permissionMode,
      allowedTools: agent.allowedTools,
      deniedTools: agent.deniedTools,
    });

    const session = this.registerManagedSession({
      process: proc,
      adapterName,
      displayName,
      cwd,
      origin: 'lobby',
      agentId: agent.id,
      channelIdentity: identity,
      model: agent.model,
      permissionMode: agent.permissionMode,
    });

    this.agentSessionIndex.set(key, session.id);
    return session;
  }

  private firstAvailableAdapterName(): string {
    const first = this.adapters.keys().next();
    if (first.done) throw new Error('No adapters installed.');
    return first.value;
  }
```

> Note: `registerManagedSession` is a helper you may need to extract from the existing `createSession` path to avoid duplication. If `createSession` already encapsulates all registration logic (SQLite upsert, event wiring, listener notification), factor the common tail out into `registerManagedSession` and call it from both paths.

- [ ] **Step 3: Cascade soft-delete for Agent**

Add a public method:

```typescript
  /**
   * Stop all active sessions spawned by the given agent id, and clear the
   * agent_id field on bindings that reference them. Caller (AgentRegistry.softDelete)
   * then flags the agent row.
   */
  async stopAllSessionsForAgent(agentId: string): Promise<void> {
    const rows = getSessionsByAgent(this.db, agentId);
    for (const row of rows) {
      const session = this.sessions.get(row.id);
      if (session) {
        session.process.kill();
      }
      clearBindingAgentBySession(this.db, row.id);
    }
    // Drop from index
    for (const [key, sid] of this.agentSessionIndex) {
      const targetRow = rows.find(r => r.id === sid);
      if (targetRow) this.agentSessionIndex.delete(key);
    }
  }
```

- [ ] **Step 4: Wire `SpawnOptions.deniedTools` through `updateOptions` and `configure` call sites**

Search for `updateOptions`. Confirm nothing strips `deniedTools`. Anywhere `SpawnOptions` is reconstructed (e.g. `resumeSession`), forward `deniedTools` from the stored ManagedSession.

- [ ] **Step 5: Make `index.ts` construct AgentRegistry and hand it to SessionManager**

In `packages/server/src/index.ts`, before `new LobbyManager(...)`:

```typescript
  const agentRegistry = new AgentRegistry(db);
  sessionManager.setAgentRegistry(agentRegistry);
```

- [ ] **Step 6: Tests**

Add minimal tests in `packages/server/src/__tests__/session-manager-agent.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
// ...set up an in-memory DB, a stub adapter that captures SpawnOptions,
// then call sessionManager.getOrCreateAgentSession and assert:
//  - cwd under ~/.openlobby/agents/<id>/sessions/<peerHash>/
//  - systemPrompt forwarded
//  - allowedTools / deniedTools forwarded
//  - calling twice with same identity returns same sessionId (index hit)
```

- [ ] **Step 7: Build + test**

```bash
pnpm --filter @openlobby/server build 2>&1 | tail -15
pnpm --filter @openlobby/server test 2>&1 | tail -40
```

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/session-manager.ts packages/server/src/index.ts packages/server/src/__tests__/session-manager-agent.test.ts
git commit -m "feat(server): SessionManager.getOrCreateAgentSession + agent-session index + cascade stop"
```

---

### Task 6: ChannelRouter Agent branch + mention rule + slash rejection

**Files:**
- Modify: `packages/server/src/channel-router.ts`

- [ ] **Step 1: Inject AgentRegistry into ChannelRouter**

Change constructor signature:

```typescript
constructor(
  private sessionManager: SessionManager,
  private lobbyManager: LobbyManager | null,
  private agentRegistry: AgentRegistry,   // NEW
  private db: Database.Database,
)
```

Update `packages/server/src/index.ts`:
```typescript
const channelRouter = new ChannelRouterImpl(sessionManager, lobbyManager, agentRegistry, db);
```

- [ ] **Step 2: Add `shouldRespondInGroup` helper (top of file or in a utility)**

```typescript
import type { AgentDefinition, InboundChannelMessage } from '@openlobby/core';

function shouldRespondInGroup(
  agent: AgentDefinition,
  msg: InboundChannelMessage,
): boolean {
  if (msg.identity.peerKind === 'direct') return true;
  const gc = agent.groupChat;
  if (!gc) return false;                         // strict default
  if (!gc.requireMention) return true;
  const lower = msg.text.toLowerCase();
  return gc.mentionPatterns.some((p) => lower.includes(p.toLowerCase()));
}

const LOCK_SLASH_COMMANDS = new Set(['/exit', '/goto', '/add']);

function firstToken(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return '';
  return trimmed.split(/\s+/)[0]!;
}
```

- [ ] **Step 3: Insert the Agent branch at the top of `handleInbound()` (line ~288)**

Right after resolving `binding` but before existing LM / direct-session logic:

```typescript
async handleInbound(msg: InboundChannelMessage): Promise<void> {
  const identityKey = toIdentityKey(msg.identity);
  let binding = getBinding(this.db, identityKey);

  // First-time: create placeholder binding targeted at lobby-manager (unchanged)
  if (!binding) {
    binding = this.createDefaultBinding(msg.identity);   // existing path
  }

  // Persist peerKind on every inbound (Provider-populated)
  if (binding.peer_kind !== msg.identity.peerKind) {
    this.db.prepare('UPDATE channel_bindings SET peer_kind = ? WHERE identity_key = ?')
      .run(msg.identity.peerKind, identityKey);
    binding.peer_kind = msg.identity.peerKind;
  }

  // ── AGENT PATH ──
  if (binding.agent_id) {
    const agent = this.agentRegistry.get(binding.agent_id);
    if (!agent) {
      await this.replyPlainText(msg.identity,
        `⚠️ Agent not found (id=${binding.agent_id}). Please rebind.`);
      return;
    }
    if (agent.deletedAt) {
      await this.replyPlainText(msg.identity,
        `🚫 Agent "${agent.displayName}" has been removed. Ask an admin to recover it in the OpenLobby Web UI.`);
      return;
    }

    // Slash command rejection
    const cmd = firstToken(msg.text);
    if (LOCK_SLASH_COMMANDS.has(cmd)) {
      await this.replyPlainText(msg.identity,
        `This chat is bound to Agent "${agent.displayName}" and cannot switch sessions. ` +
        `Use the OpenLobby Web UI to change or unbind.`);
      return;
    }

    // Mention rule
    if (!shouldRespondInGroup(agent, msg)) {
      return;                                 // silent drop
    }

    // Spawn or reuse session
    const session = await this.sessionManager.getOrCreateAgentSession(agent, msg.identity);

    // Update binding to point active_session_id at the concrete session
    updateBindingActiveSession(this.db, identityKey, session.id);
    this.lastSenderBySession.set(session.id, identityKey);

    await this.sessionManager.sendMessage(session.id, msg.text);
    return;
  }

  // ── existing non-Agent logic below (unchanged) ──
  // ...
}
```

> The exact shape of `createDefaultBinding` and `replyPlainText` may already exist under different names. Reuse existing helpers; do not duplicate.

- [ ] **Step 4: Populate `agentId` when a channel.bind request carries it**

Search for the current `channel.bind` handler inside `ws-handler.ts` (done in Task 8 — here just ensure ChannelRouter exposes a method):

```typescript
  async bindIdentity(
    identity: ChannelIdentity,
    target: 'lobby-manager' | string,
    agentId?: string,
  ): Promise<ChannelBinding> {
    const identityKey = toIdentityKey(identity);
    const existing = getBinding(this.db, identityKey);
    const now = Date.now();
    const row: ChannelBindingRow = {
      identity_key: identityKey,
      channel_name: identity.channelName,
      account_id: identity.accountId,
      peer_id: identity.peerId,
      peer_display_name: identity.peerDisplayName ?? null,
      peer_kind: identity.peerKind,
      target,
      active_session_id: existing?.active_session_id ?? null,
      agent_id: agentId ?? null,
      created_at: existing?.created_at ?? now,
      last_active_at: now,
    };
    upsertBinding(this.db, row);
    return this.rowToBinding(row);
  }
```

- [ ] **Step 5: Update tests in `packages/server/src/__tests__/` to cover the Agent branch**

Add `channel-router-agent.test.ts` with at least three scenarios:
1. Group msg with no `groupChat` config → silent drop
2. Group msg with mention pattern match → forwarded
3. DM with `/exit` in an Agent binding → receives lock message, NOT forwarded

- [ ] **Step 6: Build + test**

```bash
pnpm --filter @openlobby/server build 2>&1 | tail -15
pnpm --filter @openlobby/server test 2>&1 | tail -40
```

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/channel-router.ts packages/server/src/index.ts packages/server/src/__tests__/channel-router-agent.test.ts
git commit -m "feat(server): ChannelRouter Agent routing branch with mention rule and lock"
```

---

### Task 7: ChannelProvider `peerKind` population

**Files:**
- Modify: `packages/server/src/channels/wecom.ts`
- Modify: `packages/server/src/channels/telegram.ts` (if it exists here; otherwise skip)
- Modify: `packages/channel-telegram/src/telegram-provider.ts`
- Modify: every site that constructs `ChannelIdentity` (grep for `channelName:`, `accountId:`)

- [ ] **Step 1: Telegram — map `chat.type` to `peerKind`**

In `packages/channel-telegram/src/telegram-provider.ts`, at the site where `InboundChannelMessage.identity` is built:

```typescript
const peerKind: ChannelPeerKind =
  update.message.chat.type === 'private' ? 'direct'
  : update.message.chat.type === 'channel' ? 'channel'
  : 'group';   // 'group' | 'supergroup'

const identity: ChannelIdentity = {
  channelName: 'telegram',
  accountId: this.accountId,
  peerId: String(update.message.chat.id),
  peerDisplayName: update.message.chat.title ?? update.message.from?.first_name,
  peerKind,
};
```

Import `ChannelPeerKind` from `@openlobby/core`.

- [ ] **Step 2: WeCom — map chat type**

In `packages/server/src/channels/wecom.ts`, determine group vs direct from the webhook payload (WeCom uses `MsgType` + `ChatType` or similar; consult existing parsing code). Default to `'direct'` if unknown.

- [ ] **Step 3: Grep for other ChannelIdentity construction sites**

```bash
grep -rn "peerId:" packages/server/src packages/channel-telegram/src | grep -v test
```

Each hit needs a `peerKind` field. Missing `peerKind` causes a type error — fix them all.

- [ ] **Step 4: Build + run provider tests**

```bash
pnpm -r build 2>&1 | tail -20
pnpm --filter @openlobby/channel-telegram test 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/channels/ packages/channel-telegram/src/
git commit -m "feat(channels): populate ChannelIdentity.peerKind in Telegram and WeCom"
```

---

### Task 8: WebSocket dispatch for `agent.*` messages

**Files:**
- Modify: `packages/server/src/ws-handler.ts`

- [ ] **Step 1: Import the registry and session manager APIs**

```typescript
import type { AgentRegistry } from './agent-registry.js';
```

Pass `agentRegistry` into `handleWebSocket` — update the signature and the single call in `index.ts`.

- [ ] **Step 2: Add the new `case` branches in the message-dispatch switch**

```typescript
case 'agent.list': {
  const agents = agentRegistry.list(data.includeDeleted ?? false);
  send(socket, { type: 'agent.list', agents, includesDeleted: !!data.includeDeleted });
  break;
}

case 'agent.create': {
  try {
    const agent = agentRegistry.create(data.definition);
    broadcast({ type: 'agent.updated', agent });
  } catch (err) {
    send(socket, { type: 'error', error: (err as Error).message });
  }
  break;
}

case 'agent.update': {
  try {
    const agent = agentRegistry.update(data.id, data.patch);
    broadcast({ type: 'agent.updated', agent });
  } catch (err) {
    send(socket, { type: 'error', error: (err as Error).message });
  }
  break;
}

case 'agent.delete': {
  try {
    await sessionManager.stopAllSessionsForAgent(data.id);
    agentRegistry.softDelete(data.id);
    broadcast({ type: 'agent.deleted', id: data.id, hard: false });
    const updated = agentRegistry.get(data.id);
    if (updated) broadcast({ type: 'agent.updated', agent: updated });
  } catch (err) {
    send(socket, { type: 'error', error: (err as Error).message });
  }
  break;
}

case 'agent.recover': {
  try {
    agentRegistry.recover(data.id);
    const updated = agentRegistry.get(data.id);
    if (updated) broadcast({ type: 'agent.updated', agent: updated });
  } catch (err) {
    send(socket, { type: 'error', error: (err as Error).message });
  }
  break;
}

case 'agent.hard-delete': {
  try {
    agentRegistry.hardDelete(data.id);
    broadcast({ type: 'agent.deleted', id: data.id, hard: true });
  } catch (err) {
    send(socket, { type: 'error', error: (err as Error).message });
  }
  break;
}
```

- [ ] **Step 3: Update `channel.bind` case to accept `agentId`**

```typescript
case 'channel.bind': {
  // parse identity from data.identityKey (channelName:accountId:peerId)
  const [channelName, accountId, ...rest] = data.identityKey.split(':');
  const peerId = rest.join(':');
  const identity: ChannelIdentity = {
    channelName, accountId, peerId,
    peerKind: 'direct',                     // default for newly-created bindings
  };
  const binding = await channelRouter.bindIdentity(identity, data.target, data.agentId);
  broadcast({ type: 'channel.binding-updated', binding });
  break;
}
```

- [ ] **Step 4: Include `agentId` in every `SessionSummary` response**

In the summarizer helper (grep: `toSessionSummary` or similar), add `agentId: session.agentId`.

- [ ] **Step 5: Build**

```bash
pnpm -r build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ws-handler.ts packages/server/src/index.ts
git commit -m "feat(server): WebSocket dispatch for agent.* messages and binding.agentId"
```

---

### Task 9: Web UI — Zustand slice, AgentsPanel, AgentEditDialog

**Files:**
- Modify: `packages/web/src/stores/lobby-store.ts`
- Modify: `packages/web/src/hooks/useWebSocket.ts`
- Create: `packages/web/src/components/AgentsPanel.tsx`
- Create: `packages/web/src/components/AgentEditDialog.tsx`

- [ ] **Step 1: Add Zustand slice**

In `lobby-store.ts`:

```typescript
interface LobbyState {
  // ...existing...
  agents: AgentDefinition[];            // active only by default
  deletedAgents: AgentDefinition[];
  setAgents(active: AgentDefinition[], deleted?: AgentDefinition[]): void;
  upsertAgent(agent: AgentDefinition): void;
  removeAgent(id: string): void;
}
```

Implement the setters. When `agent.updated` arrives, put into `agents` if `deletedAt == null`, else `deletedAgents`, removing from the other array first.

- [ ] **Step 2: Add WS helpers**

```typescript
export function wsAgentList(includeDeleted = true) {
  wsSend({ type: 'agent.list', includeDeleted });
}
export function wsAgentCreate(def: /* create payload */) { wsSend({ type: 'agent.create', definition: def }); }
export function wsAgentUpdate(id: string, patch: Partial<AgentDefinition>) { wsSend({ type: 'agent.update', id, patch }); }
export function wsAgentDelete(id: string) { wsSend({ type: 'agent.delete', id }); }
export function wsAgentRecover(id: string) { wsSend({ type: 'agent.recover', id }); }
export function wsAgentHardDelete(id: string) { wsSend({ type: 'agent.hard-delete', id }); }
```

Dispatch `agent.list`, `agent.updated`, `agent.deleted` from the WS onMessage switch into the store.

- [ ] **Step 3: `AgentsPanel.tsx` — list with Active / Deleted tabs**

Minimal structure (follow ChannelManagePanel's look & feel):

```tsx
export function AgentsPanel({ onClose }: { onClose: () => void }) {
  const { agents, deletedAgents } = useLobbyStore();
  const [tab, setTab] = useState<'active' | 'deleted'>('active');
  const [editTarget, setEditTarget] = useState<AgentDefinition | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { wsAgentList(true); }, []);

  const rows = tab === 'active' ? agents : deletedAgents;

  return (
    <Drawer title="Agents" onClose={onClose}>
      <Tabs value={tab} onChange={setTab}>
        <Tab value="active">Active ({agents.length})</Tab>
        <Tab value="deleted">Deleted ({deletedAgents.length})</Tab>
      </Tabs>
      <button onClick={() => setCreating(true)}>+ New Agent</button>
      <ul>{rows.map(a => (
        <AgentRow key={a.id} agent={a}
          onEdit={() => setEditTarget(a)}
          onDelete={() => wsAgentDelete(a.id)}
          onRecover={() => wsAgentRecover(a.id)}
          onHardDelete={() => wsAgentHardDelete(a.id)}
        />
      ))}</ul>
      {(creating || editTarget) && (
        <AgentEditDialog
          agent={editTarget}
          onSubmit={(def) => {
            if (editTarget) wsAgentUpdate(editTarget.id, def);
            else wsAgentCreate(def);
            setCreating(false); setEditTarget(null);
          }}
          onClose={() => { setCreating(false); setEditTarget(null); }}
        />
      )}
    </Drawer>
  );
}
```

- [ ] **Step 4: `AgentEditDialog.tsx` — form**

Fields: `id` (disabled on edit), `displayName`, `description`, `adapter` (dropdown), `model`, `permissionMode`, `systemPrompt` (textarea), `contextFiles` (tags input), `allowedTools` (tags), `deniedTools` (tags), `groupChat.mentionPatterns` (tags) with an "enable group chat" toggle and `requireMention` checkbox.

Keep the dialog flat and simple; extensive UX polish is out of scope for this plan. The form emits a payload matching `Omit<AgentDefinition, 'createdAt'|'updatedAt'|'deletedAt'>` on create, `Partial<AgentDefinition>` on update.

- [ ] **Step 5: Build + dev-run smoke**

```bash
pnpm --filter @openlobby/web build 2>&1 | tail -15
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/stores/lobby-store.ts packages/web/src/hooks/useWebSocket.ts packages/web/src/components/AgentsPanel.tsx packages/web/src/components/AgentEditDialog.tsx
git commit -m "feat(web): Agents management panel with CRUD and soft-delete"
```

---

### Task 10: Web UI polish — Sidebar badge, RoomHeader indicator, binding dropdown, build verify

**Files:**
- Modify: `packages/web/src/components/Sidebar.tsx`
- Modify: `packages/web/src/components/RoomHeader.tsx`
- Modify: `packages/web/src/components/ChannelManagePanel.tsx`
- Modify: `packages/web/src/App.tsx` (add a button to open `AgentsPanel`)

- [ ] **Step 1: Sidebar Agent badge**

For each session row, if `session.agentId` is set, show a small pill (e.g. `🤖 Agent`) next to the adapter label. Compute `agentDisplayName` by looking up `useLobbyStore().agents.find(a => a.id === session.agentId)?.displayName`.

- [ ] **Step 2: RoomHeader — Agent label**

If `session.agentId` present, show "Agent: <displayName>" with a link that opens `AgentsPanel` scrolled to that agent. Hide the destroy button; replace with "Unbind Peer" (calls `channel.unbind` with the active binding's identityKey).

- [ ] **Step 3: ChannelManagePanel — binding target dropdown**

Add a third option "Agent" that reveals a secondary `<select>` populated from `useLobbyStore().agents`. On submit, send `channel.bind` with `agentId` set and `target: 'lobby-manager'` (the real sessionId is filled on first inbound).

- [ ] **Step 4: App-level entry point**

Add a button in Sidebar footer (near ⚙ Channels) to open the `AgentsPanel`.

- [ ] **Step 5: Full build + lint**

```bash
pnpm -r build 2>&1 | tail -20
pnpm -r test 2>&1 | tail -40
```

- [ ] **Step 6: Manual smoke (document as checklist — run after building)**

- [ ] Create an Agent "code-reviewer" with `adapter: claude-code`, `permissionMode: readonly`, `systemPrompt: "You only review code."`, `contextFiles: ['SOUL.md']`.
- [ ] Put `SOUL.md` into `~/.openlobby/agents/code-reviewer/workspace/SOUL.md` with "Be terse.".
- [ ] Bind a Telegram DM to this Agent via ChannelManagePanel.
- [ ] Send a message from Telegram — verify a new session appears in Sidebar with the Agent badge and the cwd `~/.openlobby/agents/code-reviewer/sessions/<peerHash>`.
- [ ] Send `/exit` — verify the lock message, session unchanged.
- [ ] Create a second Telegram binding to the same Agent from a second user — verify independent session with different cwd.
- [ ] Soft-delete the Agent from AgentsPanel — both sessions get killed; next Telegram inbound to either bound peer shows the removal reply.
- [ ] Recover the Agent — future inbound creates a new session.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/Sidebar.tsx packages/web/src/components/RoomHeader.tsx packages/web/src/components/ChannelManagePanel.tsx packages/web/src/App.tsx
git commit -m "feat(web): Agent session badges, binding dropdown option, Agents panel entry"
```

---

## Verification Matrix

Run after all tasks merged:

```bash
pnpm -r build
pnpm -r test
```

| Check | Command | Expected |
|---|---|---|
| Core types compile | `pnpm --filter @openlobby/core build` | 0 errors |
| DB migrations idempotent | Run `initDb()` twice in a test against an existing DB | No errors |
| AgentRegistry CRUD | `pnpm --filter @openlobby/server test agent-registry` | All pass |
| Policy enforcement | `pnpm --filter @openlobby/core test policy` | All pass |
| ChannelRouter Agent branch | `pnpm --filter @openlobby/server test channel-router-agent` | All pass |
| Full monorepo build | `pnpm -r build` | 0 errors |
| Smoke test (manual) | See Task 10, Step 6 | All steps pass |

---

## Rollback Plan

Each task is a separate commit. If a later task fails integration:
1. `git revert <task-N-sha>` for the broken task.
2. DB migrations are additive (ALTER TABLE ADD COLUMN) — reverted code simply ignores the columns; no destructive rollback needed.
3. Soft-deleted agents remain in the DB; hard-deleting via UI is destructive but confirmation-gated.

## Dependencies Between Tasks

```
T1 (types) ──┬─► T2 (db)        ──► T3 (registry) ──┐
             └─► T4 (policy)                        │
T3 ─► T5 (session-manager) ────┐                    │
T5 + T3 ──► T6 (channel-router)┘                    │
T1 ─► T7 (providers)                                │
T3 + T5 + T6 ─► T8 (ws-handler)                     │
T1 + T8 ─► T9 (web panel) ─► T10 (web polish) ──────┘
```

Can parallelize T4 with T2/T3; T7 can run alongside T5/T6. T9 and T10 must be sequential.
