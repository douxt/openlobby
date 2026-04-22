import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useLobbyStore } from '../stores/lobby-store';
import { useI18nContext } from '../contexts/I18nContext';
import {
  wsListProviders,
  wsAddProvider,
  wsRemoveProvider,
  wsToggleProvider,
  wsListBindings,
  wsUnbind,
  wsChannelBind,
  wsWecomQrStart,
  wsWecomQrCancel,
} from '../hooks/useWebSocket';

interface Props {
  onClose: () => void;
}

export default function ChannelManagePanel({ onClose }: Props) {
  const [tab, setTab] = useState<'providers' | 'bindings'>('providers');
  const [showAddForm, setShowAddForm] = useState(false);

  const providers = useLobbyStore((s) => s.channelProviders);
  const bindings = useLobbyStore((s) => s.channelBindings);
  const { t } = useI18nContext();

  useEffect(() => {
    wsListProviders();
    wsListBindings();
  }, []);

  return (
    <div className="fixed inset-0 bg-[var(--color-surface-overlay)] flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-secondary rounded-xl p-6 w-full max-w-lg border border-outline max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-on-surface">{t('channelManage.title')}</h2>
          <button onClick={onClose} className="text-on-surface-secondary hover:text-on-surface text-xl">
            &times;
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('providers')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === 'providers'
                ? 'bg-primary text-primary-on'
                : 'bg-surface-elevated text-on-surface-secondary hover:text-on-surface'
            }`}
          >
            {t('channelManage.providersTab')} ({providers.length})
          </button>
          <button
            onClick={() => setTab('bindings')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === 'bindings'
                ? 'bg-primary text-primary-on'
                : 'bg-surface-elevated text-on-surface-secondary hover:text-on-surface'
            }`}
          >
            {t('channelManage.bindingsTab')} ({bindings.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {tab === 'providers' && (
            <>
              {providers.length === 0 && !showAddForm && (
                <p className="text-on-surface-muted text-sm text-center py-8">
                  {t('channelManage.noProviders')}
                </p>
              )}

              {providers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-surface-elevated rounded-lg p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${p.healthy ? 'bg-success' : 'bg-danger'}`} />
                    <div>
                      <span className="text-on-surface text-sm font-medium">
                        {p.channelName}
                      </span>
                      <span className="text-on-surface-muted text-xs ml-2">{p.accountId}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => wsToggleProvider(p.id, !p.enabled)}
                      className={`px-2 py-1 rounded text-xs ${
                        p.enabled
                          ? 'bg-success-surface text-success hover:bg-success-surface/80'
                          : 'bg-surface-elevated text-on-surface-secondary hover:bg-[var(--color-sidebar-hover)] border border-outline'
                      }`}
                    >
                      {p.enabled ? t('channelManage.providerOn') : t('channelManage.providerOff')}
                    </button>
                    <button
                      onClick={() => wsRemoveProvider(p.id)}
                      className="text-danger hover:text-danger-hover text-xs"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              ))}

              {showAddForm ? (
                <AddProviderForm onDone={() => setShowAddForm(false)} />
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full py-2 border border-dashed border-outline rounded-lg text-on-surface-secondary hover:text-on-surface hover:border-on-surface-muted text-sm"
                >
                  + {t('channelManage.addProvider')}
                </button>
              )}
            </>
          )}

          {tab === 'bindings' && (
            <>
              {bindings.length === 0 && (
                <p className="text-on-surface-muted text-sm text-center py-8">
                  {t('channelManage.noBindings')}
                </p>
              )}

              {bindings.map((b) => (
                <BindingRow key={b.identityKey} binding={b} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AddProviderForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18nContext();

  const channelFields: Record<string, Array<{ key: string; label: string; required: boolean; type: string; placeholder?: string }>> = {
    wecom: [
      { key: 'botId', label: t('channelManage.fieldBotId'), required: true, type: 'text', placeholder: 'aibxxxxxxxx' },
      { key: 'secret', label: t('channelManage.fieldSecret'), required: true, type: 'password' },
    ],
    telegram: [
      { key: 'botToken', label: t('channelManage.fieldBotToken'), required: true, type: 'password', placeholder: '123456:ABC-DEF...' },
      { key: 'webhookUrl', label: t('channelManage.fieldWebhookUrl'), required: false, type: 'text', placeholder: 'https://example.com/webhook/telegram/...' },
      { key: 'webhookSecret', label: t('channelManage.fieldWebhookSecret'), required: false, type: 'password' },
    ],
  };

  const channelOptions: Array<{ value: string; label: string }> = [
    { value: 'wecom', label: t('channelManage.wecomOption') },
    { value: 'telegram', label: t('channelManage.telegramOption') },
  ];

  const [channelName, setChannelName] = useState('wecom');
  const [accountId, setAccountId] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [manualMode, setManualMode] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const qrStatus = useLobbyStore((s) => s.wecomQrStatus);
  const setQrStatus = useLobbyStore((s) => s.setWecomQrStatus);

  const fields = channelFields[channelName] ?? [];
  const isWecom = channelName === 'wecom';

  useEffect(() => {
    if (qrStatus?.status === 'waiting' && qrStatus.qrUrl) {
      QRCode.toDataURL(qrStatus.qrUrl, { width: 256, margin: 2 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } else {
      setQrDataUrl(null);
    }
  }, [qrStatus?.status, qrStatus?.qrUrl]);

  useEffect(() => {
    if (qrStatus?.status === 'success' && qrStatus.botId && qrStatus.secret && accountId.trim()) {
      wsAddProvider({
        channelName: 'wecom',
        accountId: accountId.trim(),
        credentials: { botId: qrStatus.botId, secret: qrStatus.secret },
        enabled: true,
      });
      setQrStatus(null);
      onDone();
    }
  }, [qrStatus?.status, qrStatus?.botId, qrStatus?.secret, accountId, onDone, setQrStatus]);

  useEffect(() => {
    return () => {
      wsWecomQrCancel();
      setQrStatus(null);
    };
  }, [setQrStatus]);

  const updateCredential = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  };

  const handleChannelChange = (name: string) => {
    setChannelName(name);
    setCredentials({});
    setAccountId('');
    setManualMode(false);
    wsWecomQrCancel();
    setQrStatus(null);
  };

  const isManualValid = () => {
    if (!accountId.trim()) return false;
    return fields.filter((f) => f.required).every((f) => credentials[f.key]?.trim());
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManualValid()) return;

    const creds: Record<string, string> = {};
    for (const field of fields) {
      const val = credentials[field.key]?.trim();
      if (val) creds[field.key] = val;
    }

    wsAddProvider({
      channelName,
      accountId: accountId.trim(),
      credentials: creds,
      enabled: true,
    });
    onDone();
  };

  const handleStartQr = () => {
    if (!accountId.trim()) return;
    setQrStatus(null);
    wsWecomQrStart();
  };

  if (isWecom && !manualMode) {
    return (
      <div className="bg-surface-elevated rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-on-surface font-medium">{t('channelManage.addWecomScan')}</span>
          <button onClick={onDone} className="text-on-surface-secondary hover:text-on-surface text-xs">{t('common.cancel')}</button>
        </div>

        <div>
          <label className="block text-xs text-on-surface-secondary mb-1">{t('common.accountId')}</label>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder={t('channelManage.accountIdPlaceholder')}
            className="w-full bg-surface border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
          />
        </div>

        <div className="flex flex-col items-center py-3 space-y-2">
          {!qrStatus && (
            <button
              onClick={handleStartQr}
              disabled={!accountId.trim()}
              className={`px-4 py-2 rounded-lg text-sm ${
                accountId.trim()
                  ? 'bg-primary text-primary-on hover:bg-primary-hover'
                  : 'bg-surface-elevated text-on-surface-muted cursor-not-allowed'
              }`}
            >
              {t('channelManage.generateQr')}
            </button>
          )}

          {qrStatus?.status === 'generating' && (
            <p className="text-on-surface-secondary text-sm">{t('channelManage.generatingQr')}</p>
          )}

          {qrStatus?.status === 'waiting' && qrDataUrl && (
            <>
              <img src={qrDataUrl} alt={t('channelManage.wecomQrAlt')} className="w-48 h-48 rounded-lg" />
              <p className="text-on-surface-secondary text-xs">{t('channelManage.scanWithWecom')}</p>
            </>
          )}

          {qrStatus?.status === 'expired' && (
            <div className="text-center space-y-2">
              <p className="text-warning text-sm">{t('channelManage.qrExpired')}</p>
              <button onClick={handleStartQr} className="px-3 py-1.5 bg-primary text-primary-on rounded text-sm hover:bg-primary-hover">
                {t('channelManage.regenerate')}
              </button>
            </div>
          )}

          {qrStatus?.status === 'error' && (
            <div className="text-center space-y-2">
              <p className="text-danger text-sm">{qrStatus.error ?? t('channelManage.unknownError')}</p>
              <button onClick={handleStartQr} className="px-3 py-1.5 bg-primary text-primary-on rounded text-sm hover:bg-primary-hover">
                {t('common.retry')}
              </button>
            </div>
          )}

          {qrStatus?.status === 'success' && (
            <p className="text-success text-sm">{t('channelManage.scanSuccess')}</p>
          )}
        </div>

        <div className="text-center">
          <button
            onClick={() => { setManualMode(true); wsWecomQrCancel(); setQrStatus(null); }}
            className="text-xs text-on-surface-muted hover:text-on-surface underline"
          >
            {t('channelManage.manualInput')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleManualSubmit} className="bg-surface-elevated rounded-lg p-4 space-y-3">
      <div>
        <label className="block text-xs text-on-surface-secondary mb-1">{t('channelManage.channelType')}</label>
        <select
          value={channelName}
          onChange={(e) => handleChannelChange(e.target.value)}
          className="w-full bg-surface border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
        >
          {channelOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-on-surface-secondary mb-1">{t('common.accountId')}</label>
        <input
          type="text"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          placeholder={t('channelManage.accountIdPlaceholder')}
          className="w-full bg-surface border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
        />
      </div>

      {fields.map((field) => (
        <div key={field.key}>
          <label className="block text-xs text-on-surface-secondary mb-1">{field.label}</label>
          <input
            type={field.type}
            value={credentials[field.key] ?? ''}
            onChange={(e) => updateCredential(field.key, e.target.value)}
            placeholder={field.placeholder}
            className="w-full bg-surface border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
          />
        </div>
      ))}

      <div className="flex gap-2 justify-end items-center">
        {isWecom && (
          <button
            type="button"
            onClick={() => { setManualMode(false); }}
            className="text-xs text-on-surface-muted hover:text-on-surface underline mr-auto"
          >
            {t('channelManage.backToQr')}
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 text-sm text-on-surface-secondary hover:text-on-surface"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={!isManualValid()}
          className={`px-3 py-1.5 rounded text-sm ${
            isManualValid()
              ? 'bg-primary text-primary-on hover:bg-primary-hover'
              : 'bg-surface-elevated text-on-surface-muted cursor-not-allowed'
          }`}
        >
          {t('common.add')}
        </button>
      </div>
    </form>
  );
}

type BindingTargetKind = 'lobby-manager' | 'session' | 'agent';

function BindingRow({
  binding,
}: {
  binding: import('../stores/lobby-store').ChannelBindingData;
}) {
  const { t } = useI18nContext();
  const agents = useLobbyStore((s) => s.agents);
  const deletedAgents = useLobbyStore((s) => s.deletedAgents);
  const sessions = useLobbyStore((s) => s.sessions);

  const initialKind: BindingTargetKind = binding.agentId
    ? 'agent'
    : binding.target === 'lobby-manager'
      ? 'lobby-manager'
      : 'session';

  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<BindingTargetKind>(initialKind);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(binding.agentId ?? '');
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    binding.target !== 'lobby-manager' ? binding.target : '',
  );

  const boundAgent =
    (binding.agentId && agents.find((a) => a.id === binding.agentId)) ||
    (binding.agentId && deletedAgents.find((a) => a.id === binding.agentId)) ||
    undefined;

  const sessionList = Object.values(sessions).filter((s) => s.origin !== 'lobby-manager');

  const canSave = (() => {
    if (kind === 'lobby-manager') return true;
    if (kind === 'agent') return !!selectedAgentId;
    if (kind === 'session') return !!selectedSessionId;
    return false;
  })();

  const handleSave = () => {
    if (kind === 'lobby-manager') {
      wsChannelBind(binding.identityKey, 'lobby-manager');
    } else if (kind === 'agent') {
      wsChannelBind(binding.identityKey, 'lobby-manager', selectedAgentId);
    } else {
      wsChannelBind(binding.identityKey, selectedSessionId);
    }
    setEditing(false);
  };

  return (
    <div className="bg-surface-elevated rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-on-surface text-sm truncate">
            {binding.peerDisplayName ?? binding.peerId}
            <span className="text-on-surface-muted text-xs ml-2">({binding.channelName})</span>
          </div>
          <div className="text-on-surface-muted text-xs mt-0.5 flex items-center gap-2 flex-wrap">
            <span>
              {t('channelManage.target')}:{' '}
              {binding.agentId
                ? 'Agent'
                : binding.target === 'lobby-manager'
                  ? 'LM'
                  : binding.activeSessionId?.slice(0, 8) ?? binding.target.slice(0, 8)}
            </span>
            {binding.agentId && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-purple-900/40 text-purple-200 border-purple-500/50 font-medium">
                &#x1F916; {boundAgent?.displayName ?? binding.agentId}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-on-surface-secondary hover:text-on-surface text-xs"
          >
            {editing ? t('common.cancel') : 'Edit'}
          </button>
          <button
            onClick={() => wsUnbind(binding.identityKey)}
            className="text-on-surface-secondary hover:text-danger text-xs"
          >
            {t('channelManage.unbind')}
          </button>
        </div>
      </div>

      {editing && (
        <div className="border-t border-outline pt-2 space-y-2">
          <div>
            <label className="block text-xs text-on-surface-secondary mb-1">Target</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as BindingTargetKind)}
              className="w-full bg-surface border border-outline rounded px-2 py-1 text-xs text-on-surface"
            >
              <option value="lobby-manager">Lobby Manager</option>
              <option value="session">Specific session</option>
              <option value="agent">Agent</option>
            </select>
          </div>

          {kind === 'agent' && (
            <div>
              <label className="block text-xs text-on-surface-secondary mb-1">Agent</label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full bg-surface border border-outline rounded px-2 py-1 text-xs text-on-surface"
              >
                <option value="">— select agent —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName} ({a.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {kind === 'session' && (
            <div>
              <label className="block text-xs text-on-surface-secondary mb-1">Session</label>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full bg-surface border border-outline rounded px-2 py-1 text-xs text-on-surface"
              >
                <option value="">— select session —</option>
                {sessionList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName} ({s.id.slice(0, 8)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={`px-3 py-1 rounded text-xs ${
                canSave
                  ? 'bg-primary text-primary-on hover:bg-primary-hover'
                  : 'bg-surface-elevated text-on-surface-muted cursor-not-allowed'
              }`}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
