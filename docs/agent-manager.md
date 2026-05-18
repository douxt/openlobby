# Agent Manager (AM)

Agent Manager is a built-in meta-agent that helps you **design, review, and improve Agents** in OpenLobby. It is a sibling of Lobby Manager (LM): LM handles operations (start/stop sessions, bind IM channels), AM handles design (write good prompts, pick the right tool policy, iterate based on real conversations).

You reach AM by clicking the **🧙 Agent Manager** button in the left sidebar.

---

## Why AM exists

Creating a good Agent is not just filling a form. It is prompt engineering, tool-policy reasoning, and binding-rule design — three skill domains that are unfamiliar to most users. Without help, people either over-engineer (giving the Agent Bash access "just in case") or under-engineer (a vague system prompt that drifts in production). AM compresses the expertise into a structured conversation.

---

## What AM can do

| Capability | When to use it |
|---|---|
| **Interview-driven creation** | "Help me make an agent for X" — AM walks you through 5 questions and drafts an `AgentDefinition` for your review. |
| **Prompt review** | "Look at this system prompt" — AM applies a 5-lens checklist (ambiguity, missing guardrails, conflicting instructions, missing fallback, tone leakage) and proposes a rewrite. |
| **Improve an existing Agent** | "Agent X has been giving wrong answers lately" — AM reads recent conversations via `agent_recent_messages`, classifies the failure pattern, and proposes a prompt patch in diff form. |
| **Apply a template** | "I need a customer-support bot" — AM recommends one of the built-in templates and walks you through its fill-in fields. |

For anything **operational** (starting a session, binding an Agent to an IM channel, listing channels) — AM will tell you "ask Lobby Manager" and stop.

---

## The 5-question interview

When you ask AM to design a new Agent, it asks these questions one at a time. You can answer briefly; AM will follow up if the answer is too thin.

1. **Problem** — What specific problem will this Agent solve? Give one concrete example task.
2. **Audience & context** — Who talks to it? (single user / private group / public group / IM channel?) How often?
3. **Red lines** — What must it ABSOLUTELY refuse to do?
4. **Voice** — Desired tone and reply length.
5. **Tools & info** — What external information or actions does it need?

After all five answers, AM presents a full draft and asks you to confirm before persisting.

---

## Built-in templates

AM ships with 5 ready-to-use templates. Each one has `fillIns` that AM walks you through.

| Template id | Name | When to pick it |
|---|---|---|
| `customer-support` | Customer Support | Product Q&A with a clear escalation path; refuses negotiation/legal/competitor topics by default |
| `code-reviewer` | Code Reviewer | Reviews diffs with a BLOCKER / MAJOR / MINOR / NIT / PRAISE rubric and an explicit verdict |
| `group-light-assistant` | Group Light Assistant | IM-group helper that only responds when @-mentioned; sensitive topics refused |
| `standup-summarizer` | Standup Summarizer | Collects yesterday / today / blockers from each teammate; emits a fixed-shape digest |
| `alert-triager` | Alert Triager | Classifies severity, suggests next action, never pages anyone directly |

To add a new template: create `packages/server/src/agent-templates/templates/<id>.ts` exporting an `AgentTemplate`, then register it in `packages/server/src/agent-templates/index.ts`. Tests in `__tests__/render.test.ts` validate that every `{{placeholder}}` in your prompt is declared as a fillIn.

---

## IM sender attribution

Inbound IM messages routed to your Agents are tagged by the channel router before they reach the model:

```
[from: <peerDisplayName || peerId>] <user message>
```

Every IM-bound message in every channel and every binding mode (peer-level or account-level) carries this prefix. It exists so Agents that need to know "who sent this" — audit-log `reporter` fields, per-user state machines, role-aware routers — can extract the sender deterministically instead of inferring it from text.

**When AM will bring it up.** During the design interview (Capability A) or prompt review (Capability B), if your Agent's problem space involves attribution, multi-user audit, or role-based behavior, AM will remind you to add an explicit instruction to the system prompt, e.g.:

> Every user message starts with `[from: <sender>] ` — extract `<sender>` for attribution. Do NOT echo this tag back in replies.

If sender identity isn't relevant for your Agent, no special handling needed — the tag is harmless metadata the model will naturally ignore.

**Provider notes.**

| Channel | `<sender>` value |
|---|---|
| Telegram | First + last name, or `@username` fallback |
| WeCom | Raw userid (e.g. `wxid_abc123`) — display-name reverse lookup is on the TODO list |
| Feishu (planned) | TBD when the provider lands |

## Tool-policy principles AM applies

When AM recommends a `permissionMode` and `allowedTools` / `deniedTools`, it follows these rules:

- **Least privilege** — start from an empty allow-list; add the minimum the Agent needs.
- **Three tiers** — read-only tools are default-allow, write tools require `supervised` mode, destructive tools (Bash, force-delete) require explicit user opt-in with a written justification.
- **IM-public-channel discount** — Agents bound to public groups default to read-only with Bash denied, regardless of what the operator asks for. AM flags the trade-off so you can override consciously.
- **Adapter mismatch check** — AM verifies the chosen adapter actually exposes the tools listed.

---

## Confirmation discipline

AM never silently mutates persisted state:

- `agent_create` / `agent_update` / `agent_delete` — AM presents the full proposed change and waits for explicit "yes" before calling the tool.
- `agent_template_apply` is read-only (returns a draft); no confirmation needed.
- `agent_list` / `agent_get` / `agent_recent_messages` are read-only; AM calls them freely.

---

## Boundary with Lobby Manager (LM)

| Request | Who handles it |
|---|---|
| "Make me an agent for customer support" | **AM** |
| "Review this system prompt" | **AM** |
| "Improve X agent — it's giving wrong answers" | **AM** |
| "Recommend a template for Y" | **AM** |
| "Bind Agent X to Feishu group Y" | **LM** |
| "Stop / rename / navigate session Z" | **LM** |
| "List my sessions / channels / IM providers" | **LM** |

LM is taught (via its system prompt) to redirect design requests to AM, and AM is taught to redirect operational requests to LM. Both are encouraged to name the button you should click rather than just verbally pointing.

---

## What AM does NOT do (yet)

These were intentionally left out of the MVP. Each has an explicit upgrade trigger.

| Feature | Why deferred | Trigger to revisit |
|---|---|---|
| Automatic upgrade based on telemetry | No user-feedback signal collected yet | A user wants it AND we have 1–2 months of real conversations to learn from |
| Dry-run / test scenarios | Costly to scaffold; uncertain demand | A user reports "I couldn't tell if my Agent was good before shipping it" |
| Agent versioning + rollback | Adds DB schema burden | A user complains "I broke my Agent and want the old prompt back" |
| A/B-test two versions side by side | Premature optimisation | A single Agent has > 50 DAU |

When the time comes, the implementation is roughly: add a `message_feedback` table, expose a 👍 / 👎 affordance in MessageBubble, then build an upgrade-suggestion flow that reads from it.

---

## Source-of-truth files

| File | What it owns |
|---|---|
| `packages/server/src/agent-manager.ts` | AM session class, system prompt, `AM_ALLOWED_TOOLS` |
| `packages/server/src/agent-templates/` | Template registry + render |
| `packages/server/src/mcp-server.ts` | `agent_*` MCP tool definitions |
| `packages/server/src/mcp-api.ts` | `/api/agents` and `/api/agent-templates/*` HTTP routes |
| `packages/server/src/lobby-manager.ts` | LM system prompt (the "defer to AM" section) |
| `packages/web/src/components/Sidebar.tsx` | 🧙 button row |
