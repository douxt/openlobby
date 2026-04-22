import { describe, it, expect } from 'vitest';
import { enforceToolPolicy } from '../policy.js';

describe('enforceToolPolicy', () => {
  it('allows all when policy is empty', () => {
    expect(enforceToolPolicy('Write', {}).decision).toBe('allow');
  });
  it('deny takes precedence over allow', () => {
    expect(enforceToolPolicy('Write', { allowedTools: ['Write'], deniedTools: ['Write'] }))
      .toEqual({ decision: 'deny', reason: expect.stringContaining('denied') });
  });
  it('allow-list blocks unlisted', () => {
    expect(enforceToolPolicy('Bash', { allowedTools: ['Read'] }).decision).toBe('deny');
  });
  it('allow-list permits listed', () => {
    expect(enforceToolPolicy('Read', { allowedTools: ['Read'] }).decision).toBe('allow');
  });
});
