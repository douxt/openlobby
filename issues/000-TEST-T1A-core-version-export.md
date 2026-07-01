---
type: AFK
estimate: 0.5d
effort: small
status: failed
blocked_by: []
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files: ["packages/core/src/index.ts", "packages/cli/src/bin.ts"]
---

# TEST-T1A: core 包导出 VERSION 常量

## 背景
`packages/cli/src/bin.ts` 硬编码 `VERSION = '0.6.3'`，而 `packages/core` 没有版本常量。统一在 core 层定义并导出。

## Acceptance Criteria
- [ ] AC1: `packages/core/src/index.ts` 新增 `export const VERSION = '0.6.3'`
- [ ] AC2: `packages/cli/src/bin.ts` 改为 `import { VERSION } from '@openlobby/core'`
- [ ] AC3: 无 TypeScript 编译错误（不涉及 build 验证）

## 代码目录
- 修改: `packages/core/src/index.ts`, `packages/cli/src/bin.ts`
