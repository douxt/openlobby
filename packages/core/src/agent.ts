import type { PermissionMode } from './types.js';

/** Adapter selector for an Agent; 'any' = first installed adapter at spawn time. */
export type AgentAdapterSelector =
  | 'claude-code'
  | 'codex-cli'
  | 'opencode'
  | 'gsd'
  | 'any';

/** Group-chat behavior for an Agent. */
export interface AgentGroupChatConfig {
  /** Case-insensitive substrings that trigger the agent in a group chat. */
  mentionPatterns: string[];
  /**
   * When true (default), the agent only responds to group messages matching
   * mentionPatterns. When false, the agent responds to all group messages.
   */
  requireMention: boolean;
}

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

/** Declarative template for an Agent-mode session. */
export interface AgentDefinition {
  /** Unique slug-like id. 'lobby-manager' is reserved and cannot be used. */
  id: string;
  displayName: string;
  description: string;

  adapter: AgentAdapterSelector;

  /** Inline system prompt (optional). Combined with contextFiles at spawn. */
  systemPrompt?: string;

  /**
   * Files under the agent's workspace directory to concatenate into the final
   * systemPrompt. Separator: "\n\n---\n\n". Missing files are skipped with a warning.
   * OpenClaw-compatible names: SOUL.md, USER.md, AGENTS.md, TOOLS.md, IDENTITY.md.
   */
  contextFiles: string[];

  model?: string;
  permissionMode?: PermissionMode;

  /** Tool allow-list. null/undefined = no restriction. */
  allowedTools?: string[];
  /** Tool deny-list. Takes precedence over allow-list. */
  deniedTools?: string[];
  /** Runtime tool scripts authored for this agent by Agent Manager. */
  scripts?: AgentScript[];

  /**
   * Group-chat behavior. When undefined, agent does NOT respond in groups
   * (safe default, aligned with OpenClaw).
   */
  groupChat?: AgentGroupChatConfig;

  /** Soft-delete marker. null/undefined = active. */
  deletedAt?: number;

  createdAt: number;
  updatedAt: number;
}
