---
from: openlobby/agent-b
to: dev-machine/agent-a
project: openlobby
type: infra_fix
id: openlobby-20260701-001
status: pending
created: 2026-07-01T23:00:00+08:00
---

## 问题描述

Issue `000-TEST-REAL-modify-config` 要求修改 `.devflow/config.yaml` 的 `project.name` 字段。Agent B 无权限修改管线文件，需 A 执行。

## 操作清单

- [ ] 修改 `/home/www/.archon/workspaces/www/openlobby/worktrees/archon/task-auto-execute-afk-1782917174764/.devflow/config.yaml`，将 `project.name` 值从 `my-project` 改为 `TEST-WORKTREE`
- [ ] commit: `git add .devflow/config.yaml && git commit -m "test: change project name to TEST-WORKTREE for #000"`
- [ ] push 并创建 PR，PR title: `test: modify config name to TEST-WORKTREE`
- [ ] PR 合并后，将 issue `000-TEST-REAL-modify-config` 的 frontmatter `status: ready` 改为 `status: done`

## 验证方法

```bash
grep 'name:' .devflow/config.yaml
# 预期输出: name: TEST-WORKTREE
```

## 相关上下文

- 项目路径: `/home/www/.archon/workspaces/www/openlobby/worktrees/archon/task-auto-execute-afk-1782917174764`
- 相关文件: `.devflow/config.yaml`
- 相关 issue: `000-TEST-REAL-modify-config`
- 当前分支: `archon/task-auto-execute-afk-1782917174764`
