/** Kind of conversation the peer represents. */
export type ChannelPeerKind = 'direct' | 'group' | 'channel';

/** 标识一个特定通道+账号下的外部用户 */
export interface ChannelIdentity {
  /** Provider 名称: 'wecom' | 'telegram' | 'feishu' */
  channelName: string;
  /** 该通道下的 bot/app ID（支持多账号） */
  accountId: string;
  /** 外部用户 ID */
  peerId: string;
  /** 可选的用户显示名 */
  peerDisplayName?: string;
  /**
   * Conversation type. Required for group-chat mention rules.
   * Providers that cannot distinguish default to 'direct'.
   */
  peerKind: ChannelPeerKind;
  /**
   * Group/chat id, populated by the provider when peerKind === 'group'.
   * Used by account-level Agent bindings to fan out sessions per
   * (chatId, peerId) inside a group — so different users in the same
   * group, and the same user across different groups, stay in
   * separate sessions. Undefined for direct chats.
   */
  chatId?: string;
}

/** 序列化 key："channelName:accountId:peerId" */
export type ChannelIdentityKey = string;

export function toIdentityKey(id: ChannelIdentity): ChannelIdentityKey {
  return `${id.channelName}:${id.accountId}:${id.peerId}`;
}

/**
 * Serialize key for an account-level Agent binding: "channelName:accountId".
 * Distinct from ChannelIdentityKey because account bindings span all peers
 * of a given (channel, account) tuple.
 */
export type ChannelAccountKey = string;

export function toAccountKey(channelName: string, accountId: string): ChannelAccountKey {
  return `${channelName}:${accountId}`;
}

/**
 * Fan-out key used by SessionManager to materialize a per-peer Agent
 * session under an account-level binding. Includes chatId for groups so
 * each user-in-group is its own session, and direct/group are namespaced
 * so a 1:1 with userid="abc" and a group with chatId="abc" cannot collide.
 */
export function toAgentPeerKey(id: ChannelIdentity): string {
  if (id.peerKind === 'group' && id.chatId) {
    return `group:${id.chatId}:${id.peerId}`;
  }
  // 'direct' or 'channel' (no group-level fan-out for broadcast channels)
  return `${id.peerKind}:${id.peerId}`;
}

/** 入站消息（IM → OpenLobby） */
export interface InboundChannelMessage {
  /** 来自 IM 平台的原始消息 ID */
  externalMessageId: string;
  /** 发送者身份 */
  identity: ChannelIdentity;
  /** 文本内容 */
  text: string;
  /** 时间戳 (ms) */
  timestamp: number;
  /** 附件 */
  attachments?: Array<{
    type: 'image' | 'file' | 'voice';
    url?: string;
    base64?: string;
    filename?: string;
    mimeType?: string;
  }>;
  /** 内联审批回调数据（如 "approve:sessionId:requestId"） */
  callbackData?: string;
  /** 原始平台消息对象 */
  raw?: unknown;
  /** Quoted/replied message context */
  quote?: ChannelQuote;
}

/**
 * Context attached when a user @s the bot in reply to an earlier message.
 *
 * Adapters populate this from their native quote/reply payload; the channel
 * router then renders it into the user message via {@link formatInboundTextWithQuote}
 * so the downstream agent can clearly tell "this is what I was replying to"
 * from "this is what I'm asking now".
 */
export interface ChannelQuote {
  /**
   * The quoted message's text. For media-only quotes (image / voice / file)
   * adapters MUST set a placeholder like "[图片]" / "[语音]" / "[文件]" so
   * the downstream context is never empty.
   */
  text: string;
  /** Sender's user id in the source IM. Undefined when the platform didn't provide it. */
  senderId?: string;
  /**
   * Display-friendly sender name. Optional; falls back to senderId for rendering
   * when absent. WeCom currently passes undefined here (no name resolution yet);
   * Telegram populates from `from.first_name` / `username`.
   */
  senderDisplayName?: string;
  /** When the quoted message was sent (ms epoch). */
  timestamp?: number;
  /**
   * What kind of message was quoted. Used for the placeholder hint when the
   * quoted body itself was media-only. Defaults to 'text'.
   */
  mediaType?: 'text' | 'image' | 'voice' | 'file';
}

/**
 * Render an inbound user message together with its quote context using the
 * format the agents consume. Tagged-Chinese block so LLMs can clearly tell
 * "user is quoting this earlier message" apart from "user is asking THIS now".
 *
 * Shape:
 *
 *   [被引用消息 · {sender} · {time}]
 *   {quoted text or placeholder}
 *   [引用结束]
 *
 *   {user's current message}
 *
 * When `quote` is undefined the original text is returned unchanged.
 */
export function formatInboundTextWithQuote(text: string, quote?: ChannelQuote): string {
  if (!quote) return text;

  // Defensive coercion: adapters SHOULD only set string fields, but a buggy
  // adapter or unexpected platform payload occasionally lets a non-string
  // through (object/array). Don't crash — treat anything non-string as empty
  // and let the media-type placeholder do its job.
  const safeStr = (v: unknown): string => (typeof v === 'string' ? v : '');
  const sender =
    safeStr(quote.senderDisplayName).trim() ||
    safeStr(quote.senderId).trim() ||
    '未知发送者';
  const timeStr = quote.timestamp ? formatQuoteTimestamp(quote.timestamp) : '';
  const meta = timeStr ? `${sender} · ${timeStr}` : sender;
  const quotedBody =
    safeStr(quote.text).trim() || placeholderForMediaType(quote.mediaType);

  return [
    `[被引用消息 · ${meta}]`,
    quotedBody,
    `[引用结束]`,
    '',
    safeStr(text) || text,
  ].join('\n');
}

