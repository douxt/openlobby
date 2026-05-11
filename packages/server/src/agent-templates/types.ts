/**
 * Agent template system — used by Agent Manager (AM) to lower the
 * cold-start barrier for creating a new Agent.
 *
 * A template is a partial AgentDefinition with named {{placeholders}}
 * in the systemPrompt that the user fills in through AM's interview
 * flow. The render step produces a complete draft AgentDefinition that
 * AM presents for user confirmation before persisting.
 */

import type {
  AgentAdapterSelector,
  AgentGroupChatConfig,
} from '@openlobby/core';
import type { PermissionMode } from '@openlobby/core';

/** A bilingual short string. AM picks the matching locale at runtime. */
export interface BilingualString {
  en: string;
  'zh-CN': string;
}

/**
 * One field the user must fill in (or accept the default for) before
 * the template can be rendered into an AgentDefinition draft.
 */
export interface AgentTemplateFillIn {
  /** Placeholder key — appears as `{{key}}` in systemPromptTemplate. */
  key: string;
  /** The question AM asks the user. */
  prompt: BilingualString;
  /** When true, AM blocks render until the user supplies a value. */
  required: boolean;
  /** Default substituted when user omits the fill-in. */
  default?: string;
  /** Optional extra help shown alongside the prompt. */
  helpText?: BilingualString;
}

/**
 * A reusable Agent recipe. Templates are TypeScript modules (not YAML or
 * JSON) so they are type-checked at build time and tree-shakeable. To
 * add or edit a template, drop a new file in ./templates/ and register
 * it in ./index.ts.
 */
export interface AgentTemplate {
  /** Slug; used as `template_id` in MCP calls. */
  id: string;
  name: BilingualString;
  description: BilingualString;
  /** Suggested adapter; 'any' means "use whatever is installed". */
  adapter: AgentAdapterSelector;
  /** System prompt with {{key}} substitutions resolved at render time. */
  systemPromptTemplate: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  deniedTools?: string[];
  /** When the template is intended for group chats, set this. */
  groupChat?: AgentGroupChatConfig;
  /** User-supplied values that flow into systemPromptTemplate. */
  fillIns: AgentTemplateFillIn[];
}

/**
 * A rendered AgentDefinition draft — has every field an Agent needs to
 * be created, except the persistence-managed fields (id, createdAt,
 * updatedAt, deletedAt). AM presents this to the user for confirmation
 * before calling `agent_create`.
 */
export interface AgentTemplateDraft {
  displayName: string;
  description: string;
  adapter: AgentAdapterSelector;
  systemPrompt: string;
  contextFiles: string[];
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  deniedTools?: string[];
  groupChat?: AgentGroupChatConfig;
  /** Which template produced this draft — useful for telemetry/auditing. */
  templateId: string;
}
