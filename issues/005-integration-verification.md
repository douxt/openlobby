---
type: HITL
estimate: 0.5d
effort: small
status: backlog
blocked_by: ["004"]
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files:
  # 纯手动验证 issue — 5 viewport x 10 检查 + 桌面 11 项回归 + 横屏 + 无障碍
  # 无自动化测试文件，所有验证通过 DevTools viewport emulation + 手动操作完成
---

# #005 — 集成验证 + 桌面回归

## Parent

`docs/mobile-adaptation-phase-1-prd.md` — PRD: Mobile Adaptation Phase 1

## 背景

#001-#004 完成所有代码变更后，需要系统性验证：构建无错误、测试全绿、桌面零回归、5 个移动 viewport 功能正常。本 issue 是 Phase 1 的质量门禁，通过后 Phase 1 可标记完成。

## What to build

纯验证 issue，不写生产代码。执行以下验证步骤，记录结果。

### 1. 构建验证
```bash
pnpm -r build
```
- 确认 packages/web 构建成功，无 TS 错误、无 CSS 警告
- 确认 packages/core, packages/server, packages/cli 构建不受影响（零改动，应直接通过）

### 2. 测试验证
```bash
pnpm test
```
- 确认所有已有测试通过
- 确认 #001-#004 新增测试通过
- 确认无 flaky test（重复跑 3 次全绿）

### 3. 桌面回归（1920×1080）
手动检查：
- Sidebar 280px 常驻，session 列表完整
- Session 创建/选择/删除/重命名 全功能正常
- SessionCard hover 显示 pin/rename 按钮
- Lobby Manager 可用
- 主题切换（light/dark）
- 语言切换（en/zh-CN）
- DiscoverDialog 扫描导入
- AgentsPanel, ChannelManagePanel, GlobalSettingsDialog, UpdateDialog 全部可用
- Plan Mode toggle
- 文件上传
- 无 MobileNav 出现，无 hamburger 出现

### 4. 移动端手动测试（5 viewports）

| # | Viewport | 设备 |
|---|----------|------|
| V1 | 320×568 | iPhone SE 1st gen |
| V2 | 375×667 | iPhone SE 3rd gen |
| V3 | 390×844 | iPhone 12/13/14 |
| V4 | 430×932 | iPhone 14 Pro Max |
| V5 | 768×1024 | iPad Mini portrait |

每个 viewport 检查：
- Hamburger 可见，点击打开 drawer
- Drawer 滑入 200ms，backdrop 50% 不透明
- Session 列表可用，点击 session 打开
- Backdrop 点击关闭 drawer
- Escape key 关闭 drawer
- MobileNav 3 tabs 可见且可点击
- Agents panel / Channel panel 从 tab 打开
- 对话框可滚动、可关闭
- TerminalView Copy button 可见（terminal 模式）
- 安全区 padding 正常（V3/V4）
- body 在 drawer 打开时不滚动

### 5. 横屏 + 断点穿越
- 横屏 568×320 无 crash
- 从 375×667 缩放至 1024×768 → drawer 自动关闭、sidebar 出现
- 从 1024×768 缩放至 375×667 → sidebar 隐藏、MobileNav 出现

### 6. 无障碍快速检查
- Hamburger 有 `aria-label`, `aria-expanded`
- Drawer panel 有 `role="dialog"`, `aria-modal="true"`
- `prefers-reduced-motion: reduce` 下 drawer 无动画

## Acceptance Criteria

- [ ] AC1: `pnpm -r build` — 所有包构建成功，0 错误
- [ ] AC2: `pnpm test` — 全部测试通过（重复 3 次确认稳定性）
- [ ] AC3: 桌面回归（1920×1080）— 列出 11 项功能全部正常
- [ ] AC4: 5 个移动 viewport — 各自 10 项检查全部通过
- [ ] AC5: 横屏 + 断点穿越 — 无 crash、drawer 自动关闭
- [ ] AC6: 无障碍快速检查 — ARIA 属性完整、reduced-motion 生效
- [ ] AC7: 发现任何问题 → 输出问题清单，不标记 issue done
- [ ] AC8: 全部通过 → 标记本 issue done，更新 `.gate-state` gate-3 为 passed

## 前置准备

- [x] #001-#004 全部完成
- [ ] 本地 dev server 可启动（`pnpm --filter @openlobby/server dev` + `pnpm --filter @openlobby/web dev`）

## 代码目录

- 无生产代码变更
- 如有问题修复，在对应 issue 的 scope 内修改

## Scope

**In:**
- pnpm build 验证
- pnpm test 验证
- 桌面端 11 项功能回归
- 5 个移动 viewport 手动测试
- 横屏 + 断点穿越测试
- 无障碍快速检查

**Out:**
- 新功能实现
- 新测试编写
- Phase 2/3 任何内容
- E2E 自动化测试框架搭建

## 架构约束

N/A — 本 issue 为纯验证，不修改代码。

## 测试策略

本 issue 自身为测试 issue，执行手动验证清单。

## 风险

- 手动验证覆盖不全风险中 — 5 viewport 为模拟器，真机可能存在额外差异
- 缓解: 至少覆盖 375px（主流 iOS）和 390px（iPhone 12-14）两个最常用宽度
- 桌面回归遗漏风险低 — Sidebar 是全站入口，11 项检查覆盖所有核心路径
- 回退: 验证失败不 merge PR，修复后重新验证

## 依赖表格

N/A — 纯手动验证。

## Issue 质量自检（对照宪法 14 项）

- [x] 1. estimate ≤1d — 0.5d ✅
- [x] 2. type HITL — 含 5 viewport + 桌面 11 项手动验证步骤 ✅
- [x] 3. AC 可测量 — 8 条 AC 全部可观测 check/pass ✅
- [x] 4. 代码目录已指定 — N/A（无代码变更） ✅
- [x] 5. 前置准备完整 — #001-#004 + dev server ✅
- [x] 6. mock/E2E 策略明确 — 手动验证清单 ✅
- [x] 7. SDK 用法可参考 — N/A ✅
- [x] 8. 验收无主观 — 全部可观测（测试绿/红、功能有/无） ✅
- [x] 9. blocked_by 已设 — blocked_by: ["004"] ✅
- [x] 10. 架构约束已引用 — N/A（验证 issue） ✅
- [x] 11. AC 覆盖集成层 — build + test + 多 viewport 覆盖全栈 ✅
- [x] 12. Scope 边界清晰 — In/Out 已列 ✅
- [x] 13. needs_* 已声明 — 全部 false ✅
- [x] 14. test_files 已指定 — N/A（纯手动验证） ✅
