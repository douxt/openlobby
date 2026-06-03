import { describe, expect, it } from 'vitest';
import { resolveToolApprovalAction } from '../claude-code.js';

/**
 * Regression coverage for AskUserQuestion under Claude Code 2.1.x.
 *
 * Bug: in `auto` permission mode `handleToolApproval` short-circuited with an
 * immediate `allow` BEFORE emitting the question card, so the model's
 * AskUserQuestion call was auto-approved with no answers — the user never saw
 * a card ("卡片没弹出来") and the model received empty answers. In `readonly`
 * mode it was denied for the same structural reason.
 *
 * AskUserQuestion is an interactive *input* tool: there is no sensible
 * auto-answer, so it must ALWAYS surface the card and wait for the user,
 * regardless of permission mode. This mirrors Claude Code itself, whose CLI
 * routes AskUserQuestion through the permission callback even in
 * bypassPermissions mode.
 */

const askQuestionInput = {
  questions: [
    {
      question: 'Which color do you prefer?',
      header: 'Color',
      options: [
        { label: 'Red', description: 'red' },
        { label: 'Blue', description: 'blue' },
      ],
      multiSelect: false,
    },
  ],
};

describe('resolveToolApprovalAction — AskUserQuestion always prompts', () => {
  it('prompts (with questions) in auto mode instead of auto-allowing', () => {
    const action = resolveToolApprovalAction('AskUserQuestion', askQuestionInput, 'auto');
    expect(action.kind).toBe('prompt');
    expect(action.kind === 'prompt' && action.questions).toEqual(askQuestionInput.questions);
  });

  it('prompts (with questions) in readonly mode instead of denying', () => {
    const action = resolveToolApprovalAction('AskUserQuestion', askQuestionInput, 'readonly');
    expect(action.kind).toBe('prompt');
    expect(action.kind === 'prompt' && action.questions).toEqual(askQuestionInput.questions);
  });

  it('prompts (with questions) in supervised mode', () => {
    const action = resolveToolApprovalAction('AskUserQuestion', askQuestionInput, 'supervised');
    expect(action.kind).toBe('prompt');
    expect(action.kind === 'prompt' && action.questions).toEqual(askQuestionInput.questions);
  });

  it('does not treat AskUserQuestion without a questions array as a question prompt', () => {
    const action = resolveToolApprovalAction('AskUserQuestion', {}, 'auto');
    // No questions payload → falls back to normal auto-mode behavior.
    expect(action.kind).toBe('auto-allow');
  });
});

describe('resolveToolApprovalAction — regular tools keep existing behavior', () => {
  it('auto-allows a regular tool in auto mode', () => {
    expect(resolveToolApprovalAction('Bash', { command: 'ls' }, 'auto')).toEqual({ kind: 'auto-allow' });
  });

  it('denies a non-readonly tool in readonly mode', () => {
    const action = resolveToolApprovalAction('Bash', { command: 'ls' }, 'readonly');
    expect(action.kind).toBe('deny');
  });

  it('allows a readonly tool to fall through to prompt in readonly mode', () => {
    const action = resolveToolApprovalAction('Read', { file_path: '/x' }, 'readonly');
    expect(action.kind).toBe('prompt');
  });

  it('prompts for a regular tool in supervised mode', () => {
    const action = resolveToolApprovalAction('Bash', { command: 'ls' }, 'supervised');
    expect(action.kind).toBe('prompt');
  });
});
