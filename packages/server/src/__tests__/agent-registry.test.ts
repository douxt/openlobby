import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb } from '../db.js';
import { AgentRegistry } from '../agent-registry.js';

describe('AgentRegistry', () => {
  let db: Database.Database;
  let registry: AgentRegistry;
  let agentsRoot: string;

  beforeEach(() => {
    const tmp = mkdtempSync(join(tmpdir(), 'ol-agent-'));
    db = initDb(join(tmp, 'sessions.db'));
    // Override agentsRoot so tests don't create stray dirs under ~/.openlobby
    agentsRoot = join(tmp, 'agents');
    registry = new AgentRegistry(db, agentsRoot);
  });

  it('rejects reserved id', () => {
    expect(() => registry.create({
      id: 'lobby-manager',
      displayName: 'x',
      description: '',
      adapter: 'any',
      contextFiles: [],
    })).toThrow(/reserved/);
  });

  it('creates / lists / soft-deletes / recovers', () => {
    const a = registry.create({
      id: 'support',
      displayName: 'Support',
      description: 'help desk',
      adapter: 'claude-code',
      contextFiles: [],
    });
    expect(a.id).toBe('support');
    expect(registry.list()).toHaveLength(1);
    // Workspace layout is created under the override root.
    expect(existsSync(registry.getAgentWorkspaceDir('support'))).toBe(true);
    expect(existsSync(registry.getAgentSessionsRoot('support'))).toBe(true);

    registry.softDelete('support');
    expect(registry.list()).toHaveLength(0);
    expect(registry.list(true)).toHaveLength(1);
    expect(registry.list(true)[0].deletedAt).toBeGreaterThan(0);

    registry.recover('support');
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0].deletedAt).toBeUndefined();
  });

  it('resolveSystemPrompt concatenates inline + files', () => {
    registry.create({
      id: 'foo',
      displayName: 'Foo',
      description: '',
      adapter: 'any',
      systemPrompt: 'Inline prompt',
      contextFiles: ['SOUL.md', 'MISSING.md'],
    });
    const ws = registry.getAgentWorkspaceDir('foo');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'SOUL.md'), 'I am a bot.');

    const prompt = registry.resolveSystemPrompt('foo');
    expect(prompt).toContain('Inline prompt');
    expect(prompt).toContain('I am a bot.');
  });

  it('round-trips scripts[] through create / get / update', () => {
    const created = registry.create({
      id: 'tooler',
      displayName: 'Tooler',
      description: '',
      adapter: 'claude-code',
      contextFiles: [],
      systemPrompt: 'x',
      scripts: [
        {
          name: 'greet',
          path: 'scripts/greet.py',
          purpose: 'greet a city',
          testPath: 'tests/test_greet.py',
          validatedAt: 123,
          testStatus: 'passed',
        },
      ],
    });
    expect(created.scripts).toHaveLength(1);
    expect(registry.get('tooler')!.scripts).toEqual([
      {
        name: 'greet',
        path: 'scripts/greet.py',
        purpose: 'greet a city',
        testPath: 'tests/test_greet.py',
        validatedAt: 123,
        testStatus: 'passed',
      },
    ]);

    // create without scripts → empty array after a DB round-trip (mirrors
    // contextFiles). NB: create() returns the in-memory input, so read it back
    // via get() to assert the persisted/normalized value.
    registry.create({
      id: 'bare',
      displayName: 'Bare',
      description: '',
      adapter: 'any',
      contextFiles: [],
      systemPrompt: 'x',
    });
    expect(registry.get('bare')!.scripts).toEqual([]);

    // update adds scripts
    const updated = registry.update('bare', {
      scripts: [{ name: 'a', path: 'scripts/a.sh', purpose: 'p' }],
    });
    expect(updated.scripts).toEqual([{ name: 'a', path: 'scripts/a.sh', purpose: 'p' }]);
    expect(registry.get('bare')!.scripts![0].name).toBe('a');
  });
});
