import { useEffect, useState } from 'react';
import type { AgentDefinition } from '@openlobby/core';
import { useLobbyStore } from '../stores/lobby-store';
import {
  wsAgentList,
  wsAgentDelete,
  wsAgentRecover,
  wsAgentHardDelete,
} from '../hooks/useWebSocket';
import AgentEditDialog from './AgentEditDialog';

interface Props {
  onClose: () => void;
}

export default function AgentsPanel({ onClose }: Props) {
  const agents = useLobbyStore((s) => s.agents);
  const deletedAgents = useLobbyStore((s) => s.deletedAgents);

  const [tab, setTab] = useState<'active' | 'deleted'>('active');
  const [editTarget, setEditTarget] = useState<AgentDefinition | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    wsAgentList(true);
  }, []);

  const rows = tab === 'active' ? agents : deletedAgents;
  const dialogOpen = creating || editTarget !== null;

  const closeDialog = () => {
    setCreating(false);
    setEditTarget(null);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-xl p-6 w-full max-w-2xl border border-gray-700 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-100">Agents</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-xl"
          >
            &times;
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('active')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === 'active'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            Active ({agents.length})
          </button>
          <button
            onClick={() => setTab('deleted')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === 'deleted'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            Deleted ({deletedAgents.length})
          </button>
          <div className="ml-auto">
            <button
              onClick={() => {
                setCreating(true);
                setEditTarget(null);
              }}
              className="px-3 py-1.5 rounded-lg text-sm bg-green-600 hover:bg-green-500 text-white"
            >
              + New Agent
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {rows.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">
              {tab === 'active'
                ? 'No agents yet. Click "+ New Agent" to create one.'
                : 'No deleted agents.'}
            </p>
          )}
          {rows.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              deleted={tab === 'deleted'}
              onEdit={() => {
                setCreating(false);
                setEditTarget(agent);
              }}
              onDelete={() => wsAgentDelete(agent.id)}
              onRecover={() => wsAgentRecover(agent.id)}
              onHardDelete={() => {
                const ok = window.confirm(
                  `Hard-delete agent "${agent.displayName}" (id="${agent.id}")? ` +
                    `This cannot be undone.`,
                );
                if (ok) wsAgentHardDelete(agent.id);
              }}
            />
          ))}
        </div>
      </div>

      {dialogOpen && (
        <AgentEditDialog
          agent={editTarget}
          onClose={closeDialog}
          onSaved={closeDialog}
        />
      )}
    </div>
  );
}

function permissionSummary(mode: string | undefined): string {
  if (!mode) return 'default';
  return mode;
}

function AgentRow({
  agent,
  deleted,
  onEdit,
  onDelete,
  onRecover,
  onHardDelete,
}: {
  agent: AgentDefinition;
  deleted: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRecover: () => void;
  onHardDelete: () => void;
}) {
  const toolsCount =
    (agent.allowedTools?.length ?? 0) + (agent.deniedTools?.length ?? 0);

  return (
    <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
      <div className="min-w-0 flex-1 pr-3">
        <div className="flex items-baseline gap-2">
          <span className="text-gray-100 text-sm font-medium truncate">
            {agent.displayName}
          </span>
          <span className="text-gray-500 text-xs">({agent.id})</span>
        </div>
        {agent.description && (
          <div className="text-gray-400 text-xs mt-0.5 truncate">
            {agent.description}
          </div>
        )}
        <div className="text-gray-500 text-xs mt-1 flex gap-3 flex-wrap">
          <span>adapter: <span className="text-gray-300">{agent.adapter}</span></span>
          <span>perm: <span className="text-gray-300">{permissionSummary(agent.permissionMode)}</span></span>
          <span>tools: <span className="text-gray-300">{toolsCount}</span></span>
          {agent.groupChat && (
            <span className="text-amber-400">group</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {deleted ? (
          <>
            <button
              onClick={onRecover}
              className="px-2 py-1 rounded text-xs bg-blue-900/40 text-blue-200 hover:bg-blue-900/60"
            >
              Recover
            </button>
            <button
              onClick={onHardDelete}
              className="px-2 py-1 rounded text-xs bg-red-900/40 text-red-200 hover:bg-red-900/60"
            >
              Hard Delete
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onEdit}
              className="px-2 py-1 rounded text-xs bg-gray-700 text-gray-200 hover:bg-gray-600"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="px-2 py-1 rounded text-xs text-red-300 hover:text-red-200"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
