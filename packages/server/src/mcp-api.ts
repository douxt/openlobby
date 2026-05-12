import Fastify, { type FastifyInstance } from 'fastify';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { z } from 'zod';
import type { AgentDefinition, AgentAdapterSelector } from '@openlobby/core';
import type { SessionManager } from './session-manager.js';
import type { ChannelRouterImpl } from './channel-router.js';
import type { VersionChecker } from './version-checker.js';
import type { AgentRegistry } from './agent-registry.js';
import {
  getAgentTemplate,
  listAgentTemplateSummaries,
  renderTemplate,
} from './agent-templates/index.js';

/** Expand leading `~` or `~/` to the user's home directory */
function expandTilde(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return homedir() + p.slice(1);
  return p;
}

export interface McpApiHandle {
  setChannelRouter(router: ChannelRouterImpl): void;
  close(): Promise<void>;
}

/** Slugify a displayName to a registry-valid id (`/^[a-z0-9][a-z0-9-_]*$/`). */
function slugifyAgentId(displayName: string): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base || !/^[a-z0-9]/.test(base)) {
    return `agent-${Date.now().toString(36)}`;
  }
  return base;
}

const ADAPTER_SELECTOR = z.enum(['claude-code', 'codex-cli', 'opencode', 'gsd', 'any']);
const PERMISSION_MODE = z.enum(['auto', 'supervised', 'readonly']);

const AgentCreateBody = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/).optional(),
  displayName: z.string().min(1),
  description: z.string().default(''),
  adapter: ADAPTER_SELECTOR,
  systemPrompt: z.string().optional(),
  contextFiles: z.array(z.string()).optional(),
  model: z.string().optional(),
  permissionMode: PERMISSION_MODE.optional(),
  allowedTools: z.array(z.string()).optional(),
  deniedTools: z.array(z.string()).optional(),
  groupChat: z
    .object({
      mentionPatterns: z.array(z.string()),
      requireMention: z.boolean(),
    })
    .optional(),
});

const AgentPatchSchema = z.object({
  displayName: z.string().min(1).optional(),
  description: z.string().optional(),
  adapter: ADAPTER_SELECTOR.optional(),
  systemPrompt: z.string().optional(),
  contextFiles: z.array(z.string()).optional(),
  model: z.string().optional(),
  permissionMode: PERMISSION_MODE.optional(),
  allowedTools: z.array(z.string()).optional(),
  deniedTools: z.array(z.string()).optional(),
  groupChat: z
    .object({
      mentionPatterns: z.array(z.string()),
      requireMention: z.boolean(),
    })
    .optional(),
});

const AgentTemplateApplyBody = z.object({
  templateId: z.string().min(1),
  fillIns: z.record(z.string(), z.string()).default({}),
});

const AgentRecentMessagesQuery = z.object({
  agentId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  peerId: z.string().optional(),
});

/**
 * Build the MCP internal API fastify instance, including agent-management
 * routes. Exposed separately so unit tests can drive it via `app.inject()`
 * without binding a real port.
 */
export function buildMcpApi(deps: {
  sessionManager: SessionManager;
  versionChecker?: VersionChecker | null;
  triggerUpdate?: () => { status: string; message?: string };
  agentRegistry?: AgentRegistry | null;
}): {
  app: FastifyInstance;
  setChannelRouter: (router: ChannelRouterImpl) => void;
} {
  const { sessionManager, versionChecker, triggerUpdate, agentRegistry } = deps;
  const app = Fastify({ logger: false });
  let channelRouter: ChannelRouterImpl | null = null;

  registerSessionRoutes(app, sessionManager, () => channelRouter, versionChecker, triggerUpdate);
  registerAgentRoutes(app, agentRegistry ?? null, sessionManager);

  return {
    app,
    setChannelRouter(router: ChannelRouterImpl) {
      channelRouter = router;
    },
  };
}

