# Agent Manager — Script Authoring, Testing & Validation

**Date:** 2026-06-04
**Status:** Approved

## Problem

The Agent Manager (AM, `packages/server/src/agent-manager.ts`) is a purely *conversational* meta-agent. During the "build an agent" interview (Capability A) it produces only a prompt + tool policy; it uses a fixed MCP allow-list (`agent_create/update/...`) and **cannot write files or run anything**.

But a real, capable agent is more than a prompt — it often needs **runtime tooling scripts** (call an API, process data, wrap a CLI). Today nobody authors those: each agent has a `workspace/` dir (`~/.openlobby/agents/<id>/workspace/`) but nothing writes into it, and there is no test/validation/dry-run flow.

This upgrade lets AM, as part of building an agent, **author the agent's tool scripts, write their unit tests, run those tests to green, and register the scripts** so the running agent can actually call them.

## Decisions Summary

| # | Decision | Choice |
|---|----------|--------|
| Q1 | What "scripts" means | **Runtime tooling scripts** the agent invokes — plus their unit tests + a validation run |
| Q2 | How AM authors + executes | AM gains **native `Write`/`Edit`/`Bash`**, cwd-scoped to the target agent's workspace (not narrow MCP tools, not a delegated sub-session) |
| Q3 | Runtime access | Scripts stay in `workspace/`; **usage registered in the agent's `systemPrompt`** (absolute path + purpose + invocation). Scripts are NOT added to `contextFiles` (contextFiles content is injected verbatim into the prompt) |
| Q4 | Safety / approval | **Conversational draft-then-confirm + workspace-scoped + auto-exec** after confirmation (no per-command approval). Trust boundary = your confirmation + workspace (soft) |
| Q5 | Trigger / MVP | **Woven into the build-an-agent interview (Capability A)**. MVP = one interview yields *prompt + scripts + passing tests* |
| Scripts model | Tracking/registration | **Hybrid**: convention dirs + `systemPrompt` registration (runtime) + a minimal structured `scripts[]` field on `AgentDefinition` (durability/visibility), persisted via the existing `agent_update` tool. UI is optional/deferred |

## Goals & Non-Goals

**Goal:** In the Capability A interview, AM identifies needed tool scripts, drafts script+test plans (confirm-first), creates the agent, writes scripts + tests into the agent's workspace using native tools, runs the tests to green (self-heal ≤3 rounds), registers them (systemPrompt usage section + `scripts[]` + `allowedTools`), and hot-reloads — so the agent can immediately call the scripts.

**MVP completion criterion:** One interview produces "systemPrompt + ≥0 tool scripts + passing tests"; the agent goes live and can actually invoke the scripts.

**Non-goals (explicitly deferred / YAGNI):**
- Sandboxed execution (container / restricted subprocess).
- A standalone on-demand "Capability E" for adding scripts to an *existing* agent (the mechanics are reusable, but the MVP trigger surface is the interview only).
- Agent *behavior* evals/regression (the Capability B/C "diagnose" line).
- Cross-agent script sharing; scheduled re-validation.
- Agents-panel editing UI for scripts (MVP: read-only display at most, and may be deferred entirely).

## Architecture — End-to-End Data Flow

```
Interview (5 Qs) ──at Tools & Info──▶ AM identifies "which tool scripts are needed"
   ▼ draft prompt + script/test plan ──▶ user confirms
   ▼ agent_create (definition + create workspace dir)
   ▼ agent_get ──▶ obtain workspacePath (absolute)
   ▼ AM native Write → scripts/<x>, tests/<x>
   ▼ AM native Bash → run tests ──red──▶ self-heal (≤3 rounds) ──▶ re-run
   ▼ all green
   ▼ agent_update:
        • systemPrompt += "## Scripts available to you" (abs path + purpose + invocation)
        • scripts[] += structured entries (validatedAt, testStatus='passed')
        • allowedTools += Bash (and whatever the scripts need)
   ▼ hot-reload (existing: kill live session, next inbound resumes with new definition)
   ▼ report: "Created <agent> with K scripts, tests green"
```

**Key invariant:** Script files live in `workspace/`; the running agent learns of them via the **"Scripts available to you" section in `systemPrompt`** (absolute path + usage), never via `contextFiles` (which would inject source verbatim into the prompt).

## Components (by file)

### Data model — `packages/core/src/agent.ts`
```ts
export interface AgentScript {
  name: string;         // logical name, e.g. "fetch-weather"
  path: string;         // workspace-relative, e.g. "scripts/fetch_weather.py"
  purpose: string;      // one line: what it does / when the agent calls it
  testPath?: string;    // workspace-relative, e.g. "tests/test_fetch_weather.py"
  validatedAt?: number; // epoch ms of last green test run
  testStatus?: 'passed' | 'failed' | 'untested';
}

export interface AgentDefinition {
  /* …existing fields… */
  scripts?: AgentScript[]; // new
}
```

### Persistence — `packages/server/src/db.ts`
- Add column `agent_scripts_json TEXT NOT NULL DEFAULT '[]'` to `agent_definitions` via an idempotent `ALTER TABLE … ADD COLUMN` (following the existing migration style; pre-existing rows default to `'[]'`).
- Read/write `scripts` (JSON serialize) in the insert/update/`mapRowToAgent` paths.

### Workspace path exposure — `agent-registry.ts` + `mcp-server.ts`
- `AgentRegistry.getWorkspacePath(id)` → absolute `~/.openlobby/agents/<id>/workspace/` (derived, not stored).
- The `agent_get` MCP tool's returned payload gains a `workspacePath` field so AM can locate where to write.

