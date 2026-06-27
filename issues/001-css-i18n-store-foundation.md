---
type: AFK
estimate: 0.75d
effort: small
status: in_review
blocked_by: []
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files:
  - packages/web/src/stores/__tests__/lobby-store.test.ts
---

# #001 — CSS 基础 + i18n + lobby-store 扩展

## Parent

`docs/mobile-adaptation-phase-1-prd.md` — PRD: Mobile Adaptation Phase 1

## 背景

Phase 1 所有组件依赖 CSS 基础设施（safe-area、dvh fallback、touch target、drawer 动画、reduced-motion、CSS 变量）、i18n 翻译 key、以及 lobby-store 新增的移动端状态字段。本 issue 是其他 4 条 issue 的 blocker，必须最先完成。

## What to build

三个纯数据/样式变更，无组件依赖：

**1. CSS 基础设施** — `packages/web/src/index.css`
新增 mobile adaptation CSS 块，用 `/* Mobile adaptation: begin */` / `/* Mobile adaptation: end */` 包裹。内容包括：
- `.pb-safe` — safe-area-inset-bottom 工具类
- `.h-dvh-fallback` — `height: 100vh; height: 100dvh` 双值回退
- `.tap-target` — min-height/min-width 44px（WCAG 2.5.5）
- `:root { --mobile-nav-height: 56px }` — 底部导航高度 CSS 变量
- `.drawer-backdrop` / `.drawer-panel` — drawer 过渡动画 + theme transition
- `@media (prefers-reduced-motion: reduce)` — 禁用 drawer 过渡

**2. i18n keys** — 三个 flat dot-notation key：
- `packages/web/src/i18n/en.ts` — `'nav.sessions': 'Sessions'`, `'nav.agents': 'Agents'`, `'nav.channels': 'Channels'`
- `packages/web/src/i18n/zh-CN.ts` — `'nav.sessions': '会话'`, `'nav.agents': '代理'`, `'nav.channels': '频道'`
- `packages/web/src/i18n/types.ts` — `Messages` interface 新增 3 个 string 字段

**3. lobby-store 扩展** — `packages/web/src/stores/lobby-store.ts`
在现有 Zustand store 中新增 5 个 boolean 字段 + setters：
- `drawerOpen: boolean` + `setDrawerOpen(open: boolean)`
- `showAgentsPanel: boolean` + `setShowAgentsPanel(show: boolean)`
- `showChannelPanel: boolean` + `setShowChannelPanel(show: boolean)`
- `showSettingsDialog: boolean` + `setShowSettingsDialog(show: boolean)`
- `showUpdateDialog: boolean` + `setShowUpdateDialog(show: boolean)`

默认值全部 `false`。遵循现有 Zustand immer 模式，不引入新 middleware。

## Acceptance Criteria

- [ ] AC1: `index.css` 包含 `/* Mobile adaptation: begin */` 和 `/* Mobile adaptation: end */` 注释块，中间包含上述 6 项 CSS 规则
- [ ] AC2: 3 个 i18n key 在 `en.ts`、`zh-CN.ts`、`types.ts` 中全部存在，`pnpm build` 无类型错误
- [ ] AC3: lobby-store 中 5 个新字段默认值为 `false`，setter 调用后值正确切换
- [ ] AC4: store 写入不影响任何现有字段（snapshot diff: 仅新增字段差异）
- [ ] AC5: `pnpm build` 成功，无 CSS/TS 编译错误

## 前置准备

- [x] `pnpm install` — 依赖已安装
- [x] Tailwind 3.4+ 已确认内置 `h-dvh`（执行 `pnpm list tailwindcss` 查看版本）
- [ ] 确认 tailwindcss 版本 `>=3.4`，否则需在 `tailwind.config.js` 中 `theme.extend.height` 添加 `dvh` 自定义值

## 代码目录

- 实现: `packages/web/src/index.css`, `packages/web/src/i18n/en.ts`, `packages/web/src/i18n/zh-CN.ts`, `packages/web/src/i18n/types.ts`, `packages/web/src/stores/lobby-store.ts`
- 测试: `packages/web/src/stores/__tests__/lobby-store.test.ts`（新建）

## Scope

**In:**
- index.css 中新增 mobile adaptation 注释块
- 3 个 i18n 文件各加 3 行
- lobby-store.ts 加 5 个字段 + 5 个 setter

**Out:**
- 任何组件文件（App.tsx, Sidebar.tsx 等）
- Phase 2/3 CSS（更多手势、动画）
- i18n key 以外的翻译文本

## 架构约束

| # | 约束 | 来源 |
|---|------|------|
| R1 | 不修改 packages/core, packages/server, packages/cli | PRD §1.2 |
| R2 | 零新 npm 依赖 | PRD §Bundle |
| R4 | CSS 变更必须包裹在 `/* Mobile adaptation: begin/end */` 注释块内 | PRD §Architecture Constraints |
| R6 | 不引入 `useMediaQuery` hook，CSS breakpoints 覆盖所有布局切换 | 决策 D7 |

## 测试策略

- **单元测试**: lobby-store — new field defaults, setter correctness, non-interference with existing state
- **手动验证**: `pnpm build` 成功，浏览器 devtools 确认 CSS 变量和类可用

## 风险

- CSS 变量冲突风险低 — 新增变量使用 `--mobile-*` 前缀，不覆盖现有变量
- Tailwind 版本依赖风险低 — `h-dvh` 在 3.4+ 内置，若版本不足需在 config 中扩展
- Store 字段扩展风险低 — 新增字段默认 false，保持向后兼容
- 回退: `git revert` 对应 commit，零数据迁移（纯前端 CSS/TS）

## 依赖表格

| SDK/工具 | 版本 | 参考 |
|----------|------|------|
| Tailwind CSS | >=3.4 (含 h-dvh) | https://tailwindcss.com/docs/height#dynamic-viewport-height |
| Zustand | 5.x (immer) | 现有 store 模式 |
| env() safe-area | CSS spec | https://developer.mozilla.org/en-US/docs/Web/CSS/env |

## Issue 质量自检（对照宪法 14 项）

- [x] 1. estimate ≤1d — 0.75d ✅
- [x] 2. type AFK — 纯代码，无人机交互 ✅
- [x] 3. AC 可测量 — 5 条 AC 均可自动化断言 ✅
- [x] 4. 代码目录已指定 — 5 个精确文件路径 ✅
- [x] 5. 前置准备完整 — 仅需确认 tailwind 版本 ✅
- [x] 6. mock/E2E 策略明确 — store unit test + build 验证 ✅
- [x] 7. SDK 用法可参考 — 依赖表格已记录 ✅
- [x] 8. 验收无主观 — 全部可量化和自动化 ✅
- [x] 9. blocked_by 无循环 — 无阻塞 ✅
- [x] 10. 架构约束已引用 — R4, R6 ✅
- [x] 11. AC 覆盖集成层 — i18n build 通过验证集成 ✅
- [x] 12. Scope 边界清晰 — In/Out 已列 ✅
- [x] 13. needs_* 已声明 — needs_llm: false ✅
- [x] 14. test_files 已指定 — lobby-store.test.ts ✅
