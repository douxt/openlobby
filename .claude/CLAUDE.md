# OpenLobby — Multi-Session Claude Code Chat

Fork from kkkkkk1k1/openlobby. Web-based multi-session Claude Code interface.

## Tech Stack
- Node.js 22+
- npm
- TypeScript

## Project Structure
- `packages/` — monorepo packages
- `scripts/` — build & dev scripts

## Common Commands
```bash
npm test        # Run tests
npm run build   # Build
npm run lint    # Lint
```

<!-- ⚠️ 以下由 ai-dev-flow-server install.sh 自动追加 -->
## AI Dev Flow（服务器版）

本项目已安装 ai-dev-flow-server 开发流程约束。

### Gate 流程

| Gate | 命令 | 说明 |
|------|------|------|
| 1 | `/gate-1-grill` | 需求对齐 — grill 全方位拷问 |
| 2 | `/gate-2-prd` | 产出 PRD — 附带宪法自检 |
| 3 | `/gate-3-issues` | 拆解 Issue — 垂直切片 + 宪法对照 |
| 4 | `/gate-4-review` | Issue 评审 — CC 子进程独立评审 |
| 5 | `/gate-5-prep` | 环境检查 — .devflow/ 完整性 |
| 6 | `/gate-6-afk` | AFK 就绪 — 确认 dispatch 管线 |

### Issue 状态机

```
backlog → ready → in_progress → done
```

- 人将 issue 拖到 `ready` → dispatch.timer 自动消化
- dispatch.sh: 宪法检查 → 原子抢占 → Archon 7 节点工作流 → PR
- PR 创建后 Telegram 通知审批

### 关键路径

| 内容 | 路径 |
|------|------|
| 项目配置 | `.devflow/config.yaml` |
| 知识库 | `.devflow/knowledge/` |
| Gate 状态 | `.gate-state` |
| Issue 目录 | `issues/` |
| 调度日志 | `logs/dispatch.log` |

<!-- ⚠️ 以下由 ai-dev-flow-server v2.1 自动追加 -->
## Agent B 权限边界

Agent B（本地 Claude Code）的权限按仓库区分：

| 仓库类型 | 能干什么 | 不能干什么 |
|---------|---------|-----------|
| **业务项目**（openlobby 等） | commit、push、开 PR、**合并 PR 到 main**（人审后由 B 执行 merge） | 直推 main |
| **管线框架**（devflow-src） | 只能读 | **禁止 commit、禁止 push、禁止 merge** |
| **管线文件**（.devflow/、CLAUDE.md） | 只能读 | 修改需写 `_handoff/outbox/agent-b/` 委托 Agent A |

Agent B 在业务项目里拥有完整开发权限——写代码、开 PR、人审后**由 B 执行合并**。Agent B 在管线框架里是只读用户——要改管线配置就走 handoff 委托。

## 计划文件管理（防覆盖）

- 每次新计划创建新文件，文件名含日期+主题，禁止覆盖已有计划文件
- 计划执行完毕后，关键设计决策（权限边界、接口约束、架构取舍、被拒绝的方案）必须提取为 ADR
- ADR 存放：项目有 `docs/decisions/` 则写项目，否则写 `~/.claude/plans/decisions/`
- 旧计划文件保留不删；计划只存执行步骤，不可变决策回流正式文档

### ADR 格式

```markdown
# ADR-NNN: <标题>
## 状态：已采纳 / 已废弃
## 日期：YYYY-MM-DD
## 背景
## 决策
## 后果
## 拒绝的方案
```
<!-- ai-dev-flow-server end -->
