# Handoff Document — Mobile Adaptation Phase 1

> **Date**: 2026-06-27  
> **From session**: `58333313-a0ce-4abc-83a7-8a4d144cedee`

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| **Project** | OpenLobby — Web UI for managing AI CLI sessions (Claude Code, Codex CLI) via IM-style interface |
| **Fork** | douxt/openlobby (forked from kkkkkk1k1/openlobby) |
| **Branch** | `feat/mobile-adaptation` |
| **Working dir** | `/home/www/openlobby` |
| **Tech** | React 19 + Tailwind 3.4 + Zustand 5 + Vite 6 + pnpm monorepo |
| **pnpm path** | `export PATH="$HOME/.npm-global/bin:$PATH"` |
| **Node** | v22.23.1 |
| **CAVEAT** | ANTHROPIC_BASE_URL points to DeepSeek proxy. `claude -p` works but uses deepseek-v4-pro model. |

## 2. Task

**OpenLobby Web UI 移动端适配 Phase 1（核心布局响应式骨架）**

将纯桌面布局改为 mobile-first 响应式。移动端 sidebar 变 drawer + 底部 tab 导航。桌面端零回归。

## 3. Artifacts Produced

| File | Status | Description |
|------|--------|-------------|
| `docs/mobile-adaptation.md` | **完整，未提交** | 技术设计文档。15 节：架构分析 → 三阶段方案 → 31 条决策 → 测试策略 → 已知限制。671 行。 |
| `docs/superpowers/specs/2026-06-27-mobile-adaptation-design.md` | **完整，未提交** | PRD。20 User Stories + 2 新模块 + 8 修改模块 + 测试策略。经 4 轮 loop 评审通过。 |
| `/tmp/prd-mobile-adaptation.md` | **最新 PRD** | 与 specs 文件内容一致（副本）。4 轮 loop review 后含全部 6 处修改。 |
| GitHub Issue `douxt/openlobby#1` | **轻量版** | 指向设计文档的简洁 issue。非最终契约格式。 |
| `.review-loop-state` | **评审记录** | 4 轮 loop 评审状态文件，标记 done=true。 |

**未提交文件清单：**
```
docs/mobile-adaptation.md
docs/superpowers/specs/2026-06-27-mobile-adaptation-design.md
.claude/CLAUDE.md
.devflow/
.gate-state
.review-loop-state
issues/
```

## 4. Key Design Decisions (from 31-item Decision Log)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Single content tree** — `flex-col md:flex-row`，非双 DOM 树 | 断点切换不丢 WebSocket/滚动状态 |
| D2 | **Hamburger 在 App 层** — 不在 RoomHeader | RoomHeader 无会话时 return null |
| D3 | **3 tab MobileNav** — Sessions / Agents / Channels | Settings 低频，留 drawer |
| D5 | **Dialog state → Zustand store** — 非 local useState | Sidebar + MobileNav 双入口 |
| D6 | **SessionCard CSS group-hover** — 非 JS isHovered | pinned 项始终显示指示器 |
| D9 | **Drawer 外壳始终挂载** — Sidebar 仅 open 时挂载 | 动画流畅 + 省 DOM |
| D10 | **h-screen + h-dvh 双类名** — CSS fallback | Chrome<108/Safari<15.4 兼容 |
| D14 | **完整 ARIA** — hamburger: aria-label/expanded/controls, drawer: role=dialog/aria-modal | WCAG 合规 |
| D15 | **ErrorBoundary** 包裹 drawer children | 防 Sidebar 异常崩全站 |
| D16 | **Scroll lock** — drawer 打开时 `body overflow:hidden` | 防背后内容滚动 |
| D18 | **CSS 变量 `--mobile-nav-height`** + safe-area calc | 单源管理 nav 高度 |
| D20 | **i18n flat dot-notation** — 匹配现有 `'sidebar.agents'` 模式 | 统一风格 |
| D22 | **prefers-reduced-motion** — `@media (prefers-reduced-motion: reduce)` | WCAG 2.3.3 |
| D31 | **React.memo + useCallback** — MobileDrawer shell | 防不必要的重渲染 |

完整 31 条决策见 `docs/mobile-adaptation.md` 第 14 节。

## 5. Implementation Plan (Phase 1 — 10 steps)

按依赖顺序：

```
1.  CSS additions (safe-area, dvh-fallback, tap-target, drawer anims,
     reduced-motion, CSS vars)                              → index.css
2.  MobileDrawer.tsx (fixed pos, stopPropagation, Escape key,
     scroll lock, aria, ErrorBoundary, React.memo)          → 新文件
3.  lobby-store fields (drawerOpen, showAgentsPanel,
     showChannelPanel, showSettingsDialog, showUpdateDialog) → lobby-store.ts
4.  MobileNav.tsx (3 tabs, fixed bottom, derived active)     → 新文件
5.  Sidebar.tsx adapt (dialog state→store, group-hover,
     onSessionSelect prop, showUpdateDialog→store,
     DiscoverDialog JSX→App)                                 → 修改
6.  App.tsx layout (single tree, h-screen+h-dvh,
     matchMedia resize, mobile top bar, mobile empty state)  → 修改
7.  TerminalView.tsx (Copy last command button)              → 修改
8.  3 dialogs: mobile sizing guard (AgentsPanel,
     ChannelManagePanel, GlobalSettingsDialog)               → 修改
9.  i18n keys (nav.sessions/agents/channels, types.ts)      → 修改
10. RoomHeader: NO changes                                   → 跳过
```

**每步验证门禁：** `pnpm build && pnpm test` 通过再进下一步。

## 6. What is NOT Done

- ❌ **零代码改动** — 所有文件未动，纯设计阶段
- ❌ Issue 契约格式未定 — 用户要求先定契约再生成 issue
- ❌ 文档未提交

## 7. What the Next Session Should Do

1. **确定 Issue 契约格式** — 用户说"issues要按照流程，按照契约来生成"。问清契约模板/字段/粒度。
2. **提交文档** — `git add docs/ && git commit`
3. **按 Phase 1 10 步顺序实现** — 每步先写测试（unit test 模块：MobileDrawer, lobby-store, MobileNav），再写实现
4. **每步验证** — `pnpm build && pnpm test` 通过再继续
5. **Phase 1 完成后** — `pnpm -r build` → 手动测试 5 个 viewports + landscape

## 8. Design Review Summary

设计经 2 轮评审：

| 评审 | 方式 | 结果 |
|------|------|------|
| **Workflow review** | 5 维度并行（arch/mobile-ux/risk/upstream/completeness） | 41 findings → 31 accepted, 文档已更新 |
| **Loop review** | 4 轮 claude -p 独立评审（plan + default rubrics） | 3 → 0 → 0 → 0，收敛。6 处修改已应用 |

## 9. Environment Notes

- `claude -p` 可用但走 DeepSeek 代理（`ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`）
- 评审 rubrics 在 `~/.claude/review-rubrics/`：default, plan, security, testing, performance, config
- `~/.claude/settings-review.json` 为子进程 Read 授权
- 分支 `feat/mobile-adaptation` 基于上游 main（commit 90abc90）
- `.review-loop-state` 标记 done=true，删除可重新 loop
