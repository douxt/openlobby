---
type: AFK
estimate: 1d
effort: small
status: in_review
blocked_by: ["002", "003"]
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files:
  - packages/web/src/__tests__/App.test.tsx
---

# #004 — App.tsx 布局重构 + 集成

## Parent

`docs/mobile-adaptation-phase-1-prd.md`

## 背景

Phase 1 核心集成点。将 #001-#003 产出在 App.tsx 连接为完整响应式布局。

## What to build

### App.tsx — 单 DOM 树

```
flex-col md:flex-row, h-screen h-dvh
  桌面 sidebar: hidden md:flex md:w-72
  移动 drawer: MobileDrawer(open) > Sidebar(onSessionSelect close)
  main: pb-mobile-nav md:pb-0
    移动顶栏: md:hidden hamburger + 标题
    RoomHeader
    内容区 (单份)
  移动导航: MobileNav
  对话框: 5 个从 store 渲染
```

关键：matchMedia >=768px 自动关 drawer, useCallback 稳定 onClose, 移动空状态引导。

### TerminalView.tsx — Copy last command 按钮

md:hidden, 点击复制最后终端命令。

### 3 对话框 — 移动安全尺寸

AgentsPanel/ChannelManagePanel/GlobalSettingsDialog: `max-h-[80dvh] overflow-y-auto w-[calc(100vw-32px)] md:w-96`

## Acceptance Criteria

- [ ] AC1: 桌面端 sidebar 280px, 无 MobileNav/hamburger, 功能不变
- [ ] AC2: 移动端 hamburger 可见, MobileNav 可见, sidebar 隐藏
- [ ] AC3: hamburger → drawer 滑入, backdrop 可见
- [ ] AC4: drawer session → 关闭+激活
- [ ] AC5: <768→>=768px matchMedia 关 drawer, sidebar 显示
- [ ] AC6: 移动首次加载无 session → 引导提示
- [ ] AC7: 5 对话框从 App.tsx 渲染, Sidebar toolbar 和 MobileNav 双入口均可触发
- [ ] AC8: TerminalView Copy 按钮移动端可见
- [ ] AC9: 3 对话框 568px 高度可滚动
- [ ] AC10: h-dvh 双值回退实现
- [ ] AC11: pnpm build + test 全绿

## 前置准备

- [x] #001 完成
- [x] #002 完成
- [x] #003 完成

## 代码目录

- 实现: packages/web/src/App.tsx, packages/web/src/components/TerminalView.tsx, packages/web/src/components/AgentsPanel.tsx, packages/web/src/components/ChannelManagePanel.tsx, packages/web/src/components/GlobalSettingsDialog.tsx
- 测试: packages/web/src/__tests__/App.test.tsx

## Scope

**In:** App 布局重构, matchMedia, 移动顶栏, 移动空状态, 对话框提升, TerminalView 按钮, 3 对话框尺寸
**Out:** RoomHeader 修改(Phase2), MessageBubble/Input/List(Phase2), 其余对话框(Phase2)

## 架构约束

| # | 约束 |
|---|------|
| R1 | 不修改 core/server/cli |
| R2 | 零新依赖 |
| R3 | 单 DOM 树 |
| R5 | z-index 层次 |

## 测试策略

- 单元: matchMedia handler, drawer auto-close, mobile empty state, dialog rendering
- 手动: 5 viewport 功能 + 桌面回归 + 横屏

## 风险

- matchMedia 循环 — useCallback+cleanup
- 上游冲突 — CSS 注释块+独立组件
- 回退: git revert

## 依赖表格

| 工具 | 版本 | 参考 |
|------|------|------|
| React | 19.x | useEffect, useCallback |
| Tailwind | >=3.4 | h-dvh, calc() |
| Zustand | 5.x | 现有 |

## Issue 质量自检

- [x] 1. ≤1d (1d)
- [x] 2. AFK
- [x] 3. AC 可量化(11条)
- [x] 4. 目录已指定(5文件)
- [x] 5. 前置准备完整
- [x] 6. 测试策略明确
- [x] 7. SDK 参考
- [x] 8. 无主观验收
- [x] 9. blocked_by: [002,003]
- [x] 10. 架构约束已引用
- [x] 11. 集成覆盖(E2E)
- [x] 12. Scope 清晰
- [x] 13. needs_* 已声明
- [x] 14. test_files 已指定
