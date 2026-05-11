# Changelog

## v0.6.0 (2026-05-11)

### Features
- **Agent Mode (core/server/web)** — end-to-end Agent definitions: persistent `agent_definitions` table with `agent_id` / `peer_kind` columns (0070049), `AgentDefinition` / `peerKind` / `binding.agentId` types (d917e7b), `AgentRegistry` CRUD service with systemPrompt resolution (1d59d1d), shared `enforceToolPolicy` helper wired into all adapters (f817092), `SessionManager.getOrCreateAgentSession` with agent-session index and cascade stop (89ec80c), `ChannelRouter` Agent routing branch with mention rule and lock (6338616), WebSocket dispatch for `agent.*` messages and `binding.agentId` (031a581).
- **Agents management UI (web)** — Agents panel with CRUD and soft-delete (2ae7122), Agent session badges, binding dropdown option, sidebar entry (82c810a), hide agent sessions from default session lists to avoid spam (b824019), Agent UI localised to en + zh-CN (6d1024b).
- **Channels** — populate `ChannelIdentity.peerKind` in Telegram and WeCom (ff17238).

### Bug Fixes
- Sync `agentSessionIndex` on session-id migration (4d54fc9)
- Resume Agent sessions on natural death instead of re-spawning (fa4d9b3)

### Refactor
- Collapse sidebar footer entries (IM / Agents / Settings) into a compact icon toolbar with badge counts — reclaims vertical space and gives room for future feature entries without pushing the session list off-screen (86b4f06)

### Documentation
- Add Agent Mode design spec and implementation plan (7dac13f)

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
