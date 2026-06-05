import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { initDb } from '../db.js';
import { AgentRegistry } from '../agent-registry.js';
import { SessionManager } from '../session-manager.js';
import { buildMcpApi } from '../mcp-api.js';

/**
 * Exercises the agent_* MCP tool surface end-to-end against the in-process
 * fastify app. We use fastify's built-in `inject()` so no port binding is
 * required and tests stay hermetic.
 */
describe('mcp-api agent routes', () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let registry: AgentRegistry;

  beforeEach(async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ol-mcp-agent-'));
    db = initDb(join(tmp, 'sessions.db'));
    const agentsRoot = join(tmp, 'agents');
    const sessionManager = new SessionManager(db);
    registry = new AgentRegistry(db, agentsRoot);
    sessionManager.setAgentRegistry(registry);

    const built = buildMcpApi({
      sessionManager,
      agentRegistry: registry,
    });
    app = built.app;
    await app.ready();
  });

  // ─── agent_template_apply ──────────────────────────────────────────

  it('agent_template_apply renders a draft for the happy path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent-templates/apply',
      payload: {
        templateId: 'customer-support',
        fillIns: {
          productName: 'Foobar Cloud',
          escalationChannel: 'email support@example.com',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { draft?: { templateId: string; systemPrompt: string } };
    expect(body.draft).toBeDefined();
    expect(body.draft!.templateId).toBe('customer-support');
    expect(body.draft!.systemPrompt).toContain('Foobar Cloud');
    expect(body.draft!.systemPrompt).toContain('email support@example.com');
    // Defaults filled in for omitted optional fillIns.
    expect(body.draft!.systemPrompt).toContain('internal only');
  });

  it('agent_template_apply reports missing required fillIns', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent-templates/apply',
      payload: {
        templateId: 'customer-support',
        fillIns: { productName: 'Foobar Cloud' }, // escalationChannel missing
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { draft?: unknown; missingRequired?: string[] };
    expect(body.draft).toBeUndefined();
    expect(body.missingRequired).toEqual(expect.arrayContaining(['escalationChannel']));
  });

  it('agent_template_apply returns 404 for unknown templateId (not a 500)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent-templates/apply',
      payload: { templateId: 'does-not-exist', fillIns: {} },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: string };
    expect(body.error).toMatch(/does-not-exist/);
  });

  // ─── agent_create / agent_get roundtrip ────────────────────────────

  it('agent_create then agent_get roundtrip preserves fields', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/agents',
      payload: {
        displayName: 'Helpful Helper',
        description: 'helps with stuff',
        adapter: 'claude-code',
        systemPrompt: 'Be helpful.',
        allowedTools: ['Read'],
        deniedTools: ['Bash'],
      },
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json() as { id: string; displayName: string };
    expect(created.id).toBe('helpful-helper'); // slugified from displayName
    expect(created.displayName).toBe('Helpful Helper');

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/agents/${encodeURIComponent(created.id)}`,
    });
    expect(getRes.statusCode).toBe(200);
    const fetched = getRes.json() as {
      id: string;
      systemPrompt?: string;
      allowedTools?: string[];
      deniedTools?: string[];
      adapter: string;
    };
    expect(fetched.id).toBe('helpful-helper');
    expect(fetched.systemPrompt).toBe('Be helpful.');
    expect(fetched.allowedTools).toEqual(['Read']);
    expect(fetched.deniedTools).toEqual(['Bash']);
    expect(fetched.adapter).toBe('claude-code');
  });

  it('agent_create rejects payloads missing both systemPrompt and contextFiles', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      payload: {
        displayName: 'Empty',
        description: 'nothing',
        adapter: 'claude-code',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('agent_create rejects an invalid adapter value', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/agents',
      payload: {
        displayName: 'Bad Adapter',
        description: '',
        adapter: 'gpt-cli', // not in the allowed set
        systemPrompt: 'x',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // ─── agent_update strips id/timestamps ─────────────────────────────

  it('agent_update strips id and timestamp fields from the patch', async () => {
    registry.create({
      id: 'patcher',
      displayName: 'Original',
      description: '',
      adapter: 'claude-code',
      systemPrompt: 'v1',
      contextFiles: [],
    });
    const original = registry.get('patcher')!;
    const originalCreatedAt = original.createdAt;

    // Try to sneak server-managed fields into the patch. The schema strips
    // unknown keys (so id/createdAt never reach the registry), but we ALSO
    // want to confirm the resulting record kept its original identity.
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/agents/patcher',
      payload: {
        displayName: 'Renamed',
        id: 'attacker-controlled',
        createdAt: 0,
        updatedAt: 0,
        deletedAt: 12345,
      },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json() as {
      id: string;
      displayName: string;
      createdAt: number;
      updatedAt: number;
      deletedAt?: number;
    };
    expect(updated.id).toBe('patcher'); // id NOT changed
    expect(updated.displayName).toBe('Renamed'); // legitimate change applied
    expect(updated.createdAt).toBe(originalCreatedAt); // not overwritten
    expect(updated.updatedAt).toBeGreaterThan(0);
    expect(updated.deletedAt).toBeUndefined(); // unknown key dropped
  });

  // ─── agent_list & agent_delete ─────────────────────────────────────

  it('agent_list hides soft-deleted by default and shows them with includeDeleted=true', async () => {
    registry.create({
      id: 'live',
      displayName: 'Live',
      description: '',
      adapter: 'any',
      contextFiles: [],
      systemPrompt: 'x',
    });
    registry.create({
      id: 'gone',
      displayName: 'Gone',
      description: '',
      adapter: 'any',
      contextFiles: [],
      systemPrompt: 'x',
    });
    registry.softDelete('gone');

    const defaultRes = await app.inject({ method: 'GET', url: '/api/agents' });
    expect(defaultRes.statusCode).toBe(200);
    const defaultList = defaultRes.json() as Array<{ id: string }>;
    expect(defaultList.map((a) => a.id)).toEqual(['live']);

    const allRes = await app.inject({
      method: 'GET',
      url: '/api/agents?includeDeleted=true',
    });
    const allList = allRes.json() as Array<{ id: string }>;
    expect(allList.map((a) => a.id).sort()).toEqual(['gone', 'live']);
  });

  it('agent_delete soft-deletes by default and hard-deletes on hard=true', async () => {
    registry.create({
      id: 'doomed',
      displayName: 'Doomed',
      description: '',
      adapter: 'any',
      contextFiles: [],
      systemPrompt: 'x',
    });

    const softRes = await app.inject({
      method: 'DELETE',
      url: '/api/agents/doomed',
    });
    expect(softRes.statusCode).toBe(200);
    expect(registry.get('doomed')?.deletedAt).toBeGreaterThan(0);

    const hardRes = await app.inject({
      method: 'DELETE',
      url: '/api/agents/doomed?hard=true',
    });
    expect(hardRes.statusCode).toBe(200);
    expect(registry.get('doomed')).toBeNull();
  });

  // ─── workspacePath & scripts ───────────────────────────────────────

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

  // ─── agent_template_list ───────────────────────────────────────────

  it('agent_template_list returns templates with fillIn metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/agent-templates' });
    expect(res.statusCode).toBe(200);
    const list = res.json() as Array<{
      id: string;
      fillIns: Array<{ key: string; required: boolean }>;
    }>;
    expect(list.length).toBeGreaterThan(0);
    const cs = list.find((t) => t.id === 'customer-support');
    expect(cs).toBeDefined();
    expect(cs!.fillIns.some((f) => f.key === 'productName' && f.required)).toBe(true);
  });
});
