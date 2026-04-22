/**
 * Shared adapter tool policy.
 *
 * Every adapter calls {@link enforceToolPolicy} at the top of its approval
 * hook so Agent-mode sessions (and any other caller that configures
 * `allowedTools` / `deniedTools`) enforce a uniform allow/deny gate before
 * the adapter-specific mode logic runs.
 */

export interface ToolPolicy {
  allowedTools?: string[];
  deniedTools?: string[];
}

export type PolicyDecision =
  | { decision: 'allow' }
  | { decision: 'deny'; reason: string };

/**
 * Apply allow/deny policy to a tool call.
 * - Deny-list wins.
 * - If allowedTools is undefined, all non-denied tools are allowed.
 * - If allowedTools is set, only those tools are allowed.
 */
export function enforceToolPolicy(toolName: string, policy: ToolPolicy): PolicyDecision {
  if (policy.deniedTools?.includes(toolName)) {
    return { decision: 'deny', reason: `Tool "${toolName}" is denied by Agent policy.` };
  }
  if (policy.allowedTools && !policy.allowedTools.includes(toolName)) {
    return { decision: 'deny', reason: `Tool "${toolName}" is not in the allow-list.` };
  }
  return { decision: 'allow' };
}
