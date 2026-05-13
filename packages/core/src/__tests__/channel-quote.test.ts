import { describe, it, expect } from 'vitest';
import { formatInboundTextWithQuote, type ChannelQuote } from '../channel.js';

describe('formatInboundTextWithQuote', () => {
  it('returns the original text unchanged when no quote is supplied', () => {
    expect(formatInboundTextWithQuote('hello bot', undefined)).toBe('hello bot');
  });

  it('renders sender + time + quoted body + user message in the C-format block', () => {
    const ts = Date.UTC(2026, 4, 13, 6, 30); // 2026-05-13 06:30 UTC
    const out = formatInboundTextWithQuote('请帮我总结一下', {
      text: '我们的发版策略是什么',
      senderId: 'alice',
      senderDisplayName: '张三',
      timestamp: ts,
      mediaType: 'text',
    });
    // Sender resolves to displayName, body present, user message after blank line.
    expect(out).toMatch(/^\[被引用消息 · 张三 · /);
    expect(out).toContain('我们的发版策略是什么');
    expect(out).toContain('[引用结束]');
    expect(out.endsWith('请帮我总结一下')).toBe(true);
  });

  it('falls back to senderId when no displayName is present', () => {
    const out = formatInboundTextWithQuote('?', {
      text: 'q',
      senderId: 'bob',
    });
    expect(out).toContain('bob');
  });

  it('falls back to "未知发送者" when neither name nor id is present', () => {
    const out = formatInboundTextWithQuote('?', { text: 'q' });
    expect(out).toContain('未知发送者');
  });

  it('substitutes a placeholder when the quoted body is media-only', () => {
    expect(formatInboundTextWithQuote('啥图', { text: '', mediaType: 'image' })).toContain('[图片]');
    expect(formatInboundTextWithQuote('啥音', { text: '', mediaType: 'voice' })).toContain('[语音]');
    expect(formatInboundTextWithQuote('啥附件', { text: '', mediaType: 'file' })).toContain('[文件]');
  });

  it('substitutes [空消息] when text is empty and mediaType is text/undefined', () => {
    expect(formatInboundTextWithQuote('?', { text: '' })).toContain('[空消息]');
  });

  it('omits the timestamp segment when timestamp is missing', () => {
    const out = formatInboundTextWithQuote('?', {
      text: 'hi',
      senderDisplayName: '张三',
    });
    expect(out).toMatch(/^\[被引用消息 · 张三\]/);
    expect(out).not.toMatch(/· \d{4}-\d{2}-\d{2}/);
  });

  it('ignores invalid timestamps gracefully', () => {
    const out = formatInboundTextWithQuote('?', {
      text: 'hi',
      senderDisplayName: '张三',
      timestamp: Number.NaN,
    });
    // NaN passes "truthy" but produces invalid Date — helper drops the time.
    expect(out).toMatch(/^\[被引用消息 · 张三\]/);
  });

  it('preserves whitespace inside the user message', () => {
    const userMsg = '帮我总结：\n  - 第一点\n  - 第二点';
    const out = formatInboundTextWithQuote(userMsg, { text: 'context here' });
    expect(out.endsWith(userMsg)).toBe(true);
  });
});

describe('ChannelQuote shape', () => {
  it('accepts every documented field as optional except text', () => {
    const minimal: ChannelQuote = { text: 'x' };
    expect(minimal.text).toBe('x');
    const full: ChannelQuote = {
      text: 'x',
      senderId: 'a',
      senderDisplayName: 'A',
      timestamp: 1,
      mediaType: 'image',
    };
    expect(full.mediaType).toBe('image');
  });
});
