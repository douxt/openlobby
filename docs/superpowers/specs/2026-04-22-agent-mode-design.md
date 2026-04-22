# Agent Mode Design

**Date:** 2026-04-22
**Status:** Approved

---

## Overview

Add an **Agent mode** to OpenLobby: a declarative way to define specialized assistants ("Agents") that are bound to specific IM channel peers and focus on a dedicated task. Each (Agent, peer) pair produces an isolated, long-lived session whose cwd, system prompt, tool whitelist, and permission mode are all derived from the Agent's definition.

**Inspired by OpenClaw's Agent model** ([docs](https://docs.openclaw.ai/concepts/multi-agent.md)): Agents are long-lived personas (not one-shot subagent delegations), bound to channel identities via a deterministic most-specific-wins matcher, and their sessions are keyed per `(agent, chat context)`.

**Key properties that differ from normal OpenLobby sessions:**
- Agent sessions are **derived** from a template, not created ad-hoc with arbitrary SpawnOptions.
- An Agent-bound channel peer **cannot switch sessions mid-conversation** — `/exit`, `/goto`, and LM routing are disabled for that peer.
- Multiple peers can bind to the same Agent template; each pair gets its own isolated session with its own cwd.
- Group-chat inbound messages respect the Agent's mention patterns (configurable per Agent).

**Contrast with existing OpenLobby concepts:**
- **LobbyManager** — a session that routes; Agent is the opposite: a session that *can't* be switched away from.
- **Normal session** — user-created via `session.create` with any options; Agent session is template-derived with fixed options.
- **Pinned session** — UI-level favorite; Agent is a **template** that can spawn many session *instances*, one per bound peer.

---

## Core Concepts

