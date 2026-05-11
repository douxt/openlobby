import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../render.js';
import type { AgentTemplate } from '../types.js';
import { AGENT_TEMPLATES, getAgentTemplate, listAgentTemplateSummaries } from '../index.js';

const stubTemplate: AgentTemplate = {
  id: 'stub',
  name: { en: 'Stub', 'zh-CN': '占位' },
  description: { en: 'd', 'zh-CN': '描述' },
  adapter: 'any',
  systemPromptTemplate:
    'Hello {{name}}, you support {{product}}. {{optional}} done.',
  fillIns: [
    { key: 'name', prompt: { en: 'name?', 'zh-CN': '名字？' }, required: true },
    { key: 'product', prompt: { en: 'p?', 'zh-CN': '产品？' }, required: true, default: 'OpenLobby' },
    { key: 'optional', prompt: { en: 'o?', 'zh-CN': '可选？' }, required: false, default: 'OK' },
  ],
};

describe('renderTemplate', () => {
  it('returns missingRequired when a required fillIn has no value and no default', () => {
    const result = renderTemplate(stubTemplate, {});
    expect(result.draft).toBeUndefined();
    expect(result.missingRequired).toEqual(['name']);
  });

  it('uses defaults when user omits a value', () => {
    const result = renderTemplate(stubTemplate, { name: 'Ada' });
    expect(result.missingRequired).toEqual([]);
    expect(result.draft).toBeDefined();
    expect(result.draft!.systemPrompt).toBe(
      'Hello Ada, you support OpenLobby. OK done.',
    );
  });

  it('user values override defaults', () => {
    const result = renderTemplate(stubTemplate, {
      name: 'Ada',
      product: 'Acme',
      optional: 'CUSTOM',
    });
    expect(result.draft!.systemPrompt).toBe(
      'Hello Ada, you support Acme. CUSTOM done.',
    );
  });

  it('reports unresolved placeholders that were never declared as fillIns', () => {
    const bad: AgentTemplate = {
      ...stubTemplate,
      systemPromptTemplate: 'Hi {{name}}, see {{undefinedKey}}.',
    };
    const result = renderTemplate(bad, { name: 'X' });
    expect(result.unresolvedPlaceholders).toContain('undefinedKey');
    expect(result.draft!.systemPrompt).toContain('{{undefinedKey}}');
  });

  it('emits a draft with the templateId for auditing', () => {
    const result = renderTemplate(stubTemplate, { name: 'X' });
    expect(result.draft!.templateId).toBe('stub');
  });

  it('locale fillIn picks zh-CN by default and en when requested', () => {
    const zh = renderTemplate(stubTemplate, { name: 'X' });
    expect(zh.draft!.displayName).toBe('占位');
    const en = renderTemplate(stubTemplate, { name: 'X', locale: 'en' });
    expect(en.draft!.displayName).toBe('Stub');
  });
});

describe('AGENT_TEMPLATES registry', () => {
  it('exposes 5 built-in templates', () => {
    expect(AGENT_TEMPLATES.length).toBe(5);
  });

  it('every template id is unique', () => {
    const ids = AGENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template declares fillIns for every placeholder it uses', () => {
    const placeholderRe = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    for (const t of AGENT_TEMPLATES) {
      const declared = new Set(t.fillIns.map((f) => f.key));
      const used = new Set<string>();
      let m;
      while ((m = placeholderRe.exec(t.systemPromptTemplate)) !== null) {
        used.add(m[1]);
      }
      placeholderRe.lastIndex = 0;
      for (const u of used) {
        expect(declared.has(u), `template "${t.id}" uses {{${u}}} but doesn't declare it as a fillIn`).toBe(true);
      }
    }
  });

  it('getAgentTemplate returns by id and undefined for unknown', () => {
    expect(getAgentTemplate('customer-support')?.id).toBe('customer-support');
    expect(getAgentTemplate('does-not-exist')).toBeUndefined();
  });

  it('listAgentTemplateSummaries returns a stable shape', () => {
    const summaries = listAgentTemplateSummaries();
    expect(summaries.length).toBe(AGENT_TEMPLATES.length);
    for (const s of summaries) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.fillInCount).toBe('number');
      expect(typeof s.requiredFillInCount).toBe('number');
      expect(s.requiredFillInCount).toBeLessThanOrEqual(s.fillInCount);
    }
  });
});
