#!/usr/bin/env node

/**
 * OpenLobby MCP Server — stdio entry point.
 *
 * Spawned by CLI (e.g. Claude Code) as an MCP server process.
 * Exposes session management operations as MCP tools.
 * Calls the MCP internal API (default port 3002) for actual operations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const LOBBY_API = process.env.OPENLOBBY_API ?? process.env.AGENT_LOBBY_API ?? 'http://127.0.0.1:3002';

async function apiCall(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${LOBBY_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? `API error: ${res.status}`,
    );
  }
  return data;
}

function textResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

async function main() {
  const server = new McpServer({
    name: 'openlobby',
    version: '0.3.3',
  });

  // --- Tool: lobby_list_sessions ---
  server.tool(
    'lobby_list_sessions',
    'List all OpenLobby managed sessions with their status, adapter, and working directory',
    {},
    async () => {
      const sessions = await apiCall('GET', '/api/sessions');
      return textResult(sessions);
    },
  );

  // --- Tool: lobby_create_session ---
  server.tool(
    'lobby_create_session',
    'Create a new Agentic CLI session. Directory will be auto-created if it does not exist. By default, auto-navigates the user to the new session (Web UI + IM channel switch).',
    {
      adapter: z.enum(['claude-code', 'codex-cli', 'opencode', 'gsd']).default('claude-code').describe('CLI adapter to use (default: claude-code)'),
      cwd: z.string().describe('Working directory for the session'),
      name: z.string().optional().describe('Display name for the session'),
      model: z.string().optional().describe('Model to use (e.g. claude-sonnet-4-5-20250514)'),
      initialPrompt: z.string().optional().describe('Optional initial message — only pass when explicitly needed, not by default'),
      autoNavigate: z.boolean().default(true).describe('Auto-navigate user to the new session after creation (default: true)'),
    },
    async ({ adapter, cwd, name, model, initialPrompt, autoNavigate }) => {
      const result = await apiCall('POST', '/api/sessions', {
        adapter,
        cwd,
        name,
        model,
        initialPrompt,
        navigate: autoNavigate,
      });
      return textResult(result);
    },
  );

  // --- Tool: lobby_rename_session ---
  server.tool(
    'lobby_rename_session',
    'Rename an existing session',
    {
      sessionId: z.string().describe('Session ID to rename'),
      newName: z.string().describe('New display name'),
    },
    async ({ sessionId, newName }) => {
      await apiCall('PATCH', `/api/sessions/${encodeURIComponent(sessionId)}`, {
        displayName: newName,
      });
      return textResult({ ok: true, sessionId, newName });
    },
  );

  // --- Tool: lobby_destroy_session ---
  server.tool(
    'lobby_destroy_session',
    'Destroy/stop a session permanently',
    {
      sessionId: z.string().describe('Session ID to destroy'),
    },
    async ({ sessionId }) => {
      await apiCall('DELETE', `/api/sessions/${encodeURIComponent(sessionId)}`);
      return textResult({ ok: true, sessionId });
    },
  );

  // --- Tool: lobby_session_info ---
  server.tool(
    'lobby_session_info',
    'Get detailed information about a specific session (status, model, working directory, etc.)',
    {
      sessionId: z.string().describe('Session ID to query'),
    },
    async ({ sessionId }) => {
      const info = await apiCall(
        'GET',
        `/api/sessions/${encodeURIComponent(sessionId)}`,
      );
      return textResult(info);
    },
  );

  // --- Tool: lobby_cleanup_idle ---
  server.tool(
    'lobby_cleanup_idle',
    'Clean up sessions that have been idle longer than the specified duration',
    {
      maxIdleMinutes: z
        .number()
        .default(60)
        .describe('Maximum idle time in minutes before a session is cleaned up'),
    },
    async ({ maxIdleMinutes }) => {
      const result = await apiCall('POST', '/api/sessions/cleanup', {
        maxIdleMinutes,
      });
      return textResult(result);
    },
  );

  // --- Tool: lobby_discover_sessions ---
  server.tool(
    'lobby_discover_sessions',
    'Discover unmanaged CLI sessions from the filesystem (filters out already-managed ones)',
    {
      cwd: z.string().optional().describe('Optional directory to scope discovery'),
    },
    async ({ cwd }) => {
      const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : '';
      const result = await apiCall('GET', `/api/sessions/discover${query}`);
      return textResult(result);
    },
  );

  // --- Tool: lobby_import_session ---
  server.tool(
    'lobby_import_session',
    'Import a discovered CLI session into OpenLobby management',
    {
      sessionId: z.string().describe('Session ID to import'),
      adapterName: z.enum(['claude-code', 'codex-cli', 'opencode', 'gsd']).describe('Adapter that owns the session'),
      cwd: z.string().describe('Working directory of the session'),
      displayName: z.string().optional().describe('Display name for the imported session'),
      jsonlPath: z.string().optional().describe('Path to the JSONL history file'),
    },
    async ({ sessionId, adapterName, cwd, displayName, jsonlPath }) => {
      const result = await apiCall('POST', '/api/sessions/import', {
        sessionId,
        adapterName,
        cwd,
        displayName,
        jsonlPath,
      });
      return textResult(result);
    },
  );

  // --- Tool: lobby_navigate_session ---
  server.tool(
    'lobby_navigate_session',
    'Navigate the web UI to a specific session (switches the active view). Always confirm with user before navigating.',
    {
      sessionId: z.string().describe('Session ID to navigate to'),
    },
    async ({ sessionId }) => {
      const result = await apiCall('POST', '/api/sessions/navigate', {
        sessionId,
      });
      return textResult(result);
    },
  );

  // ─── Channel Provider Tools ──────────────────────────────────────

  // --- Tool: lobby_list_channel_providers ---
  server.tool(
    'lobby_list_channel_providers',
    'List all configured IM channel providers (e.g. WeCom, Telegram) with their status',
    {},
    async () => {
      const providers = await apiCall('GET', '/api/channels/providers');
      return textResult(providers);
    },
  );

  // --- Tool: lobby_add_channel_provider ---
  server.tool(
    'lobby_add_channel_provider',
    'Add and start a new IM channel provider (e.g. WeCom bot, Telegram bot)',
    {
      channelName: z.string().describe('Channel type: "wecom", "telegram", etc.'),
      accountId: z.string().describe('Bot/app ID for this channel'),
      credentials: z.record(z.string(), z.string()).describe('Provider credentials (e.g. { "botToken": "..." } for Telegram, { "corpId": "...", "agentId": "...", "secret": "..." } for WeCom)'),
      webhook: z.object({
        path: z.string(),
        secret: z.string().optional(),
      }).optional().describe('Optional webhook configuration'),
      enabled: z.boolean().default(true).describe('Whether to enable immediately (default: true)'),
    },
    async ({ channelName, accountId, credentials, webhook, enabled }) => {
      const result = await apiCall('POST', '/api/channels/providers', {
        channelName,
        accountId,
        credentials,
        webhook,
        enabled,
      });
      return textResult(result);
    },
  );

  // --- Tool: lobby_remove_channel_provider ---
  server.tool(
    'lobby_remove_channel_provider',
    'Remove an IM channel provider and stop it',
    {
      providerId: z.string().describe('Provider ID to remove (format: "channelName:accountId")'),
    },
    async ({ providerId }) => {
      await apiCall('DELETE', `/api/channels/providers/${encodeURIComponent(providerId)}`);
      return textResult({ ok: true, providerId });
    },
  );

  // --- Tool: lobby_toggle_channel_provider ---
  server.tool(
    'lobby_toggle_channel_provider',
    'Enable or disable an existing IM channel provider',
    {
      providerId: z.string().describe('Provider ID (format: "channelName:accountId")'),
      enabled: z.boolean().describe('true to enable, false to disable'),
    },
    async ({ providerId, enabled }) => {
      await apiCall('PATCH', `/api/channels/providers/${encodeURIComponent(providerId)}`, {
        enabled,
      });
      return textResult({ ok: true, providerId, enabled });
    },
  );

  // ─── Channel Binding Tools ───────────────────────────────────────

  // --- Tool: lobby_list_channel_bindings ---
  server.tool(
    'lobby_list_channel_bindings',
    'List all IM user → session bindings (shows which IM users are connected to which sessions)',
    {},
    async () => {
      const bindings = await apiCall('GET', '/api/channels/bindings');
      return textResult(bindings);
    },
  );

  // --- Tool: lobby_bind_channel ---
  server.tool(
    'lobby_bind_channel',
    'Bind an IM user to a specific session (route their messages to that session)',
    {
      identityKey: z.string().describe('Identity key of the IM user (format: "channelName:accountId:peerId")'),
      sessionId: z.string().describe('Session ID to bind to'),
    },
    async ({ identityKey, sessionId }) => {
      const result = await apiCall('POST', '/api/channels/bindings', {
        identityKey,
        sessionId,
      });
      return textResult(result);
    },
  );

  // --- Tool: lobby_unbind_channel ---
  server.tool(
    'lobby_unbind_channel',
    'Unbind an IM user from their current session (returns them to Lobby Manager)',
    {
      identityKey: z.string().describe('Identity key of the IM user to unbind'),
    },
    async ({ identityKey }) => {
      await apiCall('DELETE', `/api/channels/bindings/${encodeURIComponent(identityKey)}`);
      return textResult({ ok: true, identityKey });
    },
  );

  // ─── Agent CRUD Tools ────────────────────────────────────────────

  const AGENT_ADAPTER_ENUM = z.enum(['claude-code', 'codex-cli', 'opencode', 'gsd', 'any']);
  const AGENT_PERMISSION_MODE = z.enum(['auto', 'supervised', 'readonly']);
  const AGENT_GROUP_CHAT = z
    .object({
      mentionPatterns: z.array(z.string()),
      requireMention: z.boolean(),
    })
    .optional();

  // --- Tool: agent_list ---
  server.tool(
    'agent_list',
    'List all Agent definitions managed by OpenLobby (excludes soft-deleted by default)',
    {
      includeDeleted: z.boolean().default(false).describe('Include soft-deleted agents'),
    },
    async ({ includeDeleted }) => {
      const qs = includeDeleted ? '?includeDeleted=true' : '';
      const result = await apiCall('GET', `/api/agents${qs}`);
      return textResult(result);
    },
  );

  // --- Tool: agent_get ---
  server.tool(
    'agent_get',
    'Fetch a single Agent definition by id (returns null if not found)',
    {
      id: z.string().describe('Agent id'),
    },
    async ({ id }) => {
      const result = await apiCall('GET', `/api/agents/${encodeURIComponent(id)}`);
      return textResult(result);
    },
  );

  // --- Tool: agent_create ---
  server.tool(
    'agent_create',
    'Create a new Agent definition. id is auto-generated from displayName if omitted. Requires displayName, adapter, description, and either systemPrompt or contextFiles.',
    {
      id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/).optional().describe('Agent id (auto-generated from displayName if omitted)'),
      displayName: z.string().min(1).describe('Human-readable agent name'),
      description: z.string().default('').describe('Short description of the agent'),
      adapter: AGENT_ADAPTER_ENUM.describe('Adapter selector'),
      systemPrompt: z.string().optional().describe('Inline system prompt (concatenated with contextFiles)'),
      contextFiles: z.array(z.string()).optional().describe('Workspace-relative file paths to concatenate into the system prompt'),
      model: z.string().optional(),
      permissionMode: AGENT_PERMISSION_MODE.optional(),
      allowedTools: z.array(z.string()).optional(),
      deniedTools: z.array(z.string()).optional(),
      groupChat: AGENT_GROUP_CHAT,
    },
    async (input) => {
      const result = await apiCall('POST', '/api/agents', input);
      return textResult(result);
    },
  );

  // --- Tool: agent_update ---
  server.tool(
    'agent_update',
    'Patch an existing Agent definition. id, createdAt, updatedAt, and deletedAt are stripped server-side.',
    {
      id: z.string().describe('Agent id to update'),
      patch: z
        .object({
          displayName: z.string().min(1).optional(),
          description: z.string().optional(),
          adapter: AGENT_ADAPTER_ENUM.optional(),
          systemPrompt: z.string().optional(),
          contextFiles: z.array(z.string()).optional(),
          model: z.string().optional(),
          permissionMode: AGENT_PERMISSION_MODE.optional(),
          allowedTools: z.array(z.string()).optional(),
          deniedTools: z.array(z.string()).optional(),
          groupChat: AGENT_GROUP_CHAT,
        })
        .describe('Partial AgentDefinition; only supplied fields are applied'),
    },
    async ({ id, patch }) => {
      const result = await apiCall(
        'PATCH',
        `/api/agents/${encodeURIComponent(id)}`,
        patch,
      );
      return textResult(result);
    },
  );

  // --- Tool: agent_delete ---
  server.tool(
    'agent_delete',
    'Delete an Agent. Soft-delete by default; pass hard=true to permanently remove (requires the agent to already be soft-deleted).',
    {
      id: z.string().describe('Agent id'),
      hard: z.boolean().default(false).describe('When true, hard-delete (irreversible). User confirmation is enforced by AM at the conversation layer, not by this tool.'),
    },
    async ({ id, hard }) => {
      const qs = hard ? '?hard=true' : '';
      const result = await apiCall(
        'DELETE',
        `/api/agents/${encodeURIComponent(id)}${qs}`,
      );
      return textResult(result);
    },
  );

  // ─── Agent Diagnostics & Templates ───────────────────────────────

  // --- Tool: agent_recent_messages ---
  server.tool(
    'agent_recent_messages',
    'Read recent conversation messages from sessions owned by a given Agent. Used for diagnosing prompt issues.',
    {
      agentId: z.string().describe('Agent id whose sessions to inspect'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max messages to return (1-100)'),
      peerId: z.string().optional().describe('Scope to a single peer'),
    },
    async ({ agentId, limit, peerId }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (peerId) params.set('peerId', peerId);
      const result = await apiCall(
        'GET',
        `/api/agents/${encodeURIComponent(agentId)}/recent-messages?${params.toString()}`,
      );
      return textResult(result);
    },
  );

  // --- Tool: agent_template_list ---
  server.tool(
    'agent_template_list',
    'List available Agent templates with their fillIn metadata so AM can interview the user.',
    {},
    async () => {
      const result = await apiCall('GET', '/api/agent-templates');
      return textResult(result);
    },
  );

  // --- Tool: agent_template_apply ---
  server.tool(
    'agent_template_apply',
    'Render a template into a draft AgentDefinition. Does NOT persist anything — AM presents the draft for user confirmation, then calls agent_create.',
    {
      templateId: z.string().describe('Template id (from agent_template_list)'),
      fillIns: z.record(z.string(), z.string()).default({}).describe('User-supplied placeholder values'),
    },
    async ({ templateId, fillIns }) => {
      const result = await apiCall('POST', '/api/agent-templates/apply', {
        templateId,
        fillIns,
      });
      return textResult(result);
    },
  );

  // --- Tool: lobby_check_update ---
  server.tool(
    'lobby_check_update',
    'Check if a newer version of OpenLobby is available on npm',
    {},
    async () => {
      const result = await apiCall('GET', '/api/version-check');
      return textResult(result);
    },
  );

  // --- Tool: lobby_update_server ---
  server.tool(
    'lobby_update_server',
    'Update OpenLobby to the latest version and auto-restart the server. For npx users, shows a hint instead.',
    {},
    async () => {
      const check = (await apiCall('GET', '/api/version-check')) as {
        hasUpdate?: boolean;
        currentVersion?: string;
        latestVersion?: string | null;
      };
      if (!check.hasUpdate) {
        return textResult({
          status: 'up-to-date',
          message: `Already on the latest version (${check.currentVersion}).`,
        });
      }
      const result = await apiCall('POST', '/api/trigger-update');
      return textResult(result);
    },
  );

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP Server fatal error:', err);
  process.exit(1);
});