| Concept | Meaning |
|---|---|
| **AgentDefinition** | The template: id, adapter, model, system prompt, tool allow/deny lists, group-chat mention patterns, permission mode. Stored in SQLite (structured fields) + optional files (free-form `SOUL.md` / `USER.md` / `AGENTS.md` in the agent's workspace). |
| **Agent Session** | A concrete `ManagedSession` spawned from an AgentDefinition for a specific channel identity. Derives its cwd from `<agent-root>/sessions/<peerHash>/` and injects the agent's context files as `systemPrompt`. |
| **Agent Binding** | A `ChannelBinding` whose `agentId` field is set. Binding is **locked**: routing bypasses LM, `/exit` and `/goto` are rejected. |
| **Soft-delete** | Deleting an Agent is non-destructive: all derived sessions are stopped, the agent record is marked `deleted_at`, and future spawns are blocked with a user-facing message. A deleted Agent can be recovered from the Web UI. |

---

## Data Model

### AgentDefinition (new, `packages/core/src/agent.ts`)

```typescript
/** Declarative template for an Agent-mode session */
export interface AgentDefinition {
  /** Unique ID, slug-like (e.g. "code-reviewer"). Reserved: "lobby-manager". */
  id: string;

  /** Display name for UI */
  displayName: string;

  /** One-line description (shown in Web UI and in 'agent is deleted' error messages) */
  description: string;

  /** Adapter this agent must run on. 'any' = first installed adapter at spawn time. */
  adapter: 'claude-code' | 'codex-cli' | 'opencode' | 'gsd' | 'any';

  /** Inline system prompt (optional). Combined with context files at spawn time. */
  systemPrompt?: string;

  /**
   * Context files under the agent's workspace to inject as systemPrompt prefix.
   * Order matters. Each file's content is concatenated with a "\n\n---\n\n" separator.
   * OpenClaw-compatible filenames: SOUL.md, USER.md, AGENTS.md, TOOLS.md, IDENTITY.md.
   */
  contextFiles: string[];

  /** Model override (adapter-specific ID) */
  model?: string;

  /** Permission mode at spawn time */
  permissionMode?: PermissionMode;

  /** Tool allow-list. null/undefined = no restriction. */
  allowedTools?: string[];

  /** Tool deny-list. Takes precedence over allow-list. */
  deniedTools?: string[];

  /** Group-chat behavior. When omitted, agent does NOT respond in groups. */
  groupChat?: {
    /** Strings that trigger the agent in a group. Case-insensitive `includes` match. */
    mentionPatterns: string[];
    /**
     * If true, agent only responds to messages matching mentionPatterns.
     * If false, agent responds to all group messages (mentionPatterns ignored).
     * Default: true (strict).
     */
    requireMention: boolean;
  };

  /** Soft-delete marker. null/undefined = active. */
  deletedAt?: number;

  /** Timestamps */
  createdAt: number;
  updatedAt: number;
}
```

### SQLite Schema

New table `agent_definitions`:

```sql
CREATE TABLE IF NOT EXISTS agent_definitions (
  id                  TEXT PRIMARY KEY,
  display_name        TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  adapter             TEXT NOT NULL,
  system_prompt       TEXT,
  context_files_json  TEXT NOT NULL DEFAULT '[]',       -- JSON string[]
  model               TEXT,
  permission_mode     TEXT,
  allowed_tools_json  TEXT,                              -- JSON string[] or NULL
  denied_tools_json   TEXT,                              -- JSON string[] or NULL
  group_chat_json     TEXT,                              -- JSON { mentionPatterns, requireMention } or NULL
  deleted_at          INTEGER,                           -- NULL = active
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
```

Migrations (additive columns, using the project's try-catch-on-ALTER pattern):

```sql
-- sessions table: track which agent spawned this session
ALTER TABLE sessions ADD COLUMN agent_id TEXT;

-- channel_bindings: denormalize agent linkage for routing decisions
ALTER TABLE channel_bindings ADD COLUMN agent_id TEXT;
ALTER TABLE channel_bindings ADD COLUMN peer_kind TEXT DEFAULT 'direct';
```

`peer_kind` enables the group-chat mention rule without a JOIN to inbound message state.

### File Layout on Disk

```
~/.openlobby/
├── sessions.db
└── agents/
    └── <agentId>/
        ├── workspace/              # Agent's editable context files
        │   ├── SOUL.md             # Persona / tone / boundaries
        │   ├── USER.md             # User profile (optional)
        │   └── AGENTS.md           # Operating instructions (optional)
        ├── agent-dir/              # Per-agent state (reserved for future: auth profiles, MCP configs)
        └── sessions/
            ├── <peerHash1>/        # cwd for (channel:acc:peer1)
            └── <peerHash2>/        # cwd for (channel:acc:peer2)
```

Where:
- `peerHash = sha256(channelName + ":" + accountId + ":" + peerId).slice(0, 16)`
- Hash prevents filesystem-unsafe characters in peer IDs (especially Telegram chat IDs with minus signs, WeCom long IDs).

### Extended `ChannelIdentity` (new `peerKind` field)

```typescript
export interface ChannelIdentity {
  channelName: string;
  accountId: string;
  peerId: string;
  peerDisplayName?: string;
  /** NEW: required for group-chat mention logic */
  peerKind: 'direct' | 'group' | 'channel';
}
```

Each ChannelProvider must populate `peerKind` on inbound messages. Default to `'direct'` when the provider cannot distinguish (backward compatibility).

### Extended `ChannelBinding` (added `agentId`, per decision #8)

```typescript
export interface ChannelBinding {
  // ...existing fields unchanged...
  target: 'lobby-manager' | string;        // unchanged semantics
  activeSessionId: string | null;          // unchanged semantics
  /** NEW: when set, this binding is an Agent binding — treated as locked */
  agentId?: string;
  /** NEW: populated by provider on first inbound; used for mention rule */
  peerKind: 'direct' | 'group' | 'channel';
}
```

**Lock semantics are derived, not stored:** `isLocked(binding) === binding.agentId != null`. No separate `locked` column (per decision #5).

### Extended `ManagedSession`

```typescript
interface ManagedSession {
  // ...existing fields unchanged...
  /** NEW: when session was spawned from an AgentDefinition */
  agentId?: string;
}
```

---

## Agent Storage (Hybrid: SQLite + Files)

| Field | Where | Why |
|---|---|---|
| id, displayName, description, adapter, model, permissionMode, allowedTools, deniedTools, groupChat, deletedAt | SQLite `agent_definitions` | Fast indexed queries, UI edit round-trips |
| systemPrompt (inline) | SQLite | Small, common case |
| Long-form prompt fragments (SOUL.md, USER.md, AGENTS.md…) | `<agent-root>/workspace/*.md` | Editable by user with any editor, git-friendly, OpenClaw-compatible |

**`AgentRegistry`** service (new, `packages/server/src/agent-registry.ts`):
- `list({ includeDeleted?: boolean })` → `AgentDefinition[]`
- `get(id)` → `AgentDefinition | null` (returns even if soft-deleted; caller checks `deletedAt`)
- `create(def)` / `update(id, patch)` / `softDelete(id)` / `recover(id)`
- `resolveSystemPrompt(id)` → reads DB `system_prompt` + concatenates `contextFiles` content from disk. Non-existent files are skipped with a warning log.

---

## Agent Session Lifecycle

### Spawn Flow

```
ChannelRouter.handleInbound(msg)
  └─► binding = getOrCreateBinding(msg.identity)
  └─► if binding.agentId:                         ← Agent binding path
        agent = agentRegistry.get(binding.agentId)
        if agent.deletedAt:
           reply "Agent '<name>' has been removed. Contact admin." ; return
        if msg is from group AND agent.groupChat:
           if requireMention AND !mentionMatches(msg.text, agent.groupChat.mentionPatterns):
             return                               ← silent drop, no typing indicator
        session = sessionManager.getOrCreateAgentSession(agent, msg.identity)
        sessionManager.sendMessage(session.id, msg.text)
```

### `SessionManager.getOrCreateAgentSession()` (new)

```typescript
async getOrCreateAgentSession(
  agent: AgentDefinition,
  identity: ChannelIdentity,
): Promise<ManagedSession> {
  // 1. Look for existing session keyed by (agentId, identity)
  const existing = this.findAgentSession(agent.id, identity);
  if (existing) {
    if (existing.status === 'stopped' || existing.status === 'error') {
      return this.resumeSession(existing.id);    // lazy-resume
    }
    return existing;
  }

  // 2. Build per-session cwd
  const peerHash = hashIdentity(identity);
  const cwd = join(homedir(), '.openlobby', 'agents', agent.id, 'sessions', peerHash);
  mkdirSync(cwd, { recursive: true });

  // 3. Resolve system prompt from DB + context files
  const systemPrompt = await this.agentRegistry.resolveSystemPrompt(agent.id);

  // 4. Resolve adapter
  const adapterName = agent.adapter === 'any'
    ? this.firstAvailableAdapter()
    : agent.adapter;
  const adapter = this.adapters.get(adapterName);
  if (!adapter) throw new Error(`Adapter ${adapterName} not available`);

  // 5. Spawn via adapter with derived SpawnOptions
  const proc = await adapter.spawn({
    cwd,
    systemPrompt,
    model: agent.model,
    permissionMode: agent.permissionMode,
    allowedTools: agent.allowedTools,
    // deniedTools currently enforced via system prompt append — see "Tool Deny Enforcement" below
  });

  // 6. Register ManagedSession with agentId populated
  return this.registerSession({
    process: proc,
    origin: 'lobby',
    agentId: agent.id,
    displayName: `${agent.displayName} · ${identity.peerDisplayName ?? identity.peerId}`,
    cwd,
    // ...
  });
}
```

**Lookup index:** Add an in-memory `Map<"agentId:channelName:accountId:peerId", sessionId>` inside SessionManager, rebuilt on startup from DB rows where `agent_id IS NOT NULL` joined with bindings. This avoids linear scans on every inbound message.

### Session Isolation (per Decision #2 and D-1)

Each (agent, peer) pair gets a dedicated cwd under `<agent-root>/sessions/<peerHash>/`. Because Claude Code's session JSONL path is keyed by cwd (`~/.claude/projects/<encoded-cwd>/*.jsonl`) and Codex CLI writes to its own sessions directory, two peers bound to the same Agent **never** share files or conversation history.

The Agent's context files (`SOUL.md` etc.) live in `<agent-root>/workspace/` and are injected into `systemPrompt` at spawn time — they are **read-only** to the agent process (the process's cwd is `<agent-root>/sessions/<peerHash>/`, not `workspace/`). If the agent needs to write to persistent agent-level state, that's a separate feature (out of scope).

### Tool Deny Enforcement

Claude Code SDK's `canUseTool` callback and Codex's `requestApproval` both give the adapter a chance to reject tool calls before execution. Deny-list is enforced at that layer:

```typescript
// In the canUseTool / requestApproval handler:
if (session.deniedTools?.includes(toolName)) {
  return { decision: 'deny', reason: `Tool "${toolName}" is denied by Agent policy.` };
}
```

This is adapter-shared logic — add a helper `enforceToolPolicy(toolName, policy)` in `packages/core/src/adapters/policy.ts` and call it from each adapter's approval handler.

---

## Channel Routing & Binding

### Routing Decision (updated `ChannelRouter.handleInbound`)

```
1. Normalize identity (with peerKind from provider)
2. binding = getBinding(identityKey)
3. If binding.agentId is set:
     → AGENT PATH (see "Spawn Flow" above)
     → /exit, /goto, LM routing are REJECTED with a friendly reply
4. Else if binding.target === 'lobby-manager':
     → existing LM path (unchanged)
5. Else:
     → existing direct-session path (unchanged)
```

### Slash-command rejection in Agent path

```typescript
// In ChannelRouter.handleInbound, after resolving binding:
if (binding.agentId) {
  const cmd = parseSlashCommand(msg.text);
  if (cmd === '/exit' || cmd === '/goto' || cmd === '/add') {
    await this.reply(msg.identity,
      `This chat is bound to Agent "${agent.displayName}" and cannot switch sessions. ` +
      `Use the OpenLobby Web UI to change or unbind.`);
    return;
  }
  // fall through to Agent spawn/forward
}
```

### Creating an Agent Binding

Web UI → `channel.bind` message with `agentId` field:

```typescript
// Before: C → S
| { type: 'channel.bind'; identity: ChannelIdentity; target: 'lobby-manager' | string }
// After:
| { type: 'channel.bind';
    identity: ChannelIdentity;
    target: 'lobby-manager' | string;
    agentId?: string;                  // NEW
  }
```

Server-side validation: if `agentId` is set, `target` must be the special value `'lobby-manager'` at bind time (the real sessionId is assigned lazily on first inbound). On first inbound, `active_session_id` and `target = <sessionId>` are filled in.

Alternative: allow pre-spawning via a new `agent.prewarm-session` message if user wants to send a first prompt from the Web UI — see Open Decisions.

### Unbinding an Agent Binding

`channel.unbind` behaves as today: delete the row. The derived session is *not* destroyed — it remains in the session list, now unbound, and the user can choose to keep it, destroy it manually, or re-bind to something else.

---

## Group-Chat Mention Rules (per Decision #6 and D-3)

Two conditions must hold for an Agent to respond in a group chat:

1. `binding.peerKind !== 'direct'` (inbound is from a group or channel)
2. Either:
   - `agent.groupChat` is set AND `agent.groupChat.requireMention === false`, or
   - `agent.groupChat` is set AND any `mentionPatterns` appears in `msg.text` (case-insensitive substring match).

If `agent.groupChat` is `undefined`, the agent **does not respond in group chats at all** (strict default). This is the OpenClaw-aligned safe default.

Implementation in `ChannelRouter`:

```typescript
function shouldRespondInGroup(agent: AgentDefinition, msg: InboundChannelMessage): boolean {
  if (msg.identity.peerKind === 'direct') return true;
  const gc = agent.groupChat;
  if (!gc) return false;                     // strict default
  if (!gc.requireMention) return true;
  const lower = msg.text.toLowerCase();
  return gc.mentionPatterns.some(p => lower.includes(p.toLowerCase()));
}
```

### Provider Work Needed

Each ChannelProvider implementation must populate `peerKind`:

| Provider | Detection |
|---|---|
| Telegram | `update.message.chat.type` — `'private'` → `direct`, `'group'`/`'supergroup'` → `group`, `'channel'` → `channel` |
| WeCom | Chat type field in incoming webhook payload |
| (Future) Feishu | Similar mapping |

This is a small, per-provider change; see *Files Changed*.

---

## Soft-Delete & Recovery (per Decision #7)

### Delete flow

```
agentRegistry.softDelete(agentId):
  1. Get all ManagedSession with agent_id === agentId
  2. For each: sessionManager.destroySession(sessionId)     ← kills process + marks stopped
  3. UPDATE agent_definitions SET deleted_at = NOW WHERE id = ?
  4. Broadcast 'agent.updated' to all clients
```

`destroySession` already resets bindings via `resetBindingTargetBySession` — that function needs an update to also clear `agent_id` (otherwise bindings keep pointing at a deleted agent).

### Spawn-blocked reply

When any subsequent inbound message hits a binding whose `agent_id` points at a deleted agent:

```
binding.agentId = "support-bot"
agent.deletedAt = 1729632000000   → deleted

reply:
"🚫 Agent 'Support Bot' has been removed. Ask an admin to recover it,
or use /exit (blocked for now — please contact admin in Web UI)."
```

The binding row is **kept** (not deleted), so recovery is a one-click UI action.

### Recover flow

```
agentRegistry.recover(agentId):
  1. UPDATE agent_definitions SET deleted_at = NULL WHERE id = ?
  2. Broadcast 'agent.updated'
  3. Do NOT auto-respawn sessions — let the next inbound trigger getOrCreateAgentSession
```

### UI surface

Web UI Agent panel has two tabs: **Active** and **Deleted**. Deleted tab shows greyed-out cards with a "Recover" button. Deleted agents can also be permanently purged (hard-delete) with a destructive confirmation — this also destroys orphaned bindings.

---

## WebSocket Protocol Additions

### Client → Server

```typescript
// List all agents (optionally include deleted)
| { type: 'agent.list'; includeDeleted?: boolean }

// Create/update/delete/recover
| { type: 'agent.create'; definition: Omit<AgentDefinition, 'createdAt' | 'updatedAt' | 'deletedAt'> }
| { type: 'agent.update'; id: string; patch: Partial<AgentDefinition> }
| { type: 'agent.delete'; id: string }              // soft delete
| { type: 'agent.recover'; id: string }
| { type: 'agent.hard-delete'; id: string }         // permanent, only if already soft-deleted

// Pre-warm a session (optional, see Open Decisions)
| { type: 'agent.prewarm-session'; agentId: string; identity: ChannelIdentity }

// Existing channel.bind extended
| { type: 'channel.bind';
    identity: ChannelIdentity;
    target: 'lobby-manager' | string;
    agentId?: string;                                // NEW
  }
```

### Server → Client

```typescript
| { type: 'agent.list'; agents: AgentDefinition[]; includesDeleted: boolean }
| { type: 'agent.updated'; agent: AgentDefinition }   // create / update / recover
| { type: 'agent.deleted'; id: string; hard: boolean }

// Existing session.updated now carries agentId in the SessionSummary when applicable
```

`SessionSummary` gains an optional `agentId` field so the frontend can render Agent badges on sessions.

---

## Web UI Changes (MVP wireframe, details in implementation plan)

### Sidebar
- Agent sessions get a small badge showing the Agent's name + emoji (if set).
- Sessions bound via Agent binding are grouped under their Agent in a collapsible section (optional — fine to leave flat for MVP).

### New "Agents" panel (reuse ChannelManagePanel pattern)
- Accessed via a sidebar button (⚙ icon or similar).
- Two tabs: **Active** / **Deleted**.
- List of Agents with: name, description, adapter, model, permissionMode summary, tool count, bindings count.
- "New Agent" button → form with all AgentDefinition fields.
- Per-row actions: Edit · Delete · View Bindings · Duplicate.

### Channel bindings
- When creating a binding in ChannelManagePanel, target dropdown gains a third option:
  - Lobby Manager
  - Specific session
  - **Agent** (reveals Agent dropdown)

### Session view
- Agent-session headers show the source agent name and a link "View Agent definition".
- For Agent sessions, disable the "Destroy" button in favor of "Unbind peer" (destroying an agent session breaks the binding; deletion should go through the Agents panel).

---

## Data Flow (Agent inbound message)

```
[Telegram] Group message arrives with text "@support-bot help me reset my password"
         │
         ▼ TelegramProvider.handleUpdate()
[Provider] populate peerKind='group'; construct InboundChannelMessage
         │
         ▼ channelRouter.handleInbound(msg)
[Router] binding = getBinding(identityKey)
         binding.agentId = "support-bot"
         agent = agentRegistry.get("support-bot")   → active
         shouldRespondInGroup(agent, msg) → pattern "@support-bot" matches → true
         │
         ▼ sessionManager.getOrCreateAgentSession(agent, identity)
[SM]     No existing session → mkdir <root>/agents/support-bot/sessions/<peerHash>
         resolve systemPrompt = "[system_prompt]\n\n---\n\n<SOUL.md>\n\n---\n\n<USER.md>"
         adapter.spawn({ cwd, systemPrompt, model, permissionMode, allowedTools })
         register ManagedSession with agentId="support-bot"
         update binding: target=<sessionId>, active_session_id=<sessionId>
         │
         ▼ sessionManager.sendMessage(sessionId, "@support-bot help me reset my password")
[Adapter] forwards to CLI subprocess
         │
         ▼ assistant output streams back via LobbyMessage events
[Router] onMessage → format and send OutboundChannelMessage to Telegram group
```

---

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/agent.ts` | **NEW** — `AgentDefinition` type |
| `packages/core/src/index.ts` | Re-export `AgentDefinition`; add `PermissionMode` usage |
| `packages/core/src/channel.ts` | Add `peerKind` to `ChannelIdentity`; add `agentId` to `ChannelBinding`; update inbound/outbound types if needed |
| `packages/core/src/protocol.ts` | Add `agent.*` client/server message variants; extend `channel.bind` with `agentId` |
| `packages/core/src/adapters/policy.ts` | **NEW** — shared `enforceToolPolicy(toolName, { allowedTools, deniedTools })` helper |
| `packages/core/src/adapters/claude-code.ts` | Call `enforceToolPolicy` inside `canUseTool` |
| `packages/core/src/adapters/codex-cli.ts` | Call `enforceToolPolicy` inside `requestApproval` |
| `packages/core/src/adapters/opencode.ts` | Call `enforceToolPolicy` inside `handlePermissionUpdated` |
| `packages/core/src/adapters/gsd.ts` | Same |
| `packages/server/src/db.ts` | Create `agent_definitions` table; add `agent_id` to sessions, `agent_id` + `peer_kind` to channel_bindings; add CRUD helpers |
| `packages/server/src/agent-registry.ts` | **NEW** — AgentRegistry service |
| `packages/server/src/session-manager.ts` | `getOrCreateAgentSession()`, `findAgentSession()`, agent-session in-memory index, cascade soft-delete |
| `packages/server/src/channel-router.ts` | Agent-routing branch; mention-rule enforcement; slash-command rejection |
| `packages/server/src/ws-handler.ts` | Handle `agent.*` client messages |
| `packages/server/src/channels/telegram.ts` | Populate `peerKind` from `chat.type` |
| `packages/server/src/channels/wecom.ts` | Populate `peerKind` from WeCom chat type field |
| `packages/channel-telegram/src/telegram-provider.ts` | Same as server/channels/telegram (mirror change) |
| `packages/web/src/stores/lobby-store.ts` | Agent slice: agents map, CRUD actions |
| `packages/web/src/components/AgentsPanel.tsx` | **NEW** — Agents management panel |
| `packages/web/src/components/AgentEditDialog.tsx` | **NEW** — New/Edit form |
| `packages/web/src/components/ChannelManagePanel.tsx` | Add Agent option in binding target dropdown |
| `packages/web/src/components/Sidebar.tsx` | Agent badge rendering; "Agents" button |
| `packages/web/src/components/RoomHeader.tsx` | Agent-session indicator |
| `packages/web/src/hooks/useWebSocket.ts` | `wsAgentList`, `wsAgentCreate`, `wsAgentUpdate`, `wsAgentDelete`, `wsAgentRecover`, `wsAgentHardDelete` helpers |

---

## Out of Scope (this spec)

- MCP tools for Agent management (`lobby_spawn_agent_session`, `lobby_list_agents`, etc.) — phase 2.
- Per-agent auth profile / MCP config in `agent-dir/` — directory is created but unused; will be filled by a later spec if needed.
- Multi-match matchers (guildId / teamId / roles / parent-peer thread inheritance) — OpenClaw has them, but OpenLobby's binding model only needs `(channel, accountId, peer)` per Decision #3.
- Editing context files (`SOUL.md` etc.) inside the Web UI — MVP shows the file paths; users edit with their own editor. Inline markdown editing can come later.
- Copying context files into per-session cwd — they live in `<agent-root>/workspace/` and are only injected via `systemPrompt`.
- "Broadcast" Agent that posts to multiple peers on a timer — not an Agent feature, would be a separate scheduler.
- Hard-coded mention-pattern matching beyond case-insensitive substring (regex, word-boundary, @mention-entity-based) — add later if users ask.

---

## Open Decisions (flag for review)

| # | Question | Proposed default |
|---|---|---|
| D-A | Should `agent.prewarm-session` exist in MVP, so a user can kick off an Agent session from Web UI before any IM inbound? | **No**. First inbound creates the session. Simpler data flow. |
| D-B | Should the Agent session's `displayName` include the peer's displayName, or just the Agent name? | Include peer: `"Support Bot · Alice"`. Avoids "5 identical Support Bot rows". |
| D-C | `peerHash` length — 16 hex chars (~64 bits) enough? Collision probability is negligible for realistic user counts. | **16 hex chars**. |
| D-D | On soft-delete, do we also destroy the derived sessions' JSONL files on disk? | **No**. Preserve all session history; only mark the DB row stopped. Keeps OpenLobby's "CLI is source of truth" invariant. |
| D-E | Should the Agent `id` be user-editable after creation? | **No**. Id is the stable reference in bindings; renaming breaks them. Allow displayName edits instead. |

---

## Open Risks

1. **`peerKind` backfill** — existing bindings in production DBs have no `peer_kind`. Default to `'direct'` via column default. For existing Agent-less bindings this is fine; Agent rules only trigger when a binding is re-created with Agent mode.
2. **Context-file read cost** — `resolveSystemPrompt` reads files on every spawn. For MVP, reading once per (agent, peer) session creation is negligible. Add a cached-with-mtime lookup later if it becomes a hotspot.
3. **Adapter-tool-name mismatch** — `allowedTools` / `deniedTools` use adapter-specific tool names. We need to document per-adapter tool-name conventions in the Web UI's Agent edit form (tooltip with a link to each adapter's tool list).
4. **`'any'` adapter resolution** — if the first installed adapter changes between server restarts, existing Agent sessions keep using the adapter they were spawned with (stored in `sessions.adapter_name`). New sessions pick the current first-available. Document this explicitly in Agent edit UI.
5. **Provider schema changes** — adding `peerKind` to `ChannelIdentity` is a breaking type change for any external ChannelProvider plugin. Mitigation: provide a default of `'direct'` in the deserializer; plugin authors opt in by populating it.
