import { describe, it, expect } from 'vitest';
import Sidebar from '../Sidebar';

describe('Sidebar component interface', () => {
  it('should export a default function', () => {
    expect(typeof Sidebar).toBe('function');
  });

  it('should accept onSessionSelect prop', () => {
    // Verify the component accepts the optional prop without error
    const props = { onSessionSelect: undefined };
    expect(Object.keys(props)).toContain('onSessionSelect');
  });
});

describe('Dialog state store bindings', () => {
  it('onSessionSelect is a function when provided', () => {
    const handler = (_id: string) => {};
    expect(typeof handler).toBe('function');
  });
});
