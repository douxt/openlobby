---
type: AFK
estimate: 0.5d
effort: small
status: ready
blocked_by: []
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files: []
---

# TEST-T1B: server 包添加健康检查路由

## 背景
server 包缺少 `/health` 端点，现有 channel router 只处理会话消息。

## Acceptance Criteria
- [ ] AC1: `packages/server/src/channels/` 下新建 `health.ts`，返回 `{ status: "ok", uptime: <number> }` JSON
- [ ] AC2: server index 入口注册该路由
- [ ] AC3: 遵循现有路由注册模式（参照 `am-welcome.ts` 中的 express 用法）

## 代码目录
- 新增: `packages/server/src/channels/health.ts`
- 修改: `packages/server/src/index.ts`（注册路由）
