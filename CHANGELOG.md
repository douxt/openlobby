# Changelog

## v0.6.1 (2026-05-13)

Patch release on top of v0.6.0: quote-context handling for IM messages goes from "partially working for text-only" to "properly structured across all message kinds", and Codex CLI top-level errors no longer disappear silently.

### Features
- **Structured quote context for inbound IM messages** (48394e2) — when a user @s the bot in reply to an earlier message, the agent now sees the quoted text wrapped in a clearly delimited block (`[被引用消息 · sender · time] … [引用结束]`) instead of a markdown blockquote prefix that LLMs frequently mis-attribute as part of the current instruction.
  - New `ChannelQuote` interface in core with `senderDisplayName` and `mediaType` (`text` / `image` / `voice` / `file`).
  - New `formatInboundTextWithQuote(text, quote)` helper applied once at the top of `ChannelRouter.handleInbound`, so account-bound Agent path, peer-level session path, slash commands and LM fallback all see the same formatted text.
  - WeCom: quote parsing extended to **voice / image / mixed** message kinds (was text-only) — replying with a photo or voice no longer silently drops context.
  - Telegram: `reply_to_message` now captures display name (`first_name [last_name]` with `username` fallback) and media type. Media-only replies (photo / voice / document) get a `[图片] / [语音] / [文件]` placeholder instead of being dropped.

### Bug Fixes
- **Tolerate non-string quote payloads from WeCom** (a39d439) — WeCom occasionally sends `body.text.content` or `body.quote.content` as an array or object when the quoted message itself was rich/mixed. The previous code crashed with `TypeError: (quote.text ?? "").trim is not a function` (message silently dropped) or surfaced `[object Object]` to the agent. `parseQuoteMessage` and `formatInboundTextWithQuote` now coerce defensively: strings pass through, arrays/objects are flattened to text where possible, and an empty result falls through to the media-type placeholder.
- **Surface Codex CLI top-level `error` notifications** (4e46171) — relay / capacity errors like `serverOverloaded` (and any other JSON-RPC `method: 'error'`) used to hit the adapter's default branch, log one line, and leave the session stuck in `running` with no user-visible message. Now they emit a `result` `LobbyMessage` with `meta.isError`, carrying `code` (`codexErrorInfo`), `willRetry`, and the original message; when `willRetry === false` the process drops back to `idle` so the user can prompt again. Includes 4 regression tests in core. Thanks to @kkkkk1k1 (PR #11) for the diagnosis and tests.

### Closed PRs
- **PR #10** — preserved-quote-context fix: superseded by 48394e2 + a39d439 (structured format covers the same cases more robustly).
- **PR #11** — Codex error surface: single substantive commit cherry-picked as 4e46171; the branch's older base would have rolled back the v0.6.1 quote work, so the PR was closed rather than merged.

## v0.6.0 (2026-05-13)

The Agent release. OpenLobby grows a second meta-agent for designing Agents, lets you bind a whole IM bot account to an Agent (every peer routed in, per-user sessions fanned out), and hot-reloads Agent configuration so iterating on a prompt no longer requires restarts.

### Features

#### Agent foundation (core / server / web)
- End-to-end Agent definitions: persistent `agent_definitions` table with `agent_id` / `peer_kind` columns (0070049), `AgentDefinition` / `peerKind` / `binding.agentId` types (d917e7b), `AgentRegistry` CRUD service with systemPrompt resolution (1d59d1d), shared `enforceToolPolicy` helper wired into all adapters (f817092), `SessionManager.getOrCreateAgentSession` with agent-session index and cascade stop (89ec80c), `ChannelRouter` Agent routing branch with mention rule and lock (6338616), WebSocket dispatch for `agent.*` messages and `binding.agentId` (031a581).
- Agents management UI: Agents panel with CRUD and soft-delete (2ae7122), Agent session badges, binding dropdown option, sidebar entry (82c810a), agent sessions hidden from the default session feed to avoid spam (b824019), full en + zh-CN localisation (6d1024b).
- Channels: populate `ChannelIdentity.peerKind` in Telegram and WeCom (ff17238).

