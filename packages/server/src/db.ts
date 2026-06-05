import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface SessionRow {
  id: string;
  adapter_name: string;
  display_name: string | null;
  cwd: string;
  jsonl_path: string | null;
  origin: string;
  status: string;
  created_at: number;
  last_active_at: number;
  model: string | null;
  tags: string | null;
  permission_mode: string | null;
  message_mode: string | null;
  pinned: number;
  agent_id: string | null;
}

export function initDb(dbPath?: string): Database.Database {
  const dir = dbPath
    ? join(dbPath, '..')
    : join(homedir(), '.openlobby');
  mkdirSync(dir, { recursive: true });

  const fullPath = dbPath ?? join(dir, 'sessions.db');
  const db = new Database(fullPath);

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      adapter_name  TEXT NOT NULL,
      display_name  TEXT,
      cwd           TEXT NOT NULL,
      jsonl_path    TEXT,
      origin        TEXT DEFAULT 'lobby',
      status        TEXT DEFAULT 'idle',
      created_at    INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      model         TEXT,
      tags          TEXT
    )
  `);

  // Migration: add permission_mode column if not exists
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN permission_mode TEXT`);
  } catch {
    // Column already exists — ignore
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_providers (
      id            TEXT PRIMARY KEY,
      channel_name  TEXT NOT NULL,
      account_id    TEXT NOT NULL,
      config_json   TEXT NOT NULL,
      enabled       INTEGER DEFAULT 1,
      created_at    INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_bindings (
      identity_key       TEXT PRIMARY KEY,
      channel_name       TEXT NOT NULL,
      account_id         TEXT NOT NULL,
      peer_id            TEXT NOT NULL,
      peer_display_name  TEXT,
      target             TEXT NOT NULL,
      active_session_id  TEXT,
      created_at         INTEGER NOT NULL,
      last_active_at     INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_binding_active_session
      ON channel_bindings(active_session_id)
      WHERE active_session_id IS NOT NULL
  `);

  // Account-level Agent bindings: one Agent per (channelName, accountId).
  // Mutually exclusive with peer-level rows in channel_bindings — enforced
  // at the API layer (channel-router.ts), not by a DB constraint.
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_account_bindings (
      channel_name   TEXT NOT NULL,
      account_id     TEXT NOT NULL,
      agent_id       TEXT NOT NULL,
      created_at     INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      PRIMARY KEY (channel_name, account_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS session_commands (
      session_id   TEXT PRIMARY KEY,
      commands_json TEXT NOT NULL,
      updated_at   INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS adapter_plugins (
      name          TEXT PRIMARY KEY,
      package_name  TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      enabled       INTEGER DEFAULT 1,
      created_at    INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS server_config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS adapter_defaults (
      adapter_name    TEXT PRIMARY KEY,
      permission_mode TEXT NOT NULL DEFAULT 'supervised'
    )
  `);

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
      agent_scripts_json  TEXT NOT NULL DEFAULT '[]',
      deleted_at          INTEGER,
      created_at          INTEGER NOT NULL,
      updated_at          INTEGER NOT NULL
    )
  `);

  // Migration: add agent_scripts_json column if not exists
  try {
    db.exec(`ALTER TABLE agent_definitions ADD COLUMN agent_scripts_json TEXT NOT NULL DEFAULT '[]'`);
  } catch {
    // Column already exists — ignore
  }

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

  // Migration: convert old CLI-specific permission_mode values to unified enum
  db.exec(`
    UPDATE sessions SET permission_mode = 'auto'
      WHERE permission_mode IN ('bypassPermissions', 'dontAsk');
    UPDATE sessions SET permission_mode = 'readonly'
      WHERE permission_mode = 'plan';
    UPDATE sessions SET permission_mode = NULL
      WHERE permission_mode IN ('default', '');
  `);

  // Migration: add message_mode column if not exists
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN message_mode TEXT DEFAULT 'msg-tidy'`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: add pinned column if not exists
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists — ignore
  }

  return db;
}

