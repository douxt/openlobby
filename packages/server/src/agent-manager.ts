import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  AgentAdapter,
  McpServerConfig,
  PermissionMode,
  ClaudeCodeSpawnOptions,
} from '@openlobby/core';
import type { SessionManager } from './session-manager.js';
import type Database from 'better-sqlite3';
import { getSessionByOrigin, deleteSession, getServerConfig } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AM_SYSTEM_PROMPT = `# Role
You are the OpenLobby Agent Manager (AM).

You help users design and improve Agents in OpenLobby through interview-driven
creation, prompt review, and template application.

(System prompt under construction — this stub will be replaced in a later task
with the full interview-driven Agent design protocol.)

# Language
Respond in the same language as the user's message.`;

/**
 * MCP tool names that the Agent Manager is allowed to use (auto-approved).
 *
 * TODO: A later task adds dedicated agent_* MCP tools here (agent_list,
 * agent_create, agent_update, agent_template_apply, etc.). For now we
 * leave this empty so AM boots cleanly but cannot mutate any state via
 * MCP — interactions are conversational only.
 */
const AM_ALLOWED_TOOLS: string[] = [
  // TODO: Task 4 adds agent_* MCP tools here
];


/**
 * AgentManager is a special session managed through SessionManager, mirroring
 * LobbyManager. It creates a CLI session with a restricted system prompt
 * focused on Agent design (not session routing). All messaging goes through
 * the standard SessionManager message flow.
 */
export class AgentManager {
  private sessionManager: SessionManager;
  private adapters: Map<string, AgentAdapter>;
  private mcpApiPort: number;
  private db: Database.Database | null;
  private available = false;

  /** The session ID of the Agent Manager session, if created */
  sessionId: string | null = null;
  /** The adapter name used by the Agent Manager */
  adapterName: string | null = null;

  constructor(
    sessionManager: SessionManager,
    adapters: Map<string, AgentAdapter>,
    mcpApiPort: number,
    db?: Database.Database,
  ) {
    this.sessionManager = sessionManager;
    this.adapters = adapters;
    this.mcpApiPort = mcpApiPort;
    this.db = db ?? null;
  }

  /** Agent Manager working directory (sibling of lobby-manager). */
  private get cwd(): string {
    return resolve(homedir(), '.agentlobby', 'agent-manager');
  }

  /** SpawnOptions shared by both create and resume */
  private buildSpawnOptions(): ClaudeCodeSpawnOptions {
    return {
      cwd: this.cwd,
      systemPrompt: AM_SYSTEM_PROMPT,
      permissionMode: 'auto' as PermissionMode,
      allowedTools: AM_ALLOWED_TOOLS,
      mcpServers: this.buildMcpServers(),
    };
  }

  async init(preferredAdapter?: string): Promise<void> {
    // AM reads the SAME defaultAdapter server_config key as LM — by design,
    // a single workspace-wide default adapter governs both meta-agents.
    const configAdapter = preferredAdapter ?? (this.db ? getServerConfig(this.db, 'defaultAdapter') : undefined);

    const adapterPriority = configAdapter
      ? [configAdapter, ...Array.from(this.adapters.keys()).filter((n) => n !== configAdapter)]
      : ['claude-code', ...Array.from(this.adapters.keys()).filter((n) => n !== 'claude-code')];

    // Find the best available adapter
    for (const name of adapterPriority) {
      const adapter = this.adapters.get(name);
      if (!adapter) continue;
      try {
        const detection = await adapter.detect();
        if (detection.installed) {
          this.adapterName = name;
          this.available = true;
          console.log(`[AM] Using ${adapter.displayName} as driver`);
          break;
        }
      } catch {
        // Skip adapter if detection fails
      }
    }

    if (!this.available || !this.adapterName) {
      console.log('[AM] No CLI adapter available — Agent Manager disabled');
      return;
    }

    // Ensure Agent Manager directories exist
    mkdirSync(this.cwd, { recursive: true });
    mkdirSync(resolve(this.cwd, 'projects'), { recursive: true });

    // Try to resume existing Agent Manager session (preserves history)
    if (this.db) {
      const existingRow = getSessionByOrigin(this.db, 'agent-manager');
      if (existingRow) {
        // Validate the session ID exists in the CLI's storage before attempting resume.
        const adapter = this.adapters.get(this.adapterName);
        let sessionValid = true;
        if (adapter) {
          try {
            const history = await adapter.readSessionHistory(existingRow.id);
            if (history.length === 0) {
              console.warn(`[AM] Session ${existingRow.id} has no history in CLI storage — may be stale UUID`);
              sessionValid = false;
            }
          } catch {
            sessionValid = false;
          }
        }

        if (sessionValid) {
          try {
            const session = await this.sessionManager.resumeSession(
              existingRow.id,
              this.adapterName,
              this.buildSpawnOptions(),
              'Agent Manager',
              'agent-manager',
            );
            this.sessionId = session.id;
            console.log(`[AM] Resumed existing session: ${this.sessionId}`);
            this.trackSessionIdChanges();
            return;
          } catch (err) {
            console.warn(`[AM] Failed to resume session ${existingRow.id}, creating fresh:`, err);
          }
        } else {
          console.warn(`[AM] Stale session ${existingRow.id}, creating fresh`);
        }
        deleteSession(this.db, existingRow.id);
      }
    }

    // Create fresh Agent Manager session
    try {
      const session = await this.sessionManager.createSession(
        this.adapterName,
        this.buildSpawnOptions(),
        'Agent Manager',
        'agent-manager',
      );
      this.sessionId = session.id;
      console.log(`[AM] Session created: ${this.sessionId}`);
    } catch (err) {
      console.error('[AM] Failed to create session:', err);
      this.available = false;
      return;
    }

    this.trackSessionIdChanges();
  }

  /** Listen for session ID sync (UUID → real CLI session ID) and keep this.sessionId up to date */
  private trackSessionIdChanges(): void {
    this.sessionManager.onSessionUpdate('am-id-sync', (session, previousId) => {
      if (previousId && previousId === this.sessionId) {
        console.log(`[AM] Session ID synced: ${this.sessionId} → ${session.id}`);
        this.sessionId = session.id;
      }
    });
  }

  isAvailable(): boolean {
    return this.available && this.sessionId !== null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  private buildMcpServers(): Record<string, McpServerConfig> {
    const isDev = __dirname.endsWith('/src') || __dirname.endsWith('\\src');
    const mcpServerPath = isDev
      ? resolve(__dirname, 'mcp-server.ts')
      : resolve(__dirname, 'mcp-server.js');
    const command = isDev ? 'tsx' : 'node';

    console.log(`[AM] MCP Server: ${command} ${mcpServerPath}`);

    return {
      'openlobby': {
        command,
        args: [mcpServerPath],
        env: { OPENLOBBY_API: `http://127.0.0.1:${this.mcpApiPort}` },
      },
    };
  }

  /**
   * Destroy the current AM session and recreate with a new adapter.
   */
  async rebuild(newAdapterName: string): Promise<void> {
    this.destroy();
    this.available = false;
    this.adapterName = null;
    this.sessionId = null;

    this.sessionManager.removeSessionUpdateListener('am-id-sync');

    await this.init(newAdapterName);
  }

  destroy(): void {
    if (this.sessionId) {
      this.sessionManager.destroySession(this.sessionId).catch((err) => {
        console.error('[AM] Failed to destroy session:', err);
      });
      this.sessionId = null;
    }
  }
}