#### Agent Manager (AM) — design specialist (44f8509, e2c9d53, 742437b, e2f4d27, 274412b, ed0aed6, 0709b10)
A new built-in meta-agent, sibling to Lobby Manager: LM operates, AM designs.
- Session scaffold mirroring LM, reading the same `defaultAdapter` server config.
- System prompt encoding four capability protocols (interview-driven creation, prompt review, diagnose-and-improve, template application), least-privilege tool-policy principles, and an enforced "draft, then confirm" discipline for every mutating call.
- Eight `agent_*` MCP tools (`agent_list`, `agent_get`, `agent_create`, `agent_update`, `agent_delete`, `agent_recent_messages`, `agent_template_list`, `agent_template_apply`) with parallel `/api/agents` and `/api/agent-templates/*` HTTP routes.
- 5 built-in Agent templates: customer-support, code-reviewer, group-light-assistant, standup-summarizer, alert-triager — TypeScript modules with `{{placeholder}}` fillIns and a render step returning a draft `AgentDefinition` (no server-side draft store).
- Web sidebar 🧙 button promoted to peer-level with the 🏨 LM button; both rows reserved for primary meta-agent entry points.
- LM system prompt updated to redirect agent design / review / improvement requests to AM with bilingual trigger phrases.

#### Account-level channel→Agent binding (cabf954, 70bb6e3)
Binding an Agent to a channel is now an ACCOUNT-LEVEL operation. One `(channelName, accountId)` maps to one Agent; every 1:1 and every group involving that bot routes to the Agent, with per-`(chatId, userid)` session fan-out happening downstream — different users in the same group, and the same user across different groups, all get distinct sessions. Mutually exclusive per account: either an account-level Agent binding OR peer-level session bindings, never both.
- New `channel_account_bindings` table and `ChannelAccountBinding` type with explicit exclusivity rules.
- `ChannelIdentity.chatId` populated by WeCom and Telegram providers; `toAgentPeerKey` helper drives fan-out across direct + group + user dimensions.
- Three new MCP tools — `lobby_bind_agent_to_account`, `lobby_unbind_agent_from_account`, `lobby_list_account_bindings` — and matching `/api/channels/account-bindings/*` HTTP routes. Bind requests on conflicting state return structured conflict lists so LM / UI can guide cleanup.
- Idempotent startup migration: existing peer-level rows with `agent_id` are promoted to account-level on first boot of v0.6.0; users don't need to manually rebind.
- ChannelManagePanel UI restructured around `(channel, account)` groups with an account-level Agent picker, conflict banners, and a "locked peer rows" expander when an Agent owns the account.

#### Agent configuration hot-reload (898844a)
Editing an Agent (system prompt, tools, model, permission mode) via AM or the Agents panel now kills the CLI processes of every live session owned by that agent. The agent-session index and bindings are intentionally preserved so the next inbound resumes through `getOrCreateAgentSession`'s existing resume branch — which reads the latest definition fresh. JSONL conversation history on disk is preserved across the reload. In-flight requests on running sessions are interrupted by design.

### Bug Fixes
- Sync `agentSessionIndex` on session-id migration (4d54fc9).
- Resume Agent sessions on natural death instead of re-spawning (fa4d9b3).
- `unbindSession` now fully deletes peer rows instead of leaving ghost rows with stale `agent_id` — clicking Unbind in the UI now has visible effect (96357a2).
- Remove dead peer-level Agent routing path that resurrected migrated state when any leftover `agent_id` was present (96357a2).
- Account-bound Agent replies now route back to the IM channel: added an in-memory `identityBySession` cache so `resolveResponseBinding` synthesizes a virtual binding row when no peer-level row exists in the DB (c438a0a).
- Stop auto-stealing focus when an Agent receives an IM message: the web view no longer "teleports" into the agent's session whenever a different IM user @s the bot (671e683).