/**
 * Start a lightweight internal HTTP API on a separate port for the MCP Server process.
 * This API exposes SessionManager + AgentRegistry operations as REST endpoints.
 */
export async function startMcpApi(
  sessionManager: SessionManager,
  port: number,
  versionChecker?: VersionChecker | null,
  triggerUpdate?: () => { status: string; message?: string },
  agentRegistry?: AgentRegistry | null,
): Promise<McpApiHandle> {
  const { app, setChannelRouter } = buildMcpApi({
    sessionManager,
    versionChecker,
    triggerUpdate,
    agentRegistry,
  });

  await app.listen({ port, host: '127.0.0.1' });
  console.log(`MCP internal API running on http://127.0.0.1:${port}`);

  return {
    setChannelRouter,
    async close() {
      await app.close();
    },
  };
}

function registerSessionRoutes(
  app: FastifyInstance,
  sessionManager: SessionManager,
  getChannelRouter: () => ChannelRouterImpl | null,
  versionChecker?: VersionChecker | null,
  triggerUpdate?: () => { status: string; message?: string },
): void {
  // List all sessions
  app.get('/api/sessions', async () => {
    return sessionManager.listSessions();
  });

  // Discover unmanaged CLI sessions (must be before :id route)
  app.get<{ Querystring: { cwd?: string } }>(
    '/api/sessions/discover',
    async (request) => {
      const cwd = request.query.cwd ? expandTilde(request.query.cwd) : undefined;
      const discovered = await sessionManager.discoverSessions(cwd);
      return discovered;
    },
  );

  // Get session info
  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const info = sessionManager.getSessionInfo(request.params.id);
    if (!info) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return info;
  });

  // Create session
  app.post<{
    Body: {
      adapter: string;
      cwd: string;
      name?: string;
      model?: string;
      initialPrompt?: string;
      navigate?: boolean;
    };
  }>('/api/sessions', async (request, reply) => {
    const { adapter, cwd: rawCwd, name, model, initialPrompt, navigate } = request.body;
    try {
      const cwd = expandTilde(rawCwd);
      // Auto-create directory if not exists
      mkdirSync(cwd, { recursive: true });

      const session = await sessionManager.createSession(
        adapter,
        { cwd, model },
        name,
      );

      // Send initial prompt if provided
      if (initialPrompt) {
        await sessionManager.sendMessage(session.id, initialPrompt);
      }

      // Auto-navigate to the new session (triggers Web UI switch + IM binding)
      if (navigate) {
        sessionManager.broadcastNavigate(session.id);
      }

      return {
        id: session.id,
        adapterName: session.adapterName,
        displayName: session.displayName,
        status: session.status,
        cwd: session.cwd,
      };
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Rename session
  app.patch<{
    Params: { id: string };
    Body: { displayName: string };
  }>('/api/sessions/:id', async (request, reply) => {
    const { displayName } = request.body;
    try {
      sessionManager.renameSession(request.params.id, displayName);
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Destroy session
  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    try {
      await sessionManager.destroySession(request.params.id);
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Cleanup idle sessions
  app.post<{
    Body: { maxIdleMinutes?: number };
  }>('/api/sessions/cleanup', async (request) => {
    const maxIdleMinutes = request.body?.maxIdleMinutes ?? 60;
    const destroyed = await sessionManager.cleanupIdle(maxIdleMinutes);
    return { destroyed, count: destroyed.length };
  });

  // Import a CLI session
  app.post<{
    Body: {
      sessionId: string;
      adapterName: string;
      displayName?: string;
      cwd: string;
      jsonlPath?: string;
    };
  }>('/api/sessions/import', async (request) => {
    const body = { ...request.body };
    if (body.cwd) body.cwd = expandTilde(body.cwd);
    return sessionManager.importSession(body);
  });

  // Navigate web UI to a specific session
  app.post<{ Body: { sessionId: string } }>(
    '/api/sessions/navigate',
    async (request, reply) => {
      const { sessionId } = request.body;
      const info = sessionManager.getSessionInfo(sessionId);
      if (!info) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      sessionManager.broadcastNavigate(sessionId);
      return { ok: true, sessionId };
    },
  );

  // ─── Channel Provider Endpoints ────────────────────────────────────

  // List all channel providers
  app.get('/api/channels/providers', async (_request, reply) => {
    const channelRouter = getChannelRouter();
    if (!channelRouter) {
      return reply.status(503).send({ error: 'Channel router not initialized' });
    }
    return channelRouter.listProviders();
  });

  // Add a channel provider
  app.post<{
    Body: {
      channelName: string;
      accountId: string;
      credentials: Record<string, string>;
      webhook?: { path: string; secret?: string };
      enabled?: boolean;
    };
  }>('/api/channels/providers', async (request, reply) => {
    const channelRouter = getChannelRouter();
    if (!channelRouter) {
      return reply.status(503).send({ error: 'Channel router not initialized' });
    }
    try {
      await channelRouter.addProviderConfig(request.body);
      return { ok: true, providers: channelRouter.listProviders() };
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Remove a channel provider
  app.delete<{ Params: { id: string } }>(
    '/api/channels/providers/:id',
    async (request, reply) => {
      const channelRouter = getChannelRouter();
      if (!channelRouter) {
        return reply.status(503).send({ error: 'Channel router not initialized' });
      }
      try {
        await channelRouter.removeProviderConfig(decodeURIComponent(request.params.id));
        return { ok: true };
      } catch (err) {
        return reply.status(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // Toggle (enable/disable) a channel provider
  app.patch<{
    Params: { id: string };
    Body: { enabled: boolean };
  }>('/api/channels/providers/:id', async (request, reply) => {
    const channelRouter = getChannelRouter();
    if (!channelRouter) {
      return reply.status(503).send({ error: 'Channel router not initialized' });
    }
    try {
      await channelRouter.toggleProviderConfig(
        decodeURIComponent(request.params.id),
        request.body.enabled,
      );
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ─── Channel Binding Endpoints ─────────────────────────────────────

  // List all channel bindings
  app.get('/api/channels/bindings', async (_request, reply) => {
    const channelRouter = getChannelRouter();
    if (!channelRouter) {
      return reply.status(503).send({ error: 'Channel router not initialized' });
    }
    return channelRouter.listBindings();
  });

  // Bind an IM user to a session OR an Agent to a whole bot account.
  //
  //  - When body has `agentId` plus `channelName` and `accountId`, an
  //    account-level Agent binding is written via bindAgentToAccount.
  //    Returns 409 with `{ conflicts: [...] }` when peer-level bindings
  //    already exist on the same (channel, account).
  //  - Otherwise the legacy `{ identityKey, sessionId }` shape applies a
  //    peer-level session binding via bindSession.
  app.post<{
    Body: Partial<{
      identityKey: string;
      sessionId: string;
      channelName: string;
      accountId: string;
      agentId: string;
    }>;
  }>('/api/channels/bindings', async (request, reply) => {
    const channelRouter = getChannelRouter();
    if (!channelRouter) {
      return reply.status(503).send({ error: 'Channel router not initialized' });
    }

    const { identityKey, sessionId, channelName, accountId, agentId } = request.body;

    if (agentId && channelName && accountId) {
      const result = channelRouter.bindAgentToAccount(channelName, accountId, agentId);
      if (!result.ok) {
        return reply.status(409).send({
          error: `Channel account ${channelName}:${accountId} has peer-level bindings; remove them first.`,
          conflicts: result.conflicts,
        });
      }
      return { ok: true, binding: result.binding };
    }

    if (typeof identityKey !== 'string' || typeof sessionId !== 'string') {
      return reply.status(400).send({
        error: 'Bind requires either { identityKey, sessionId } (peer-level) or { channelName, accountId, agentId } (account-level).',
      });
    }
    const result = channelRouter.bindSession(identityKey, sessionId);
    if (!result.ok) {
      return reply.status(400).send({ error: result.error });
    }
    return { ok: true, bindings: channelRouter.listBindings() };
  });

  // Unbind an IM user (peer-level)
  app.delete<{ Params: { key: string } }>(
    '/api/channels/bindings/:key',
    async (request, reply) => {
      const channelRouter = getChannelRouter();
      if (!channelRouter) {
        return reply.status(503).send({ error: 'Channel router not initialized' });
      }
      try {
        channelRouter.unbindSession(decodeURIComponent(request.params.key));
        return { ok: true };
      } catch (err) {
        return reply.status(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // ─── Account-level Agent Binding Endpoints ─────────────────────────

  app.get('/api/channels/account-bindings', async (_request, reply) => {
    const channelRouter = getChannelRouter();
    if (!channelRouter) {
      return reply.status(503).send({ error: 'Channel router not initialized' });
    }
    return channelRouter.listAccountBindings();
  });

  app.delete<{ Params: { channelName: string; accountId: string } }>(
    '/api/channels/account-bindings/:channelName/:accountId',
    async (request, reply) => {
      const channelRouter = getChannelRouter();
      if (!channelRouter) {
        return reply.status(503).send({ error: 'Channel router not initialized' });
      }
      try {
        channelRouter.unbindAgentFromAccount(
          decodeURIComponent(request.params.channelName),
          decodeURIComponent(request.params.accountId),
        );
        return { ok: true };
      } catch (err) {
        return reply.status(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // Version check for MCP tools
  app.get('/api/version-check', async () => {
    if (!versionChecker) return { error: 'Version checker not available' };
    return versionChecker.check();
  });

  // Trigger update for MCP tools
  app.post('/api/trigger-update', async () => {
    if (!triggerUpdate) return { error: 'Update not available' };
    return triggerUpdate();
  });
}

function registerAgentRoutes(
  app: FastifyInstance,
  agentRegistry: AgentRegistry | null,
  sessionManager: SessionManager,
): void {
  const requireRegistry = (reply: import('fastify').FastifyReply) => {
    if (!agentRegistry) {
      reply.status(503).send({ error: 'Agent registry not available' });
      return null;
    }
    return agentRegistry;
  };

  // GET /api/agents?includeDeleted=true
  app.get<{ Querystring: { includeDeleted?: string } }>(
    '/api/agents',
    async (request, reply) => {
      const registry = requireRegistry(reply);
      if (!registry) return;
      const includeDeleted = request.query.includeDeleted === 'true';
      return registry.list(includeDeleted);
    },
  );

  // GET /api/agents/:id
  app.get<{ Params: { id: string } }>(
    '/api/agents/:id',
    async (request, reply) => {
      const registry = requireRegistry(reply);
      if (!registry) return;
      const def = registry.get(decodeURIComponent(request.params.id));
      if (!def) return reply.status(404).send({ error: 'Agent not found' });
      return def;
    },
  );

  // POST /api/agents — create
  app.post('/api/agents', async (request, reply) => {
    const registry = requireRegistry(reply);
    if (!registry) return;
    const parsed = AgentCreateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid agent payload',
        issues: parsed.error.issues,
      });
    }
    const body = parsed.data;
    if (!body.systemPrompt && (!body.contextFiles || body.contextFiles.length === 0)) {
      return reply
        .status(400)
        .send({ error: 'Agent requires either systemPrompt or contextFiles[].' });
    }

    // Auto-generate id from displayName if caller did not supply one,
    // honoring the registry's slug rule and avoiding collisions.
    let id = body.id;
    if (!id) {
      const base = slugifyAgentId(body.displayName);
      id = base;
      let n = 1;
      while (registry.get(id)) {
        n += 1;
        id = `${base}-${n}`;
      }
    }

    try {
      const created = registry.create({
        id,
        displayName: body.displayName,
        description: body.description,
        adapter: body.adapter as AgentAdapterSelector,
        systemPrompt: body.systemPrompt,
        contextFiles: body.contextFiles ?? [],
        model: body.model,
        permissionMode: body.permissionMode,
        allowedTools: body.allowedTools,
        deniedTools: body.deniedTools,
        groupChat: body.groupChat,
      });
      return created;
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // PATCH /api/agents/:id — update
  app.patch<{ Params: { id: string } }>(
    '/api/agents/:id',
    async (request, reply) => {
      const registry = requireRegistry(reply);
      if (!registry) return;
      const parsed = AgentPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid patch payload',
          issues: parsed.error.issues,
        });
      }
      // Strip server-managed fields defensively, even though the schema
      // already omits them — caller's body type is `unknown`.
      const patch: Partial<AgentDefinition> = { ...parsed.data };
      try {
        const agentId = decodeURIComponent(request.params.id);
        const updated = registry.update(agentId, patch);
        // Hot-reload live sessions so the next inbound picks up the new
        // config (systemPrompt / tools / model / permissionMode). Failures
        // here don't fail the update — the agent definition is the source
        // of truth; reload is best-effort plumbing.
        try {
          const result = await sessionManager.reloadAllSessionsForAgent(agentId);
          if (result.killed > 0) {
            console.log(
              `[Agent] Hot-reloaded ${result.killed}/${result.total} sessions for agent "${agentId}".`,
            );
          }
        } catch (reloadErr) {
          console.warn(
            `[Agent] update succeeded but hot-reload failed for "${agentId}":`,
            reloadErr,
          );
        }
        return updated;
      } catch (err) {
        return reply.status(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // DELETE /api/agents/:id?hard=true
  app.delete<{ Params: { id: string }; Querystring: { hard?: string } }>(
    '/api/agents/:id',
    async (request, reply) => {
      const registry = requireRegistry(reply);
      if (!registry) return;
      const id = decodeURIComponent(request.params.id);
      const hard = request.query.hard === 'true';
      try {
        if (hard) registry.hardDelete(id);
        else registry.softDelete(id);
        return { deleted: true, id, hard };
      } catch (err) {
        return reply.status(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // GET /api/agents/:id/recent-messages?limit=20&peerId=...
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; peerId?: string };
  }>('/api/agents/:id/recent-messages', async (request, reply) => {
    const parsed = AgentRecentMessagesQuery.safeParse({
      agentId: decodeURIComponent(request.params.id),
      limit: request.query.limit,
      peerId: request.query.peerId,
    });
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid query', issues: parsed.error.issues });
    }
    const { agentId, limit, peerId } = parsed.data;
    return sessionManager.getRecentAgentMessages(agentId, { limit, peerId });
  });

  // GET /api/agent-templates
  app.get('/api/agent-templates', async () => {
    const summaries = listAgentTemplateSummaries();
    // Augment with full fillIn metadata so AM can drive the interview.
    return summaries.map((s) => {
      const tmpl = getAgentTemplate(s.id)!;
      return {
        ...s,
        fillIns: tmpl.fillIns.map((f) => ({
          key: f.key,
          prompt: f.prompt,
          required: f.required,
          default: f.default,
          helpText: f.helpText,
        })),
      };
    });
  });

  // POST /api/agent-templates/apply
  app.post('/api/agent-templates/apply', async (request, reply) => {
    const parsed = AgentTemplateApplyBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid request', issues: parsed.error.issues });
    }
    const { templateId, fillIns } = parsed.data;
    const template = getAgentTemplate(templateId);
    if (!template) {
      return reply
        .status(404)
        .send({ error: `Template "${templateId}" not found.` });
    }
    const result = renderTemplate(template, fillIns);
    if (!result.draft) {
      return { missingRequired: result.missingRequired };
    }
    if (result.unresolvedPlaceholders.length > 0) {
      return {
        draft: result.draft,
        unresolvedPlaceholders: result.unresolvedPlaceholders,
      };
    }
    return { draft: result.draft };
  });
}
