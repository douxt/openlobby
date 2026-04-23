import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentAdapterSelector,
  AgentDefinition,
  AgentGroupChatConfig,
} from '@openlobby/core';
import {
  onWsError,
  wsAgentCreate,
  wsAgentUpdate,
} from '../hooks/useWebSocket';
import { useI18nContext } from '../contexts/I18nContext';

interface Props {
  /** null = create mode */
  agent: AgentDefinition | null;
  onClose: () => void;
  onSaved: () => void;
}

type PermissionModeOption = '' | 'auto' | 'supervised' | 'readonly';

const ADAPTER_OPTIONS: AgentAdapterSelector[] = [
  'any',
  'claude-code',
  'codex-cli',
  'opencode',
  'gsd',
];

const RESERVED_IDS = new Set(['lobby-manager']);
const ID_RE = /^[a-z0-9][a-z0-9-_]*$/;

export default function AgentEditDialog({ agent, onClose, onSaved }: Props) {
  const isEdit = agent !== null;
  const { t } = useI18nContext();

  const PERMISSION_MODE_OPTIONS: Array<{ value: PermissionModeOption; label: string }> = [
    { value: '', label: t('agentEdit.permissionDefault') },
    { value: 'auto', label: 'auto' },
    { value: 'supervised', label: 'supervised' },
    { value: 'readonly', label: 'readonly' },
  ];

  const [id, setId] = useState(agent?.id ?? '');
  const [displayName, setDisplayName] = useState(agent?.displayName ?? '');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [adapter, setAdapter] = useState<AgentAdapterSelector>(agent?.adapter ?? 'any');
  const [model, setModel] = useState(agent?.model ?? '');
  const [permissionMode, setPermissionMode] = useState<PermissionModeOption>(
    (agent?.permissionMode ?? '') as PermissionModeOption,
  );
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '');
  const [contextFiles, setContextFiles] = useState<string[]>(agent?.contextFiles ?? []);
  const [allowedTools, setAllowedTools] = useState<string[]>(agent?.allowedTools ?? []);
  const [deniedTools, setDeniedTools] = useState<string[]>(agent?.deniedTools ?? []);

  const [groupChatEnabled, setGroupChatEnabled] = useState(agent?.groupChat != null);
  const [mentionPatterns, setMentionPatterns] = useState<string[]>(
    agent?.groupChat?.mentionPatterns ?? [],
  );
  const [requireMention, setRequireMention] = useState<boolean>(
    agent?.groupChat?.requireMention ?? true,
  );

  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const gotErrorRef = useRef(false);

  // Subscribe to server error messages while the dialog is open.
  useEffect(() => {
    const dispose = onWsError((msg) => {
      gotErrorRef.current = true;
      setServerError(msg);
      setSubmitting(false);
    });
    return () => dispose();
  }, []);

  const idError = useMemo(() => {
    if (isEdit) return null;
    const trimmed = id.trim();
    if (!trimmed) return t('agentEdit.errors.idRequired');
    if (RESERVED_IDS.has(trimmed)) return t('agentEdit.errors.idReserved', { id: trimmed });
    if (!ID_RE.test(trimmed))
      return t('agentEdit.errors.idRegex');
    return null;
  }, [id, isEdit, t]);

  const nameError = displayName.trim() ? null : t('agentEdit.errors.nameRequired');

  const canSubmit = !idError && !nameError && !submitting;

  const groupChatWarning =
    groupChatEnabled && requireMention && mentionPatterns.length === 0
      ? t('agentEdit.groupChatWarning')
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setServerError(null);
    gotErrorRef.current = false;
    setSubmitting(true);

    const groupChat: AgentGroupChatConfig | undefined = groupChatEnabled
      ? {
          mentionPatterns,
          requireMention,
        }
      : undefined;

    const trimmedModel = model.trim();
    const trimmedSystemPrompt = systemPrompt.trim();
    const trimmedDescription = description.trim();

    if (isEdit && agent) {
      wsAgentUpdate(agent.id, {
        displayName: displayName.trim(),
        description: trimmedDescription,
        adapter,
        model: trimmedModel || undefined,
        permissionMode: permissionMode === '' ? undefined : permissionMode,
        systemPrompt: trimmedSystemPrompt || undefined,
        contextFiles,
        allowedTools: allowedTools.length ? allowedTools : undefined,
        deniedTools: deniedTools.length ? deniedTools : undefined,
        groupChat,
      });
    } else {
      wsAgentCreate({
        id: id.trim(),
        displayName: displayName.trim(),
        description: trimmedDescription,
        adapter,
        model: trimmedModel || undefined,
        permissionMode: permissionMode === '' ? undefined : permissionMode,
        systemPrompt: trimmedSystemPrompt || undefined,
        contextFiles,
        allowedTools: allowedTools.length ? allowedTools : undefined,
        deniedTools: deniedTools.length ? deniedTools : undefined,
        groupChat,
      });
    }

    // Wait briefly — if an `{ type: 'error' }` reply arrives, gotErrorRef flips.
    // Otherwise the server succeeded (and broadcast `agent.updated`) — close the dialog.
    setTimeout(() => {
      setSubmitting(false);
      if (!gotErrorRef.current) onSaved();
    }, 200);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 rounded-xl p-6 w-full max-w-xl border border-gray-700 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-xl font-bold mb-5 text-gray-100">
          {isEdit ? t('agentEdit.titleEdit', { id: agent!.id }) : t('agentEdit.titleCreate')}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {t('agentEdit.label.id')} <span className="text-gray-600">({t('agentEdit.label.idHint')})</span>
            </label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              readOnly={isEdit}
              placeholder={t('agentEdit.placeholder.id')}
              className={`w-full bg-gray-800 text-gray-100 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 ${
                isEdit ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            />
            {idError && <p className="text-red-400 text-xs mt-1">{idError}</p>}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('agentEdit.label.displayName')}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('agentEdit.placeholder.displayName')}
              className="w-full bg-gray-800 text-gray-100 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
            />
            {nameError && <p className="text-red-400 text-xs mt-1">{nameError}</p>}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {t('agentEdit.label.description')} <span className="text-gray-600">({t('common.optional')})</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t('agentEdit.placeholder.description')}
              className="w-full bg-gray-800 text-gray-100 rounded-lg px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('agentEdit.label.adapter')}</label>
              <select
                value={adapter}
                onChange={(e) => setAdapter(e.target.value as AgentAdapterSelector)}
                className="w-full bg-gray-800 text-gray-100 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ADAPTER_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {t('agentEdit.label.model')} <span className="text-gray-600">({t('common.optional')})</span>
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t('agentEdit.placeholder.model')}
                className="w-full bg-gray-800 text-gray-100 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('agentEdit.label.permissionMode')}</label>
            <select
              value={permissionMode}
              onChange={(e) => setPermissionMode(e.target.value as PermissionModeOption)}
              className="w-full bg-gray-800 text-gray-100 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PERMISSION_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {t('agentEdit.label.systemPrompt')} <span className="text-gray-600">({t('agentEdit.label.systemPromptHint')})</span>
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              placeholder={t('agentEdit.placeholder.systemPrompt')}
              className="w-full bg-gray-800 text-gray-100 rounded-lg px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
            />
          </div>

          <TagsInput
            label={t('agentEdit.label.contextFiles')}
            hint={t('agentEdit.hint.contextFiles')}
            values={contextFiles}
            onChange={setContextFiles}
          />

          <TagsInput
            label={t('agentEdit.label.allowedTools')}
            hint={t('agentEdit.hint.allowedTools')}
            values={allowedTools}
            onChange={setAllowedTools}
          />

          <TagsInput
            label={t('agentEdit.label.deniedTools')}
            hint={t('agentEdit.hint.deniedTools')}
            values={deniedTools}
            onChange={setDeniedTools}
          />

          <div className="border border-gray-700 rounded-lg p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={groupChatEnabled}
                onChange={(e) => setGroupChatEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              <span>{t('agentEdit.label.enableGroupChat')}</span>
            </label>

            {groupChatEnabled && (
              <>
                <TagsInput
                  label={t('agentEdit.label.mentionPatterns')}
                  hint={t('agentEdit.hint.mentionPatterns')}
                  values={mentionPatterns}
                  onChange={setMentionPatterns}
                />
                <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireMention}
                    onChange={(e) => setRequireMention(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span>{t('agentEdit.label.requireMention')}</span>
                </label>
                {groupChatWarning && (
                  <p className="text-amber-400 text-xs">{groupChatWarning}</p>
                )}
              </>
            )}
          </div>
        </div>

        {serverError && (
          <div className="mt-4 rounded-lg bg-red-900/40 border border-red-700/60 px-3 py-2 text-sm text-red-200">
            {serverError}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium"
          >
            {isEdit ? t('agentEdit.buttons.save') : t('agentEdit.buttons.create')}
          </button>
        </div>
      </form>
    </div>
  );
}

function TagsInput({
  label,
  hint,
  values,
  onChange,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18nContext();
  const [draft, setDraft] = useState('');

  const commitDraft = (raw: string) => {
    const parts = raw
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...values];
    for (const p of parts) {
      if (!next.includes(p)) next.push(p);
    }
    onChange(next);
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      if (draft.trim()) {
        e.preventDefault();
        commitDraft(draft);
      }
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const removeAt = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">
        {label} {hint && <span className="text-gray-600 text-xs">- {hint}</span>}
      </label>
      <div className="flex flex-wrap gap-1.5 bg-gray-800 rounded-lg px-3 py-2 min-h-[42px] border border-transparent focus-within:border-blue-500">
        {values.map((v, idx) => (
          <span
            key={`${v}-${idx}`}
            className="inline-flex items-center gap-1 bg-gray-700 text-gray-100 text-xs rounded px-2 py-0.5"
          >
            {v}
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="text-gray-400 hover:text-red-300"
              aria-label={t('agentEdit.tagsRemoveAria', { value: v })}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (draft.trim()) commitDraft(draft);
          }}
          placeholder={values.length === 0 ? t('agentEdit.placeholder.tagsInput') : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-gray-100 focus:outline-none placeholder-gray-500"
        />
      </div>
    </div>
  );
}