function placeholderForMediaType(t: ChannelQuote['mediaType']): string {
  switch (t) {
    case 'image':
      return '[图片]';
    case 'voice':
      return '[语音]';
    case 'file':
      return '[文件]';
    default:
      return '[空消息]';
  }
}

/** Format an epoch ms timestamp as "YYYY-MM-DD HH:mm" using the local timezone. */
function formatQuoteTimestamp(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 出站消息（OpenLobby → IM） */
export interface OutboundChannelMessage {
  /** 目标用户 */
  identity: ChannelIdentity;
  /** 文本内容 */
  text: string;
  /** 来源 LobbyMessage ID */
  sourceMessageId?: string;
  /** 文本格式 */
  format?: 'text' | 'markdown';
  /** 消息类型 */
  kind?: 'message' | 'typing' | 'approval';
  /** 内联审批按钮 */
  actions?: Array<{
    label: string;
    callbackData: string;
  }>;
  /** Media attachments */
  attachments?: Array<{
    type: 'image' | 'file' | 'voice' | 'video';
    path?: string;
    url?: string;
    base64?: string;
    filename?: string;
    mimeType?: string;
  }>;
}

/** 通道 Provider 配置（持久化到数据库） */
export interface ChannelProviderConfig {
  channelName: string;
  accountId: string;
  credentials: Record<string, string>;
  webhook?: { path: string; secret?: string };
  enabled?: boolean;
}

/** Provider 状态信息（用于 UI 展示） */
export interface ChannelProviderInfo {
  /** "channelName:accountId" */
  id: string;
  channelName: string;
  accountId: string;
  enabled: boolean;
  healthy: boolean;
}

/** 通道绑定关系（IM 用户 ↔ Session） */
export interface ChannelBinding {
  identityKey: ChannelIdentityKey;
  channelName: string;
  accountId: string;
  peerId: string;
  peerDisplayName?: string;
  /** NEW: populated by provider; stored for mention rule and UI display. */
  peerKind: ChannelPeerKind;
  /** 'lobby-manager' 或具体 sessionId — semantics unchanged. */
  target: 'lobby-manager' | string;
  /** 当前活跃的 sessionId（lobby-manager 模式下可动态切换） */
  activeSessionId: string | null;
  /**
   * @deprecated Use ChannelAccountBinding for account-level Agent bindings.
   * Historically this field was used at peer-level for Agent routing; on a
   * fresh DB it will never be set. Kept in the type for read-side
   * back-compatibility with rows migrated from older OpenLobby versions.
   */
  agentId?: string;
  createdAt: number;
  lastActiveAt: number;
}

/**
 * Account-level binding: a whole IM bot account (channelName + accountId)
 * routes to a single Agent. Applies to ALL peers — every 1:1 and every
 * group involving this bot. Per-user/per-group session isolation happens
 * downstream via SessionManager's per-peer fan-out (see toAgentPeerKey).
 *
 * Mutually exclusive with peer-level ChannelBinding rows on the same
 * (channelName, accountId): either an account has an Agent (this table)
 * OR per-peer session bindings (channel_bindings), never both.
 */
export interface ChannelAccountBinding {
  /** "channelName:accountId" — PK */
  accountKey: ChannelAccountKey;
  channelName: string;
  accountId: string;
  agentId: string;
  createdAt: number;
  lastActiveAt: number;
}

/** ChannelProvider 接口 — 每个 IM 平台实现一个 */
export interface ChannelProvider {
  readonly channelName: string;
  readonly accountId: string;

  /** 启动 Provider（建立连接、注册事件） */
  start(router: ChannelRouter): Promise<void>;
  /** 停止 Provider */
  stop(): Promise<void>;
  /** 发送消息到 IM */
  sendMessage(msg: OutboundChannelMessage): Promise<void>;
  /** 健康检查 */
  isHealthy(): boolean;

  /** 更新交互式卡片（审批后反馈） */
  updateCard?(peerId: string, taskId: string, resultText: string): Promise<void>;

  /** 返回需要注册到 Fastify 的 webhook 路由列表 */
  getWebhookHandlers?(): Array<{
    method: 'POST' | 'GET';
    path: string;
    handler: (request: unknown, reply: unknown) => Promise<void>;
  }>;

  /** Sync command menu to IM platform (per-chat). Optional — providers that don't support command registration can skip. */
  syncCommands?(peerId: string, groups: CommandGroup[]): Promise<void>;
}

/** 路由器接口，Provider 通过它提交入站消息 */
export interface ChannelRouter {
  handleInbound(msg: InboundChannelMessage): Promise<void>;
}

/** Channel plugin module contract — npm packages export this shape */
export interface ChannelPluginModule {
  createProvider(config: ChannelProviderConfig): ChannelProvider;
  readonly channelName: string;
  readonly displayName: string;
}

/** Discovered plugin metadata */
export interface ChannelPluginInfo {
  channelName: string;
  displayName: string;
  packageName: string;
  version?: string;
}

/** A named group of slash commands (e.g. "OpenLobby", "Claude Code") */
export interface CommandGroup {
  label: string;
  commands: CommandEntry[];
}

export interface CommandEntry {
  command: string;
  description: string;
}
