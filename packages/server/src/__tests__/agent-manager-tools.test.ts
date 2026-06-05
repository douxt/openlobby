import { describe, it, expect } from 'vitest';
import { AM_ALLOWED_TOOLS } from '../agent-manager.js';

describe('AM_ALLOWED_TOOLS', () => {
  it('includes the native authoring tools needed to scaffold + test scripts', () => {
    for (const t of ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash']) {
      expect(AM_ALLOWED_TOOLS).toContain(t);
    }
  });

  it('retains the agent-design MCP tools', () => {
    expect(AM_ALLOWED_TOOLS).toContain('mcp__openlobby__agent_create');
    expect(AM_ALLOWED_TOOLS).toContain('mcp__openlobby__agent_update');
    expect(AM_ALLOWED_TOOLS).toContain('mcp__openlobby__agent_get');
  });
});