export function upsertSession(db: Database.Database, row: SessionRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO sessions
      (id, adapter_name, display_name, cwd, jsonl_path, origin, status, created_at, last_active_at, model, tags, permission_mode, message_mode, pinned, agent_id)
    VALUES
      (@id, @adapter_name, @display_name, @cwd, @jsonl_path, @origin, @status, @created_at, @last_active_at, @model, @tags, @permission_mode, @message_mode, @pinned, @agent_id)
  `).run(row);
}

export function getSession(db: Database.Database, id: string): SessionRow | undefined {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
}

export function getAllSessions(db: Database.Database): SessionRow[] {
  return db.prepare('SELECT * FROM sessions ORDER BY last_active_at DESC').all() as SessionRow[];
}

export function deleteSession(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function getSessionByOrigin(db: Database.Database, origin: string): SessionRow | undefined {
  return db.prepare(
    'SELECT * FROM sessions WHERE origin = ? ORDER BY last_active_at DESC LIMIT 1',
  ).get(origin) as SessionRow | undefined;
}

/** Mark all running/awaiting sessions as stopped on startup (processes are gone) */
export function markAllSessionsStopped(db: Database.Database): void {
  db.prepare(
    `UPDATE sessions SET status = 'stopped' WHERE status IN ('running', 'awaiting_approval', 'idle')`,
  ).run();
}

export function updateSessionDisplayName(
  db: Database.Database,
  id: string,
  displayName: string,
): void {
  db.prepare('UPDATE sessions SET display_name = ? WHERE id = ?').run(displayName, id);
}

export function updateSessionPinned(
  db: Database.Database,
  id: string,
  pinned: boolean,
): void {
  db.prepare('UPDATE sessions SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
}

export function updateSessionStatus(
  db: Database.Database,
  id: string,
  status: string,
  lastActiveAt: number,
): void {
  db.prepare('UPDATE sessions SET status = ?, last_active_at = ? WHERE id = ?').run(
    status,
    lastActiveAt,
    id,
  );
}

// ─── Channel Providers ───────────────────────────────────────────────

export interface ChannelProviderRow {
  id: string;
  channel_name: string;
  account_id: string;
  config_json: string;
  enabled: number;
  created_at: number;
}

export function upsertProvider(db: Database.Database, row: ChannelProviderRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO channel_providers
      (id, channel_name, account_id, config_json, enabled, created_at)
    VALUES
      (@id, @channel_name, @account_id, @config_json, @enabled, @created_at)
  `).run(row);
}

export function getProvider(db: Database.Database, id: string): ChannelProviderRow | undefined {
  return db.prepare('SELECT * FROM channel_providers WHERE id = ?').get(id) as ChannelProviderRow | undefined;
}

export function getAllProviders(db: Database.Database): ChannelProviderRow[] {
  return db.prepare('SELECT * FROM channel_providers ORDER BY created_at DESC').all() as ChannelProviderRow[];
}

export function deleteProvider(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM channel_providers WHERE id = ?').run(id);
}

