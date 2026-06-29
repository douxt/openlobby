---
type: AFK
estimate: 0.75d
effort: small
status: done
pr: ["https://github.com/douxt/openlobby/pull/18"]
blocked_by: ["001"]
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files:
  - packages/web/src/components/__tests__/MobileDrawer.test.tsx
  - packages/web/src/components/__tests__/MobileNav.test.tsx
---

# #002 — MobileDrawer + MobileNav 组件

## Parent

`docs/mobile-adaptation-phase-1-prd.md`

## 背景

移动端需要侧滑抽屉和底部标签导航。新建文件，共享 lobby-store（#001）。

## What to build

### MobileDrawer.tsx

Props: `{ open, onClose, children }`。固定定位 overlay：
- 外壳常驻 `fixed inset-0 z-45`, pointer-events 切换
- Backdrop `bg-black/50`, 点击触发 onClose, transition opacity 200ms
- Panel `w-[85vw] max-w-[320px]`, translate-x 过渡, stopPropagation
- Escape key 关闭, scroll lock, 条件挂载 children
- ARIA: `role=dialog aria-modal`, ErrorBoundary, React.memo

### MobileNav.tsx

底部固定 3 tab：Sessions/Agents/Channels。
- `fixed bottom-0 z-40 md:hidden`, safe-area padding
- 激活态从 drawerOpen/showAgentsPanel/showChannelPanel 派生
- Agents badge, i18n 文本, `h-[var(--mobile-nav-height)]`

## Acceptance Criteria

- [ ] AC1: open=true → panel translate-x-0, backdrop opacity-100, body overflow hidden, aria-modal
- [ ] AC2: open=false → panel -translate-x-full, backdrop opacity-0, pointer-events-none, children 未挂载
- [ ] AC3: 点击 backdrop → onClose 被调用
- [ ] AC4: Escape → onClose 被调用
- [ ] AC5: 点击 panel 内部 → onClose 不触发
- [ ] AC6: Sidebar 异常 → ErrorBoundary fallback, App 不崩溃
- [ ] AC7: MobileNav 3 按钮渲染，文本正确
- [ ] AC8: 点击 tab → 对应 store setter 调用
- [ ] AC9: >=768px MobileNav 不可见
- [ ] AC10: reduced-motion → 0ms transition

## 前置准备

- [x] #001 完成

## 代码目录

- 实现: packages/web/src/components/MobileDrawer.tsx, MobileNav.tsx
- 测试: packages/web/src/components/__tests__/MobileDrawer.test.tsx, MobileNav.test.tsx

## Scope

**In:** MobileDrawer + MobileNav 完整实现含测试
**Out:** Swipe gesture(Phase3), Long-press(Phase3)

## 架构约束

| # | 约束 |
|---|------|
| R1 | 不修改 core/server/cli |
| R2 | 零新依赖 |
| R5 | z-index: Nav 40, Drawer 45, Modals 50 |

## 测试策略

- MobileDrawer 单元: open/close/backdrop/Escape/stopPropagation/scroll lock/ARIA/ErrorBoundary
- MobileNav 单元: 3 按钮渲染 + setter 调用 + desktop 隐藏 + 激活态推导

## 风险

- focus trap 中断键盘导航 — 仅 drawer open 时激活
- React.memo stale — onClose useCallback 稳定化
- 双 Sidebar 实例 — matchMedia 互斥
- 回退: git revert

## 依赖表格

| 工具 | 版本 | 参考 |
|------|------|------|
| React | 19.x | 现有 |
| Zustand | 5.x | 现有 |
| @testing-library/react | latest | 组件测试 |

## Issue 质量自检

- [x] 1. ≤1d (0.75d)
- [x] 2. AFK
- [x] 3. AC 可量化(10条)
- [x] 4. 目录已指定(4文件)
- [x] 5. 前置准备完整
- [x] 6. 测试策略明确
- [x] 7. SDK 参考
- [x] 8. 无主观验收
- [x] 9. blocked_by: [001]
- [x] 10. 架构约束已引用
- [x] 11. 集成覆盖(store setter)
- [x] 12. Scope 清晰
- [x] 13. needs_* 已声明
- [x] 14. test_files 已指定
