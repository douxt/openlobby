---
pr: ["https://github.com/douxt/openlobby/pull/29"]
type: AFK
estimate: 0.25d
effort: small
status: failed
blocked_by: []
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files:
  - packages/web/src/components/__tests__/MobileDrawer.test.tsx
  - packages/web/src/stores/__tests__/lobby-store.test.ts
---
pr: ["https://github.com/douxt/openlobby/pull/29"]

# #006 — 移除 MobileNav 底部导航栏

## Parent

人工检验反馈（Gate 7 审查）

## 问题

MobileNav 底部固定导航栏（Sessions / Agents / Channels 三个 tab）与左侧 Sidebar 功能完全重叠，且遮挡侧边栏底部内容。Sidebar 已提供全部入口，MobileNav 多余。

## Acceptance Criteria

| # | AC | 验证方式 |
|:--|----|------|
| AC1 | 删除 `packages/web/src/components/MobileNav.tsx` | 文件不存在 |
| AC2 | 删除 `packages/web/src/components/__tests__/MobileNav.test.tsx` | 文件不存在 |
| AC3 | 从 `packages/web/src/i18n/en.ts` 删除 `nav.sessions`、`nav.agents`、`nav.channels` 三个 key | grep 无匹配 |
| AC4 | 从 `packages/web/src/i18n/zh-CN.ts` 删除对应三个 key | grep 无匹配 |
| AC5 | 从 `packages/web/src/i18n/types.ts` 删除对应三个类型定义 | grep 无匹配 |
| AC6 | `pnpm -r build` 成功，无 MobileNav 引用报错 | build 0 错误 |
| AC7 | `pnpm test` 全绿（MobileDrawer + lobby-store 测试无回归） | 全部 pass |

## Scope

**In**:
- `packages/web/src/components/MobileNav.tsx`
- `packages/web/src/components/__tests__/MobileNav.test.tsx`
- `packages/web/src/i18n/en.ts`
- `packages/web/src/i18n/zh-CN.ts`
- `packages/web/src/i18n/types.ts`

**Out**:
- `MobileDrawer.tsx` — 保留（移动端抽屉仍需要）
- `Sidebar.tsx` — 不碰
- `lobby-store.ts` — 5 个 mobile-ui 字段可能被 MobileDrawer/Sidebar 使用，本次不删

## 依赖

- `blocked_by: ["002"]` — MobileNav 来自 #002

## 宪法自检

| # | 检查项 | 状态 |
|:--|--------|:--:|
| 1 | estimate ≤1d | ✅ 0.25d |
| 2 | type 正确 | ✅ AFK |
| 3 | AC 可测量 | ✅ 文件删除/build/test 全可自动化 |
| 4 | 目录已指定 | ✅ 精确到文件 |
| 5 | 外部依赖 | ✅ 无 |
| 6 | 测试策略 | ✅ 删除旧测试 + 确认现有测试无回归 |
| 7 | SDK 用法 | ✅ 无新 SDK |
| 8 | 无主观验收 | ✅ 全可自动化 |
| 9 | 跨 issue 引用 | ✅ blocked_by: 002 |
| 10 | 架构约束 | ✅ 纯删除，无架构影响 |
| 11 | AC 覆盖集成 | ✅ build 覆盖编译集成 |
| 12 | Scope 边界 | ✅ In/Out 明确 |
| 13 | needs_* | ✅ 全 false |
| 14 | test_files | ✅ 精确路径 |