export function toggleProvider(db: Database.Database, id: string, enabled: boolean): void {
  db.prepare('UPDATE channel_providers SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

// ─── Channel Bindings ────────────────────────────────────────────────

export interface ChannelBindingRow {
  identity_key: string;
  channel_name: string;
  account_id: string;
  peer_id: string;
  peer_display_name: string | null;
  peer_kind: string;
  target: string;
  active_session_id: string | null;
  agent_id: string | null;
  created_at: number;
  last_active_at: number;
}

export function upsertBinding(db: Database.Database, row: ChannelBindingRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO channel_bindings
      (identity_key, channel_name, account_id, peer_id, peer_display_name, peer_kind, target, active_session_id, agent_id, created_at, last_active_at)
    VALUES
      (@identity_key, @channel_name, @account_id, @peer_id, @peer_display_name, @peer_kind, @target, @active_session_id, @agent_id, @created_at, @last_active_at)
  `).run(row);
}

export function getBinding(db: Database.Database, identityKey: string): ChannelBindingRow | undefined {
  return db.prepare('SELECT * FROM channel_bindings WHERE identity_key = ?').get(identityKey) as ChannelBindingRow | undefined;
}

export function getBindingBySession(db: Database.Database, sessionId: string): ChannelBindingRow | undefined {
  return db.prepare('SELECT * FROM channel_bindings WHERE active_session_id = ?').get(sessionId) as ChannelBindingRow | undefined;
}

export function getAllBindingsBySession(db: Database.Database, sessionId: string): ChannelBindingRow[] {
  return db.prepare('SELECT * FROM channel_bindings WHERE active_session_id = ?').all(sessionId) as ChannelBindingRow[];
}

export function getAllBindings(db: Database.Database): ChannelBindingRow[] {
  return db.prepare('SELECT * FROM channel_bindings ORDER BY last_active_at DESC').all() as ChannelBindingRow[];
}

export function deleteBinding(db: Database.Database, identityKey: string): void {
  db.prepare('DELETE FROM channel_bindings WHERE identity_key = ?').run(identityKey);
}

export function updateBindingActiveSession(
  db: Database.Database,
  identityKey: string,
  activeSessionId: string | null,
): void {
  db.prepare('UPDATE channel_bindings SET active_session_id = ?, last_active_at = ? WHERE identity_key = ?').run(
    activeSessionId,
    Date.now(),
    identityKey,
  );
}

export function updateBindingActivity(db: Database.Database, identityKey: string): void {
  db.prepare('UPDATE channel_bindings SET last_active_at = ? WHERE identity_key = ?').run(
    Date.now(),
    identityKey,
  );
}

// ─── Channel Account Bindings (account-level Agent routing) ───────────

export interface ChannelAccountBindingRow {
  channel_name: string;
  account_id: string;
  agent_id: string;
  created_at: number;
  last_active_at: number;
}

export function upsertAccountBinding(
  db: Database.Database,
  row: ChannelAccountBindingRow,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO channel_account_bindings
      (channel_name, account_id, agent_id, created_at, last_active_at)
    VALUES
      (@channel_name, @account_id, @agent_id, @created_at, @last_active_at)
  `).run(row);
}

export function getAccountBinding(
  db: Database.Database,
  channelName: string,
  accountId: string,
): ChannelAccountBindingRow | undefined {
  return db.prepare(
    'SELECT * FROM channel_account_bindings WHERE channel_name = ? AND account_id = ?',
  ).get(channelName, accountId) as ChannelAccountBindingRow | undefined;
}

export function getAllAccountBindings(db: Database.Database): ChannelAccountBindingRow[] {
  return db
    .prepare('SELECT * FROM channel_account_bindings ORDER BY last_active_at DESC')
    .all() as ChannelAccountBindingRow[];
}

export function deleteAccountBinding(
  db: Database.Database,
  channelName: string,
  accountId: string,
): void {
  db.prepare(
    'DELETE FROM channel_account_bindings WHERE channel_name = ? AND account_id = ?',
  ).run(channelName, accountId);
}

export function updateAccountBindingActivity(
  db: Database.Database,
  channelName: string,
  accountId: string,
): void {
  db.prepare(
    'UPDATE channel_account_bindings SET last_active_at = ? WHERE channel_name = ? AND account_id = ?',
  ).run(Date.now(), channelName, accountId);
}

/**
 * Mutual-exclusivity check: list all peer-level rows under a given
 * (channel, account) that would conflict with creating an account-level
 * Agent binding. Callers use this to reject the bind request and surface
 * the conflicting rows to the user.
 */
export function getPeerBindingsForAccount(
  db: Database.Database,
  channelName: string,
  accountId: string,
): ChannelBindingRow[] {
  return db.prepare(
    'SELECT * FROM channel_bindings WHERE channel_name = ? AND account_id = ?',
  ).all(channelName, accountId) as ChannelBindingRow[];
}

export function clearBindingsBySession(db: Database.Database, sessionId: string): void {
  db.prepare('UPDATE channel_bindings SET active_session_id = NULL WHERE active_session_id = ?').run(sessionId);
}

export function resetBindingTargetBySession(db: Database.Database, sessionId: string): void {
  db.prepare(
    `UPDATE channel_bindings SET target = 'lobby-manager', active_session_id = NULL, agent_id = NULL WHERE target = ? OR active_session_id = ?`,
  ).run(sessionId, sessionId);
}

// ─── Session Commands Cache ─────────────────────────────────────────

export interface SessionCommandRow {
  session_id: string;
  commands_json: string;
  updated_at: number;
}

export function getSessionCommands(db: Database.Database, sessionId: string): SessionCommandRow | undefined {
  return db.prepare('SELECT * FROM session_commands WHERE session_id = ?').get(sessionId) as SessionCommandRow | undefined;
}

export function upsertSessionCommands(db: Database.Database, sessionId: string, commandsJson: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO session_commands (session_id, commands_json, updated_at)
    VALUES (?, ?, ?)
  `).run(sessionId, commandsJson, Date.now());
}

export function deleteSessionCommands(db: Database.Database, sessionId: string): void {
  db.prepare('DELETE FROM session_commands WHERE session_id = ?').run(sessionId);
}

// ─── Adapter Plugins ────────────────────────────────────────────────

export interface AdapterPluginRow {
  name: string;
  package_name: string;
  display_name: string;
  enabled: number;
  created_at: number;
}

export function getAllAdapterPlugins(db: Database.Database): AdapterPluginRow[] {
  return db.prepare('SELECT * FROM adapter_plugins ORDER BY created_at').all() as AdapterPluginRow[];
}

export function upsertAdapterPlugin(db: Database.Database, row: AdapterPluginRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO adapter_plugins (name, package_name, display_name, enabled, created_at)
    VALUES (@name, @package_name, @display_name, @enabled, @created_at)
  `).run(row);
}

