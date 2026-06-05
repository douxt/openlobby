# Agent Manager — Script Authoring, Testing & Validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Agent Manager (AM), during the build-an-agent interview, author an agent's runtime tool scripts + their tests, run the tests to green, and register the scripts so the running agent can invoke them.

**Architecture:** Add a `scripts[]` field to `AgentDefinition` (persisted as a JSON column). Expose the agent's absolute `workspacePath` via `agent_get`. Let `agent_update` accept `scripts`. Give AM native `Write/Edit/Bash` (auto mode, workspace-scoped) plus a system-prompt sub-flow that scaffolds → tests → registers scripts. Scripts live in `workspace/`; the running agent learns of them via a "Scripts available to you" section AM writes into the agent's `systemPrompt` (never via `contextFiles`, which inject source verbatim).

**Tech Stack:** TypeScript (ESM), better-sqlite3, Fastify (`app.inject` for hermetic route tests), zod, `@anthropic-ai/claude-agent-sdk`, vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-agent-manager-script-authoring-design.md`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `packages/core/src/agent.ts` | Agent data model | Add `AgentScript` interface + `scripts?` on `AgentDefinition` |
| `packages/server/src/db.ts` | SQLite schema + row mapping | `agent_scripts_json` column + migration + row field + upsert |
| `packages/server/src/agent-registry.ts` | Registry CRUD + (de)serialization + workspace paths | (de)serialize `scripts`; `getAgentWorkspaceDir` already returns the abs workspace path |
| `packages/server/src/mcp-api.ts` | HTTP routes behind the MCP tools | GET `/:id` returns `workspacePath`; `AgentPatchSchema` accepts `scripts` |
| `packages/server/src/mcp-server.ts` | MCP tool schemas (thin wrappers) | `agent_update` patch schema accepts `scripts`; `agent_get` description notes `workspacePath` |
| `packages/server/src/agent-manager.ts` | AM definition (system prompt + allowed tools) | Add native authoring tools; system-prompt script-scaffolding sub-flow + discipline |
| `packages/server/src/__tests__/agent-registry.test.ts` | Registry tests | `scripts` round-trip |
| `packages/server/src/__tests__/mcp-agent-tools.test.ts` | Route tests | `workspacePath` on GET; `scripts` on PATCH |
| `packages/server/src/__tests__/agent-manager-tools.test.ts` | AM config test (new) | `AM_ALLOWED_TOOLS` contents |

**Out of scope for this plan (future increment):** Agents-panel read-only display of `scripts[]`; sandbox; standalone on-demand "Capability E" for existing agents; behavior evals.

---

## Task 1: `scripts[]` persists through the registry

**Files:**
- Modify: `packages/core/src/agent.ts`
- Modify: `packages/server/src/db.ts` (schema ~136-152, migration, `AgentDefinitionRow` ~536-551, `upsertAgentDefinition` ~553-560)
- Modify: `packages/server/src/agent-registry.ts` (`rowToDef` ~40-59, `defToRow` ~61-78, imports ~5)
- Test: `packages/server/src/__tests__/agent-registry.test.ts`

- [ ] **Step 1: Write the failing test** — append inside the `describe('AgentRegistry', …)` block in `agent-registry.test.ts`:

```ts
  it('round-trips scripts[] through create / get / update', () => {
    const created = registry.create({
      id: 'tooler',
      displayName: 'Tooler',
      description: '',
      adapter: 'claude-code',
      contextFiles: [],
      systemPrompt: 'x',
      scripts: [
        {
          name: 'greet',
          path: 'scripts/greet.py',
          purpose: 'greet a city',
          testPath: 'tests/test_greet.py',
          validatedAt: 123,
          testStatus: 'passed',
        },
      ],
    });
    expect(created.scripts).toHaveLength(1);
    expect(registry.get('tooler')!.scripts).toEqual([
      {
        name: 'greet',
        path: 'scripts/greet.py',
        purpose: 'greet a city',
        testPath: 'tests/test_greet.py',
        validatedAt: 123,
        testStatus: 'passed',
      },
    ]);

    // create without scripts → empty array after a DB round-trip (mirrors
    // contextFiles). NB: create() returns the in-memory input, so read it back
    // via get() to assert the persisted/normalized value.
    registry.create({
      id: 'bare',
      displayName: 'Bare',
      description: '',
      adapter: 'any',
      contextFiles: [],
      systemPrompt: 'x',
    });
    expect(registry.get('bare')!.scripts).toEqual([]);

    // update adds scripts
    const updated = registry.update('bare', {
      scripts: [{ name: 'a', path: 'scripts/a.sh', purpose: 'p' }],
    });
    expect(updated.scripts).toEqual([{ name: 'a', path: 'scripts/a.sh', purpose: 'p' }]);
    expect(registry.get('bare')!.scripts![0].name).toBe('a');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @openlobby/server exec vitest run src/__tests__/agent-registry.test.ts -t "round-trips scripts"`
Expected: FAIL — `created.scripts` is `undefined` (registry doesn't serialize `scripts` yet), so `toHaveLength(1)` throws.

- [ ] **Step 3: Add the `AgentScript` type + `scripts` field** in `packages/core/src/agent.ts` — insert this interface immediately above `export interface AgentDefinition {`:

```ts
/** A runtime tool script authored for an Agent, with its test/validation status. */
export interface AgentScript {
  /** Logical name, e.g. "fetch-weather". */
  name: string;
  /** Workspace-relative path to the script, e.g. "scripts/fetch_weather.py". */
  path: string;
  /** One line: what it does / when the agent should call it. */
  purpose: string;
  /** Workspace-relative path to the script's test, e.g. "tests/test_fetch_weather.py". */
  testPath?: string;
  /** Epoch ms of the last green test run. */
  validatedAt?: number;
  /** Result of the last test run. */
  testStatus?: 'passed' | 'failed' | 'untested';
}
```

Then inside `AgentDefinition`, add this field directly after the `deniedTools?: string[];` line:

```ts
  /** Runtime tool scripts authored for this agent by Agent Manager. */
  scripts?: AgentScript[];
```

- [ ] **Step 4: Add the DB column + migration** in `packages/server/src/db.ts`. In the `CREATE TABLE IF NOT EXISTS agent_definitions (…)` block, add the column between `group_chat_json TEXT,` and `deleted_at INTEGER,`:

```
      group_chat_json     TEXT,
      agent_scripts_json  TEXT NOT NULL DEFAULT '[]',
      deleted_at          INTEGER,
```

Immediately after the `agent_definitions` `db.exec(\`…\`)` call (the closing `\`);` of that CREATE TABLE), add the migration for existing databases, matching the surrounding `try/catch` ALTER style:

```ts
  // Migration: add agent_scripts_json column if not exists
  try {
    db.exec(`ALTER TABLE agent_definitions ADD COLUMN agent_scripts_json TEXT NOT NULL DEFAULT '[]'`);
  } catch {
    // Column already exists — ignore
  }
```

- [ ] **Step 5: Add the row field + upsert column** in `packages/server/src/db.ts`. In `interface AgentDefinitionRow`, add after `group_chat_json: string | null;`:

```ts
  agent_scripts_json: string;
```

In `upsertAgentDefinition`, add `agent_scripts_json` to both the column list and the `VALUES` list (keep the existing order — insert right after `group_chat_json` / `@group_chat_json`):

```ts
    INSERT OR REPLACE INTO agent_definitions
      (id, display_name, description, adapter, system_prompt, context_files_json, model, permission_mode, allowed_tools_json, denied_tools_json, group_chat_json, agent_scripts_json, deleted_at, created_at, updated_at)
    VALUES
      (@id, @display_name, @description, @adapter, @system_prompt, @context_files_json, @model, @permission_mode, @allowed_tools_json, @denied_tools_json, @group_chat_json, @agent_scripts_json, @deleted_at, @created_at, @updated_at)
```

- [ ] **Step 6: (De)serialize `scripts` in the registry** in `packages/server/src/agent-registry.ts`. Update the import on line 5 to add `AgentScript`:

```ts
import type { AgentDefinition, AgentGroupChatConfig, AgentScript } from '@openlobby/core';
```

In `rowToDef`, add after the `groupChat: …` property:

```ts
    scripts: JSON.parse(row.agent_scripts_json) as AgentScript[],
```

In `defToRow`, add after the `group_chat_json: …` property:

```ts
    agent_scripts_json: JSON.stringify(def.scripts ?? []),
```

- [ ] **Step 7: Build core (keep types in sync) and run the test**

Run: `pnpm --filter @openlobby/core build && pnpm --filter @openlobby/server exec vitest run src/__tests__/agent-registry.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/agent.ts packages/server/src/db.ts packages/server/src/agent-registry.ts packages/server/src/__tests__/agent-registry.test.ts
git commit -m "feat(core): persist AgentScript[] on AgentDefinition"
```

---

## Task 2: `agent_get` returns `workspacePath`; `agent_update` accepts `scripts`

**Files:**
- Modify: `packages/server/src/mcp-api.ts` (`AgentPatchSchema` ~62-78, GET `/api/agents/:id` ~514-524)
- Modify: `packages/server/src/mcp-server.ts` (`agent_update` patch schema ~427-440, `agent_get` description ~388)
- Test: `packages/server/src/__tests__/mcp-agent-tools.test.ts`

- [ ] **Step 1: Write the failing tests** — append inside the `describe('mcp-api agent routes', …)` block in `mcp-agent-tools.test.ts`:

```ts
  it('agent_get returns the absolute workspacePath', async () => {
    registry.create({
      id: 'ws', displayName: 'WS', description: '', adapter: 'any',
      contextFiles: [], systemPrompt: 'x',
    });
    const res = await app.inject({ method: 'GET', url: '/api/agents/ws' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { workspacePath?: string };
    expect(body.workspacePath).toBe(registry.getAgentWorkspaceDir('ws'));
  });

  it('agent_update accepts and persists scripts[]', async () => {
    registry.create({
      id: 'sc', displayName: 'SC', description: '', adapter: 'any',
      contextFiles: [], systemPrompt: 'x',
    });
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/agents/sc',
      payload: {
        scripts: [
          { name: 'g', path: 'scripts/g.py', purpose: 'p', testPath: 'tests/t.py', validatedAt: 1, testStatus: 'passed' },
        ],
      },
    });
    expect(patchRes.statusCode).toBe(200);
    const getRes = await app.inject({ method: 'GET', url: '/api/agents/sc' });
    const body = getRes.json() as { scripts?: Array<{ name: string }> };
    expect(body.scripts).toHaveLength(1);
    expect(body.scripts![0].name).toBe('g');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @openlobby/server exec vitest run src/__tests__/mcp-agent-tools.test.ts -t "workspacePath|persists scripts"`
Expected: FAIL — `workspacePath` is `undefined` (GET doesn't add it); `scripts` is dropped by `AgentPatchSchema` (unknown key stripped) so GET shows no `scripts`.

- [ ] **Step 3: Add `AgentScriptSchema` + extend `AgentPatchSchema`** in `packages/server/src/mcp-api.ts`. Immediately above `const AgentPatchSchema = z.object({`:

```ts
const AgentScriptSchema = z.object({
  name: z.string(),
  path: z.string(),
  purpose: z.string(),
  testPath: z.string().optional(),
  validatedAt: z.number().optional(),
  testStatus: z.enum(['passed', 'failed', 'untested']).optional(),
});
```

Then inside `AgentPatchSchema`, add before the closing `});` (after the `groupChat: …` field):

```ts
  scripts: z.array(AgentScriptSchema).optional(),
```

- [ ] **Step 4: Return `workspacePath` from GET `/:id`** in `packages/server/src/mcp-api.ts`. Replace the body of the `GET /api/agents/:id` handler `return def;` line with:

```ts
      return { ...def, workspacePath: registry.getAgentWorkspaceDir(decodeURIComponent(request.params.id)) };
```

- [ ] **Step 5: Mirror `scripts` in the `agent_update` MCP tool schema** in `packages/server/src/mcp-server.ts`. Inside the `agent_update` tool's `patch: z.object({ … })`, add before its closing `})` (after the `groupChat: AGENT_GROUP_CHAT,` line):

```ts
          scripts: z
            .array(
              z.object({
                name: z.string(),
                path: z.string(),
                purpose: z.string(),
                testPath: z.string().optional(),
                validatedAt: z.number().optional(),
                testStatus: z.enum(['passed', 'failed', 'untested']).optional(),
              }),
            )
            .optional()
            .describe('Authored tool scripts to register on the agent'),
```

Also update the `agent_get` tool description string to note the new field — change it to:

```ts
    'Fetch a single Agent definition by id (returns null if not found). The response also includes `workspacePath`: the absolute directory where you write/read this agent\'s scripts.',
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @openlobby/server exec vitest run src/__tests__/mcp-agent-tools.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/mcp-api.ts packages/server/src/mcp-server.ts packages/server/src/__tests__/mcp-agent-tools.test.ts
git commit -m "feat(server): expose agent workspacePath and accept scripts[] on update"
```

---

## Task 3: AM gains native authoring tools + the script-scaffolding system prompt

**Files:**
- Modify: `packages/server/src/agent-manager.ts` (`AM_ALLOWED_TOOLS` ~121-132, `AM_SYSTEM_PROMPT` Capability A ~31-42)
- Test (new): `packages/server/src/__tests__/agent-manager-tools.test.ts`

- [ ] **Step 1: Write the failing test** — create `packages/server/src/__tests__/agent-manager-tools.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AM_ALLOWED_TOOLS } from '../agent-manager.js';

describe('AM_ALLOWED_TOOLS', () => {
  it('includes the native authoring tools needed to scaffold + test scripts', () => {
    for (const t of ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash']) {
      expect(AM_ALLOWED_TOOLS).toContain(t);
    }
  });

  it('retains the agent-design MCP tools', () => {
    expect(AM_ALLOWED_TOOLS).toContain('mcp__openlobby__agent_create');
    expect(AM_ALLOWED_TOOLS).toContain('mcp__openlobby__agent_update');
    expect(AM_ALLOWED_TOOLS).toContain('mcp__openlobby__agent_get');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @openlobby/server exec vitest run src/__tests__/agent-manager-tools.test.ts`
Expected: FAIL — `AM_ALLOWED_TOOLS` is not exported (import is `undefined`), so `toContain` throws; even once exported, the native tools are absent.

- [ ] **Step 3: Export `AM_ALLOWED_TOOLS` and add the native tools** in `packages/server/src/agent-manager.ts`. Change the declaration `const AM_ALLOWED_TOOLS: string[] = [` to `export const AM_ALLOWED_TOOLS: string[] = [`, and add the native tools as a new group before the closing `];`:

```ts
  // Diagnostics & templates
  'mcp__openlobby__agent_recent_messages',
  'mcp__openlobby__agent_template_list',
  'mcp__openlobby__agent_template_apply',
  // Native authoring tools — AM writes & tests an agent's tool scripts in its
  // workspace (Capability A script scaffolding). Runs in auto mode, scoped to
  // the target agent's workspace by the system-prompt discipline below.
  'Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash',
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @openlobby/server exec vitest run src/__tests__/agent-manager-tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the script-scaffolding sub-flow to the system prompt** in `packages/server/src/agent-manager.ts`. In `AM_SYSTEM_PROMPT`, inside `## Capability A`, immediately after the line `Only after explicit yes, call \`agent_create\`.`, insert this block (note: backticks inside the template literal must stay escaped as `\``):

```
### A.1 — Scaffold & validate the agent's tool scripts (only when it needs them)
A capable Agent is more than a prompt: it often needs **runtime tool scripts** it invokes while working (call an API, process data, wrap a CLI). At question 5 (Tools & info), decide whether THIS agent needs any. Many need none — if so, SKIP this and finish.

When it does, AFTER \`agent_create\` succeeds:
  1. Call \`agent_get(id)\` and read \`workspacePath\` — the agent's absolute workspace dir. EVERY file you write and command you run MUST stay under it.
  2. Present the script plan (each script's name, purpose, language, and how you'll test it) and get explicit confirmation BEFORE writing anything.
  3. Write each script under \`<workspacePath>/scripts/\` and its test under \`<workspacePath>/tests/\` using the Write tool.
  4. Run the tests with Bash (pytest / \`node --test\` / bash — match the language). If RED: read the output, fix the script or test, re-run. At most 3 rounds. If still RED after 3 rounds: STOP, report which tests fail, and ask the user to keep-as-is / retry / drop. Do NOT mark it validated.
  5. When GREEN, call \`agent_update(id, patch)\` to register them:
       - \`patch.scripts\`: one entry per script — { name, path:"scripts/<f>", purpose, testPath:"tests/<f>", validatedAt:<now-ms>, testStatus:"passed" }.
       - \`patch.systemPrompt\`: APPEND (do not discard the existing prompt) a section the running agent will read:
           "## Scripts available to you
            - <name>: <purpose>
              Run: <exact invocation with ABSOLUTE path, e.g. python3 <workspacePath>/scripts/<f> <args>>"
       - \`patch.allowedTools\`: ensure \`Bash\` (and any runtime the scripts need) is present so the running agent can actually execute them.
  6. Report: agent created, K scripts, tests green (or which failed).

Confine ALL file reads/writes/commands to the agent's \`workspacePath\`. If you ever need to act outside it, ask the user first.
```

- [ ] **Step 6: Verify the prompt edit compiles (no broken template literal)**

Run: `pnpm --filter @openlobby/server build`
Expected: PASS (tsc compiles `agent-manager.ts` cleanly — confirms the inserted backticks/`${}` are properly escaped and the template literal is still valid).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/agent-manager.ts packages/server/src/__tests__/agent-manager-tools.test.ts
git commit -m "feat(server): teach Agent Manager to scaffold, test & register agent scripts"
```

---

> **Risk & contingency — AM file writes (verify in Task 4):** AM runs `permissionMode: 'auto'`, which the claude-code adapter maps to `bypassPermissions` (skips all permission gates, including the working-directory write restriction), so AM should be able to `Write` to absolute paths under `~/.openlobby/agents/<id>/workspace/` even though its own cwd is elsewhere. This is the assumption Task 4's dry-run validates. **If writes outside cwd are blocked**, the minimal fix is to make the agents root accessible to AM's session — preferred order: (a) pass the agents root via the claude-code adapter's additional-directories option if one exists, else (b) set AM's `cwd` (in `buildSpawnOptions`) to the registry's agents root (`registry.getAgentsRoot()`), accepting that AM's working dir moves under `~/.openlobby/agents`. Add this as a follow-up task only if Task 4 proves it necessary — do not pre-build it.

## Task 4: Full build, suite, and manual acceptance (dry-run)

This task has no new production code — it verifies the whole feature end-to-end. The deterministic seams are covered by Tasks 1-3; this confirms the AM behavior (LLM-driven) works against a real session.

- [ ] **Step 1: Full type-check + build**

Run: `pnpm -r build`
Expected: all packages build (telegram may fail only if its deps aren't installed — run `pnpm install` first; that failure is unrelated to this feature).

- [ ] **Step 2: Run the server unit suite (exclude env-gated integration)**

Run: `pnpm --filter @openlobby/server exec vitest run --exclude '**/*.integration.test.ts'`
Expected: PASS, including the three new tests.

- [ ] **Step 3: Manual acceptance dry-run** (document the result in the PR/checkpoint):
  1. Start the server (`pnpm --filter @openlobby/server dev`) and web (`pnpm --filter @openlobby/web dev`).
  2. Talk to Agent Manager: "帮我做一个 agent：输入一个城市名，回复一句固定问候。需要一个脚本来做这件事。"
  3. Walk the 5-question interview; at Tools & info, AM should propose a small script (e.g. `scripts/greet.py`) + a test.
  4. Confirm the plan. Verify AM:
     - creates the agent, then writes `~/.openlobby/agents/<id>/workspace/scripts/greet.py` and `…/tests/test_greet.py`;
     - runs the test and reports it green;
     - calls `agent_update` so the agent's `systemPrompt` gains a "## Scripts available to you" section with the **absolute** path, `scripts[]` has one `testStatus:"passed"` entry, and `allowedTools` includes `Bash`.
  5. Inspect via `sqlite3 ~/.openlobby/sessions.db "SELECT agent_scripts_json, allowed_tools_json FROM agent_definitions WHERE id='<id>';"` — confirm the script entry and `Bash`.
  6. (Optional) Bind the new agent to a session and ask it to run its greeting for a city; confirm it invokes the script.
  7. **Negative path:** in a second run, have AM write a deliberately failing test; confirm it self-heals up to 3 rounds, then reports failure honestly without marking `validatedAt`.

- [ ] **Step 4: Commit any doc/notes** (if the dry-run surfaced prompt tweaks, fold them into `agent-manager.ts` with their own commit).