### Refactor
- Collapse sidebar footer entries (IM / Agents / Settings) into a compact icon toolbar with badge counts — reclaims vertical space and gives room for future feature entries without pushing the session list off-screen (86b4f06).
- Remove the legacy `agentId` argument from `channel.bind` WS handler and `bindIdentity`; all Agent binding now flows through the dedicated account-level path. Migration sweeps any stragglers (96357a2).

### Documentation
- Add Agent Mode design spec and implementation plan (7dac13f).
- `docs/agent-manager.md` — usage guide, 5-question interview script, template catalogue, boundary table with LM, deferred-feature triggers.

## v0.5.8 (2026-04-21)

### Bug Fixes
- Unwrap Windows `.cmd` shim to underlying `cli.js` in the Claude Code adapter, avoiding `spawn EINVAL` on Node 24 without reintroducing MCP-config JSON corruption (b3ee830)

## v0.5.7 (2026-04-20)

### Bug Fixes
- Fix Windows Codex CLI process launch for npm shim installs (#6, 42d599e)
- Tighten Telegram msg-tidy output to a single evolving message (#7, fa189f9)
- Handle AbortError gracefully to prevent server crash on session kill (d7574a6)

### Other Changes
- Harden Windows Codex launcher handling tests (38dd514)

## v0.5.6 (2026-04-15)

### Features
- Support auto-upgrade under pm2 and other process managers (ae37440)

### Bug Fixes
- Persist resolved permissionMode so Codex sessions survive restart (2e97d13)

## v0.5.5 (2026-04-14)

### Bug Fixes
- Detect installed CLIs and build resume commands on Windows (a2d8d3f)
- Start the dev server correctly under tsx watch (f3203f2)
- Wait for the backend before opening web sockets in dev mode (894d9fc)
- Avoid double-starting the bundled server (06842f6)

## v0.5.4 (2026-04-14)

### Features
- Add VersionChecker with npm registry query and 24h cache (ed8ddfb)
- Add /api/version and /api/update server endpoints (1e961ff)
- Add lobby_check_update and lobby_update_server MCP tools (120698b)
- Add useVersionCheck hook with 30min polling and visibility awareness (c0fd7b6)
- Add UpdateDialog component for version update confirmation (0866f31)
- Refactor CLI to wrapper + child process architecture for auto-update (088dc65)
- Auto-reload frontend after server update restart (8970bb6)
- Show update button in sidebar when new version available (449226f)

### Bug Fixes
- Correct session cwd from CLI-native data before resume/rebuild (c9e1e3e)

### Other Changes
- Remove server-side version cache, always query npm registry (734ff2a)
- Add version check & auto-update design spec (3a5aef4)
- Add version check & auto-update implementation plan (6110f79)

## v0.5.3 (2026-04-13)

### Bug Fixes
- Set IS_SANDBOX=1 to allow bypassPermissions under root for Claude Code (651d67a)

## v0.5.2 (2026-04-13)

### Features
- Add bilingual UI i18n and locale switching (4c848df)

### Bug Fixes
- Expand ~ in session cwd before spawning CLI (f043848)

### Other Changes
- Replace node-pty with @homebridge/node-pty-prebuilt-multiarch for better cross-platform prebuilt support (6573fff)

## v0.5.1 (2026-04-09)

### Features
- Add Codex CLI sandbox mode mapping (permission modes → sandbox parameter) (b4e6dd0)
- Update GSD adapter for v3 JSONL session format with structured message parsing (b4e6dd0)
- Update Codex permission mode labels to reflect sandbox semantics (b4e6dd0)

## v0.5.0 (2026-04-07)

### Features
- Add GSD adapter with GsdProcess and GsdAdapter (cdfaf74)
- Register GSD adapter in core exports and server builtins (579dcc6)