export function deleteAdapterPlugin(db: Database.Database, name: string): void {
  db.prepare('DELETE FROM adapter_plugins WHERE name = ?').run(name);
}

export function toggleAdapterPlugin(db: Database.Database, name: string, enabled: boolean): void {
  db.prepare('UPDATE adapter_plugins SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name);
}

// ─── Server Config ──────────────────────────────────────────────────

export function getServerConfig(db: Database.Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM server_config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setServerConfig(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)').run(key, value);
}

// ─── Adapter Defaults ────────────────────────────────────────────────

export interface AdapterDefaultRow {
  adapter_name: string;
  permission_mode: string;
}

export function getAdapterDefault(db: Database.Database, adapterName: string): AdapterDefaultRow | undefined {
  return db.prepare('SELECT * FROM adapter_defaults WHERE adapter_name = ?').get(adapterName) as AdapterDefaultRow | undefined;
}

export function setAdapterDefault(db: Database.Database, adapterName: string, permissionMode: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO adapter_defaults (adapter_name, permission_mode)
    VALUES (?, ?)
  `).run(adapterName, permissionMode);
}

export function getAllAdapterDefaults(db: Database.Database): AdapterDefaultRow[] {
  return db.prepare('SELECT * FROM adapter_defaults ORDER BY adapter_name').all() as AdapterDefaultRow[];
}

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
  agent_scripts_json: string;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export function upsertAgentDefinition(db: Database.Database, row: AgentDefinitionRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO agent_definitions
      (id, display_name, description, adapter, system_prompt, context_files_json, model, permission_mode, allowed_tools_json, denied_tools_json, group_chat_json, agent_scripts_json, deleted_at, created_at, updated_at)
    VALUES
      (@id, @display_name, @description, @adapter, @system_prompt, @context_files_json, @model, @permission_mode, @allowed_tools_json, @denied_tools_json, @group_chat_json, @agent_scripts_json, @deleted_at, @created_at, @updated_at)
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

/**
 * One-shot migration that lifts pre-account-binding peer-level Agent rows
 * (channel_bindings.agent_id IS NOT NULL) up into channel_account_bindings.
 *
 * Idempotent:
 *   - rows are grouped by (channel_name, account_id); the agent_id used is
 *     the most-recently-active one in each group;
 *   - if a target account binding already exists, the peer rows are removed
 *     without changing the existing binding;
 *   - on a fresh DB or after a previous run, the function is a no-op.
 *
 * Returns a tiny summary the caller can log/print.
 */
export interface LegacyAgentBindingMigrationResult {
  /** Number of peer rows that had an agent_id BEFORE the migration ran. */
  legacyRows: number;
  /** Number of (channel, account) groups that produced a new account binding. */
  promoted: number;
  /** Number of (channel, account) groups that already had an account binding. */
  skipped: number;
  /** Distinct conflict groups (>1 agent_id under one (channel, account)). */
  warnedConflicts: number;
}

export function migrateLegacyAgentBindings(
  db: Database.Database,
): LegacyAgentBindingMigrationResult {
  const legacyRows = db
    .prepare(`SELECT * FROM channel_bindings WHERE agent_id IS NOT NULL`)
    .all() as ChannelBindingRow[];

  if (legacyRows.length === 0) {
    return { legacyRows: 0, promoted: 0, skipped: 0, warnedConflicts: 0 };
  }

  // Group by (channel_name, account_id) — within a group, prefer the agent_id
  // from the row with the largest last_active_at.
  interface Bucket {
    channel: string;
    account: string;
    winner: ChannelBindingRow;
    distinctAgentIds: Set<string>;
    identityKeys: string[];
  }
  const buckets = new Map<string, Bucket>();
  for (const row of legacyRows) {
    const key = `${row.channel_name}:${row.account_id}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        channel: row.channel_name,
        account: row.account_id,
        winner: row,
        distinctAgentIds: new Set<string>([row.agent_id!]),
        identityKeys: [row.identity_key],
      };
      buckets.set(key, bucket);
    } else {
      bucket.identityKeys.push(row.identity_key);
      bucket.distinctAgentIds.add(row.agent_id!);
      if (row.last_active_at > bucket.winner.last_active_at) {
        bucket.winner = row;
      }
    }
  }

  let promoted = 0;
  let skipped = 0;
  let warnedConflicts = 0;

  const tx = db.transaction(() => {
    for (const bucket of buckets.values()) {
      if (bucket.distinctAgentIds.size > 1) {
        warnedConflicts++;
        console.warn(
          `[migration] (${bucket.channel}:${bucket.account}) had ${bucket.distinctAgentIds.size} distinct Agent bindings; picking the most-recently-active "${bucket.winner.agent_id}".`,
        );
      }
      const existing = getAccountBinding(db, bucket.channel, bucket.account);
      if (existing) {
        // Caller has already set an account binding for this tuple — leave
        // it alone and just drop the legacy peer rows.
        skipped++;
      } else {
        upsertAccountBinding(db, {
          channel_name: bucket.channel,
          account_id: bucket.account,
          agent_id: bucket.winner.agent_id!,
          created_at: bucket.winner.created_at,
          last_active_at: bucket.winner.last_active_at,
        });
        promoted++;
      }
      // Drop the migrated peer rows regardless — they cannot coexist with an
      // account-level Agent binding under the new mutual-exclusivity rule.
      const del = db.prepare(`DELETE FROM channel_bindings WHERE identity_key = ?`);
      for (const ik of bucket.identityKeys) del.run(ik);
    }
    // Defense in depth: nuke ANY remaining peer rows with agent_id set, even
    // if they somehow escape the bucket loop. Agent routing is account-level
    // now; a peer row with agent_id is by definition stale and cannot route.
    const sweep = db.prepare(`DELETE FROM channel_bindings WHERE agent_id IS NOT NULL`).run();
    if (sweep.changes > 0) {
      console.warn(
        `[migration] Swept ${sweep.changes} extra peer rows with stale agent_id outside the promote buckets.`,
      );
    }
  });
  tx();

  if (promoted + skipped > 0) {
    console.log(
      `[migration] Promoted ${promoted} peer-level Agent bindings to account-level (${skipped} already had account bindings, ${warnedConflicts} conflict groups).`,
    );
  }

  return { legacyRows: legacyRows.length, promoted, skipped, warnedConflicts };
}
