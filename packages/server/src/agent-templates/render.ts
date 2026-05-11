import type { AgentTemplate, AgentTemplateDraft } from './types.js';

/** {{key}} substitution — matches `{{ key }}` with optional whitespace. */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export interface RenderResult {
  draft?: AgentTemplateDraft;
  /** Keys that were required but not supplied (and had no default). */
  missingRequired: string[];
  /** Keys that appeared in the template but were neither supplied nor declared as fillIns. */
  unresolvedPlaceholders: string[];
}

/**
 * Render a template into a draft AgentDefinition.
 *
 * - Required fillIns must have either a user-supplied value OR a default;
 *   otherwise `draft` is undefined and `missingRequired` lists the keys.
 * - Optional fillIns may be omitted; their placeholders are replaced with
 *   their default (or empty string if no default).
 * - Placeholders in the template that aren't declared as fillIns are
 *   surfaced via `unresolvedPlaceholders` for diagnostic purposes; they
 *   are left as `{{key}}` literals in the rendered prompt so the failure
 *   is visible.
 */
export function renderTemplate(
  template: AgentTemplate,
  userFillIns: Record<string, string>,
): RenderResult {
  const missingRequired: string[] = [];
  const resolved: Record<string, string> = {};

  for (const fi of template.fillIns) {
    const supplied = userFillIns[fi.key];
    if (supplied !== undefined && supplied !== '') {
      resolved[fi.key] = supplied;
    } else if (fi.default !== undefined) {
      resolved[fi.key] = fi.default;
    } else if (fi.required) {
      missingRequired.push(fi.key);
    } else {
      resolved[fi.key] = '';
    }
  }

  if (missingRequired.length > 0) {
    return { missingRequired, unresolvedPlaceholders: [] };
  }

  const unresolvedPlaceholders: string[] = [];
  const declaredKeys = new Set(template.fillIns.map((f) => f.key));
  const systemPrompt = template.systemPromptTemplate.replace(
    PLACEHOLDER_RE,
    (_match, key: string) => {
      if (key in resolved) return resolved[key];
      if (!declaredKeys.has(key)) unresolvedPlaceholders.push(key);
      return `{{${key}}}`;
    },
  );

  const draft: AgentTemplateDraft = {
    displayName:
      (userFillIns.displayName && userFillIns.displayName.trim()) ||
      pickLocaleName(template, userFillIns.locale),
    description: pickLocaleDescription(template, userFillIns.locale),
    adapter: template.adapter,
    systemPrompt,
    contextFiles: [],
    permissionMode: template.permissionMode,
    allowedTools: template.allowedTools,
    deniedTools: template.deniedTools,
    groupChat: template.groupChat,
    templateId: template.id,
  };

  return { draft, missingRequired: [], unresolvedPlaceholders };
}

function pickLocaleName(template: AgentTemplate, locale?: string): string {
  return locale === 'en' ? template.name.en : template.name['zh-CN'];
}

function pickLocaleDescription(template: AgentTemplate, locale?: string): string {
  return locale === 'en' ? template.description.en : template.description['zh-CN'];
}