### Registration tool — `agent_update` (`mcp-server.ts` + `agent-registry.ts`)
- Extend the `agent_update` input schema with optional `scripts: AgentScript[]`, persisted on update. Reuses the existing hot-reload (update kills live sessions). **No new MCP tool.**

### AM capability upgrade — `agent-manager.ts`
- `AM_ALLOWED_TOOLS` gains native `Read, Glob, Grep, Write, Edit, Bash` (in addition to the MCP tools).
- AM keeps **auto** permission mode (Q4: confirm-first in chat, then auto-exec).
- AM's spawn must be able to write under the agents root: include `~/.openlobby/agents` as an accessible directory (cwd or `add-dir`).
- System prompt extended (see below).

### Workspace conventions (inside each agent's `workspace/`)
```
workspace/scripts/   tool scripts
workspace/tests/     their tests
```
Language-agnostic: AM picks the test command for whatever language it wrote (pytest / `node --test` / bash / …) and judges pass/fail by exit code.

## AM System Prompt Changes (behavioral contract)

Insert a "script scaffolding" sub-flow after the *Tools & Info* step of Capability A, plus a discipline section:
- **Identify:** From the agent's responsibilities, decide whether it needs external tool scripts (API calls, data processing, command wrappers). If not, **skip** — many agents need no scripts.
- **Draft first:** List the planned scripts + each one's purpose + how it will be tested, in chat, and **wait for confirmation** before acting (preserves draft-then-confirm).
- **Implement:** After `agent_create`, fetch `workspacePath`, write scripts into `scripts/` and tests into `tests/`, and **actually run the tests**.
- **Self-heal:** On red, read output, fix script/test, re-run — **max 3 rounds**; if still red, **report honestly** which tests fail, set `testStatus:'failed'`, do not mark validated, and hand the decision back (keep / retry / drop).
- **Register:** Once green, `agent_update` to add the "## Scripts available to you" section to `systemPrompt` (**absolute path + purpose + invocation example**), the `scripts[]` entries, and `Bash` (plus whatever the scripts need) to that agent's `allowedTools`.
- **Scope:** All file reads/writes/exec confined to the agent's `workspace/`; going outside requires asking the user first.

## Runtime Usage (how the live agent uses scripts)

- The agent's `systemPrompt` carries a "## Scripts available to you" section: each script's **absolute path + purpose + invocation** (e.g. `python3 ~/.openlobby/agents/<id>/workspace/scripts/fetch_weather.py <city>`).
- The agent's `allowedTools` includes `Bash`, so it can execute them.
- `resolveSystemPrompt` already includes the inline `systemPrompt`, so the section is naturally in effect; scripts are **not** in `contextFiles`.
- Hot-reload is already implemented: `agent_update` kills live sessions; the next inbound resumes with the new prompt.

## Error Handling

- **Tests still red after 3 rounds:** stop self-healing, keep the files, set `testStatus:'failed'`, do not set `validatedAt`, return the decision to the user (keep / retry / drop). The agent can still be created on the strength of its prompt.
- **Missing runtime** (e.g. `python3` not installed): AM catches "command not found", reports, and suggests an alternative implementation or asks the user to install it.
- **Out-of-workspace file ops:** forbidden by the system prompt; AM must ask first.
- **`workspacePath` resolution failure / agent not found:** the tool error surfaces and AM reports it.

## Testing Strategy (TDD for this feature)

Cover every deterministic seam with unit tests (the LLM behavior itself is not unit-tested; it's validated by one real dry-run):
- **core:** `AgentScript` type + db round-trip serialization (including legacy rows defaulting to `'[]'`).
- **server:** `AgentRegistry.update` accepts and round-trips `scripts`; `getWorkspacePath`; `agent_get` payload includes `workspacePath`; `agent_update` schema accepts `scripts` (extend `mcp-agent-tools.test.ts`).
- **Acceptance (manual/e2e):** run a real interview, have AM write one simple script (e.g. "given a city, return a fixed greeting") + its test, confirm green, confirm the `systemPrompt` registration, and confirm that after hot-reload the agent can invoke it.

## Impact & Risks

- AM shifts from "purely conversational" to "can write code and run arbitrary bash (auto) within a workspace" — trust boundary = your confirmation + workspace (soft boundary; bash can `cd` out). Accepted in Q2/Q4.
- One-column schema migration; `agent_get`/`agent_update` each gain a field — backward-compatible with existing agents (default `scripts: []`).
- Does **not** touch LobbyManager or the per-peer session cwd isolation.

## Files to Modify

| File | Change |
|------|--------|
| `packages/core/src/agent.ts` | Add `AgentScript` interface + `scripts?` on `AgentDefinition` |
| `packages/server/src/db.ts` | `agent_scripts_json` column + migration + serialize/deserialize |
| `packages/server/src/agent-registry.ts` | `getWorkspacePath()`; persist/return `scripts` |
| `packages/server/src/mcp-server.ts` | `agent_get` returns `workspacePath`; `agent_update` accepts `scripts` |
| `packages/server/src/agent-manager.ts` | Add native tools to `AM_ALLOWED_TOOLS`; agents-root accessible dir; system-prompt scaffolding sub-flow + discipline |
| `packages/server/src/__tests__/*` | Unit tests for registry/db/mcp seams |
| `packages/web/src/components/AgentsPanel.tsx` | (Optional / deferred) read-only display of `scripts[]` + validation status |
