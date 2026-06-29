---
type: AFK
estimate: 0.5d
effort: small
status: in_review
blocked_by: ["001"]
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files:
  - packages/web/src/components/__tests__/Sidebar.test.tsx
---

# #003 — Sidebar 适配

## Parent

`docs/mobile-adaptation-phase-1-prd.md`

## 背景

Sidebar 硬编码 w-72，对话框用本地 useState。需响应式宽度 + state 提升到 store（#001 已就位）。

## What to build

修改 `packages/web/src/components/Sidebar.tsx`：
1. `w-72` → `w-full md:w-72`
2. 新增 `onSessionSelect?: (sessionId: string) => void` prop
3. 4 个对话框 useState → useLobbyStore (showAgentsPanel/showChannelPanel/showSettingsDialog/showUpdateDialog)。JSX 元素留待 #004 移至 App.tsx
4. SessionCard: JS isHovered → CSS group-hover，已 pin 项始终可见
5. discoverDialog JSX 保持位置不变，store 读写正常

## Acceptance Criteria

- [ ] AC1: 桌面端 Sidebar 280px，功能不变
- [ ] AC2: 移动端 Sidebar w-full
- [ ] AC3: onSessionSelect prop 触发回调
- [ ] AC4: 4 个对话框状态从 store 读写，无本地 useState
- [ ] AC5: SessionCard 桌面 hover 显示按钮，pin icon 始终可见
- [ ] AC6: 移动端 SessionCard 按钮始终可见
- [ ] AC7: 桌面端 7 项操作均完成且无 console error（创建/选择/删除/LM/导入/主题/语言）
- [ ] AC8: pnpm build + test 全绿

## 前置准备

- [x] #001 完成

## 代码目录

- 实现: packages/web/src/components/Sidebar.tsx
- 测试: packages/web/src/components/__tests__/Sidebar.test.tsx

## Scope

**In:** Sidebar 响应式宽度, onSessionSelect, dialog state→store, group-hover
**Out:** 对话框 JSX 移动(#004), 其他组件, long-press(Phase3)

## 架构约束

| # | 约束 |
|---|------|
| R1 | 不修改 core/server/cli |
| R2 | 零新依赖 |

## 测试策略

- 单元: 响应式宽度 class, onSessionSelect 回调, store 读写, group-hover class, 无残留 JS hover
- 手动: 桌面全功能零回归

## 风险

- 桌面回归风险中 — AC7+AC8 门禁
- 回退: git revert

## 依赖表格

| 工具 | 版本 | 参考 |
|------|------|------|
| React | 19.x | 现有 |
| Zustand | 5.x | 现有 |
| Tailwind | >=3.4 | group-hover |

## Issue 质量自检

- [x] 1. ≤1d (0.5d)
- [x] 2. AFK
- [x] 3. AC 可量化(8条)
- [x] 4. 目录已指定
- [x] 5. 前置准备完整
- [x] 6. 测试策略明确
- [x] 7. SDK 参考
- [x] 8. 无主观验收
- [x] 9. blocked_by: [001]
- [x] 10. 架构约束已引用
- [x] 11. 集成覆盖(store)
- [x] 12. Scope 清晰
- [x] 13. needs_* 已声明
- [x] 14. test_files 已指定
