# Agent Mode — Manual Smoke Test Checklist

Companion to [`2026-04-22-agent-mode.md`](./2026-04-22-agent-mode.md) Task 10 Step 6.
Run after `pnpm -r build` completes cleanly.

- [ ] Create an Agent "code-reviewer" with `adapter: claude-code`, `permissionMode: readonly`, `systemPrompt: "You only review code."`, `contextFiles: ['SOUL.md']`.
- [ ] Put `SOUL.md` into `~/.openlobby/agents/code-reviewer/workspace/SOUL.md` with "Be terse.".
- [ ] Bind a Telegram DM to this Agent via ChannelManagePanel.
- [ ] Send a message from Telegram — verify a new session appears in Sidebar with the Agent badge and the cwd `~/.openlobby/agents/code-reviewer/sessions/<peerHash>`.
- [ ] Send `/exit` — verify the lock message, session unchanged.
- [ ] Create a second Telegram binding to the same Agent from a second user — verify independent session with different cwd.
- [ ] Soft-delete the Agent from AgentsPanel — both sessions get killed; next Telegram inbound to either bound peer shows the removal reply.
- [ ] Recover the Agent — future inbound creates a new session.
