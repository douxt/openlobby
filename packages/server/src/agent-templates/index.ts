/**
 * Agent template registry.
 *
 * To add a new template:
 *   1. Create `./templates/<my-template>.ts` exporting an `AgentTemplate`.
 *   2. Import and add it to TEMPLATES below.
 *   3. Update docs/agent-manager.md.
 *
 * IDs must be unique slugs and never reused after release (template id is
 * persisted on the rendered Agent for telemetry/auditing).
 */

import type { AgentTemplate } from './types.js';
import { customerSupportTemplate } from './templates/customer-support.js';
import { codeReviewerTemplate } from './templates/code-reviewer.js';
import { groupLightAssistantTemplate } from './templates/group-light-assistant.js';
import { standupSummarizerTemplate } from './templates/standup-summarizer.js';
import { alertTriagerTemplate } from './templates/alert-triager.js';

export const AGENT_TEMPLATES: readonly AgentTemplate[] = [
  customerSupportTemplate,
  codeReviewerTemplate,
  groupLightAssistantTemplate,
  standupSummarizerTemplate,
  alertTriagerTemplate,
] as const;

/** Returns undefined if no template matches the given id. */
export function getAgentTemplate(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((t) => t.id === id);
}

/** Returns a stable list of {id, name, description, fillIns} for catalogue display. */
export function listAgentTemplateSummaries(): Array<{
  id: string;
  name: AgentTemplate['name'];
  description: AgentTemplate['description'];
  fillInCount: number;
  requiredFillInCount: number;
}> {
  return AGENT_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    fillInCount: t.fillIns.length,
    requiredFillInCount: t.fillIns.filter((f) => f.required).length,
  }));
}

export type { AgentTemplate, AgentTemplateFillIn, AgentTemplateDraft, BilingualString } from './types.js';
export { renderTemplate } from './render.js';
export type { RenderResult } from './render.js';

/** Internal invariant check (called at module load). Throws on duplicate ids. */
(function assertUniqueIds() {
  const seen = new Set<string>();
  for (const t of AGENT_TEMPLATES) {
    if (seen.has(t.id)) {
      throw new Error(`Duplicate AgentTemplate id: ${t.id}`);
    }
    seen.add(t.id);
  }
})();
