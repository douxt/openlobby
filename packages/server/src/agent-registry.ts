import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type Database from 'better-sqlite3';
import type { AgentDefinition, AgentGroupChatConfig, AgentScript } from '@openlobby/core';
import {
  upsertAgentDefinition,
  getAgentDefinition,
  getAllAgentDefinitions,
  softDeleteAgentDefinition,
  recoverAgentDefinition,
  hardDeleteAgentDefinition,
  type AgentDefinitionRow,
} from './db.js';

/** Default root directory that holds per-agent workspaces. */
export function defaultAgentsRoot(): string {
  return join(homedir(), '.openlobby', 'agents');
}

/** Root directory for a given agent (default agents root). */
export function getAgentRoot(agentId: string): string {
  return join(defaultAgentsRoot(), agentId);
}

export function getAgentWorkspaceDir(agentId: string): string {
  return join(getAgentRoot(agentId), 'workspace');
}

export function getAgentDir(agentId: string): string {
  return join(getAgentRoot(agentId), 'agent-dir');
}

export function getAgentSessionsRoot(agentId: string): string {
  return join(getAgentRoot(agentId), 'sessions');
}

const RESERVED_IDS = new Set(['lobby-manager', 'agent-manager']);

function rowToDef(row: AgentDefinitionRow): AgentDefinition {
  return {
    id: row.id,
    displayName: row.display_name,
    description: row.description,
    adapter: row.adapter as AgentDefinition['adapter'],
    systemPrompt: row.system_prompt ?? undefined,
    contextFiles: JSON.parse(row.context_files_json) as string[],
    model: row.model ?? undefined,
    permissionMode: (row.permission_mode ?? undefined) as AgentDefinition['permissionMode'],
    allowedTools: row.allowed_tools_json ? JSON.parse(row.allowed_tools_json) : undefined,
    deniedTools: row.denied_tools_json ? JSON.parse(row.denied_tools_json) : undefined,
    groupChat: row.group_chat_json
      ? (JSON.parse(row.group_chat_json) as AgentGroupChatConfig)
      : undefined,
    scripts: JSON.parse(row.agent_scripts_json) as AgentScript[],
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function defToRow(def: AgentDefinition): AgentDefinitionRow {
  return {
    id: def.id,
    display_name: def.displayName,
    description: def.description,
    adapter: def.adapter,
    system_prompt: def.systemPrompt ?? null,
    context_files_json: JSON.stringify(def.contextFiles),
    model: def.model ?? null,
    permission_mode: def.permissionMode ?? null,
    allowed_tools_json: def.allowedTools ? JSON.stringify(def.allowedTools) : null,
    denied_tools_json: def.deniedTools ? JSON.stringify(def.deniedTools) : null,
    group_chat_json: def.groupChat ? JSON.stringify(def.groupChat) : null,
    agent_scripts_json: JSON.stringify(def.scripts ?? []),
    deleted_at: def.deletedAt ?? null,
    created_at: def.createdAt,
    updated_at: def.updatedAt,
  };
}

export class AgentRegistry {
  private readonly agentsRoot: string;

  constructor(private db: Database.Database, agentsRootOverride?: string) {
    this.agentsRoot = agentsRootOverride ?? defaultAgentsRoot();
  }

  /** Root directory that holds all per-agent workspaces used by this registry. */
  getAgentsRoot(): string {
    return this.agentsRoot;
  }

  /** Root directory for a specific agent under this registry's agentsRoot. */
  getAgentRoot(agentId: string): string {
    return join(this.agentsRoot, agentId);
  }

  getAgentWorkspaceDir(agentId: string): string {
    return join(this.getAgentRoot(agentId), 'workspace');
  }

  getAgentDir(agentId: string): string {
    return join(this.getAgentRoot(agentId), 'agent-dir');
  }

  getAgentSessionsRoot(agentId: string): string {
    return join(this.getAgentRoot(agentId), 'sessions');
  }

  list(includeDeleted = false): AgentDefinition[] {
    return getAllAgentDefinitions(this.db, includeDeleted).map(rowToDef);
  }

  get(id: string): AgentDefinition | null {
    const row = getAgentDefinition(this.db, id);
    return row ? rowToDef(row) : null;
  }

  create(input: Omit<AgentDefinition, 'createdAt' | 'updatedAt' | 'deletedAt'>): AgentDefinition {
    if (RESERVED_IDS.has(input.id)) {
      throw new Error(`Agent id "${input.id}" is reserved.`);
    }
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(input.id)) {
      throw new Error(`Agent id must match /^[a-z0-9][a-z0-9-_]*$/.`);
    }
    if (getAgentDefinition(this.db, input.id)) {
      throw new Error(`Agent "${input.id}" already exists.`);
    }

    const now = Date.now();
    const def: AgentDefinition = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    upsertAgentDefinition(this.db, defToRow(def));

    // Ensure workspace layout exists (under this registry's agentsRoot)
    mkdirSync(this.getAgentWorkspaceDir(def.id), { recursive: true });
    mkdirSync(this.getAgentDir(def.id), { recursive: true });
    mkdirSync(this.getAgentSessionsRoot(def.id), { recursive: true });
    return def;
  }

  update(id: string, patch: Partial<Omit<AgentDefinition, 'id' | 'createdAt'>>): AgentDefinition {
    const existing = this.get(id);
    if (!existing) throw new Error(`Agent "${id}" not found.`);
    const merged: AgentDefinition = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    upsertAgentDefinition(this.db, defToRow(merged));
    return merged;
  }

  softDelete(id: string): void {
    softDeleteAgentDefinition(this.db, id, Date.now());
  }

  recover(id: string): void {
    recoverAgentDefinition(this.db, id, Date.now());
  }

  hardDelete(id: string): void {
    const def = this.get(id);
    if (def && def.deletedAt == null) {
      throw new Error(`Cannot hard-delete an active agent. Soft-delete first.`);
    }
    hardDeleteAgentDefinition(this.db, id);
  }

  /**
   * Build the effective systemPrompt by concatenating:
   *   definition.systemPrompt + each existing contextFile's content
   * separated by "\n\n---\n\n". Missing files are logged and skipped.
   */
  resolveSystemPrompt(id: string): string {
    const def = this.get(id);
    if (!def) throw new Error(`Agent "${id}" not found.`);

    const parts: string[] = [];
    if (def.systemPrompt?.trim()) parts.push(def.systemPrompt.trim());

    const workspace = this.getAgentWorkspaceDir(id);
    for (const relPath of def.contextFiles) {
      const full = join(workspace, relPath);
      if (!existsSync(full)) {
        console.warn(`[AgentRegistry] context file missing: ${full}`);
        continue;
      }
      try {
        const text = readFileSync(full, 'utf-8').trim();
        if (text) parts.push(text);
      } catch (err) {
        console.warn(`[AgentRegistry] failed to read ${full}:`, err);
      }
    }

    return parts.join('\n\n---\n\n');
  }
}
