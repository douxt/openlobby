# 管线实战报告 — 从设计到跑通的全过程

> **致**: 原始架构设计 Agent（Session 58333313-a0ce-4abc-83a7-8a4d144cedee）
> **来自**: openlobby 移动端适配项目 Gate 1-7 完整实战
> **日期**: 2026-06-28
> **项目**: douxt/openlobby feat/mobile-adaptation (5 条 issue)

## 概述

我们按 AI Dev Flow（服务器版）设计了完整的 Mobile Adaptation Phase 1 流程，从 Gate 1（需求对齐）跑到 dispatch + Archon 自动化执行。整个过程中发现并修复了 12 个实际问题。本文档用于归档经验、反馈给原始设计供迭代参考。

---

## 一、管线跑了什么

```
Gate 1: /grill-me → 31 条决策
Gate 2: /to-prd  → docs/mobile-adaptation-phase-1-prd.md
Gate 3: /to-issues → 5 条垂直切片 issue
Gate 4: /review-cc-cli → 2 轮评审，APPROVED
Gate 5: .devflow/ 完整性检查
Gate 6: dispatch.timer + reconcile.timer 就绪
dispatch: 5 条 issue 自动消化
```

## 二、发现的 12 个问题（按发现顺序）

### 基础设施层（3 个）

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 1 | `logs/dispatch.log` 不可写 | systemd service 以 root 创建日志，后续 www 用户无权限 | install.sh 加 `chown www:www logs/` |
| 2 | Archon workflow 找不到 | archon 扫描 `.archon/workflows/` 非 `.devflow/archon/` | install.sh 同时部署到两处；dispatch.sh 常量对齐 |
| 3 | 手动 bash dispatch.sh 被会话杀 | dispatch 绑在 Claude 进程树，会话断开则子进程死 | 只用 systemd timer 触发，禁止手动 |

### 环境安全层（3 个）

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 4 | `effort=medium` 阻塞宪法检查 | check_constitution.py 把 warning 算入 failed | issue 模板加 effort 规则；或改脚本区分 warning/fail |
| 5 | `git push` 无 upstream | 新分支首次推送无 tracking ref | install.sh 确保 push --set-upstream |
| 6 | PRD 落在 `issues/` 目录 | /to-prd 产物路径错误，dispatch 扫描时污染 | Gate 2 出口检查确认产物路径 `docs/*-prd.md` |

### 管线逻辑层（4 个）

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 7 | dispatch.sh `blocked_by` 解析缺引号剥离 | `["001"]` 解析为 `"001"` 带引号，find 找不到文件 | dispatch.sh 对齐 reconcile.sh 加 `sed 's/"//g'` |
| 8 | `git pull` 因脏工作树静默失败 | 手动 dispatch 修改文件未提交，rebase 拒绝 | dispatch.sh 加 `git stash` 保护 |
| 9 | reconcile 孤儿检测误杀 | 搜索 `ai/` 分支但 Archon 创建 `archon/` 分支 | 改为 `grep -qE "(ai\|archon)/"` |
| 10 | 自动化链 `--from` 缺失 | Archon 从 main 创建 worktree，无 issue 文件、缺已提交的依赖代码、origin 指向上游 | dispatch.sh 加 `archon workflow run ... --from $(git branch --show-current)` |

### 环境变量层（2 个）

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 11 | Archon 所有 LLM 节点 `Not logged in` | systemd service 未传 `ANTHROPIC_API_KEY` | service 文件加 `Environment=ANTHROPIC_API_KEY=...` |
| 12 | PR 创建到上游而非我们的 fork | worktree origin 未设为 douxt/openlobby | 修复 #10 后 worktree 自动继承正确 remote |

---

## 三、修复前后对比

```
修复前:
  标 ready → dispatch claim → Archon 启动 → "Not logged in" → 3 次空跑 
  → reconcile 回收 → 人工重置 → 死循环

修复后:
  标 ready → dispatch claim → 宪法通过 → Archon 从 feat/mobile-adaptation 创建 worktree
  → setup 同步 issue → implement 实现代码 → validate 跑测试 → review → create PR
  → mark in_review → reconcile 自动提升下一条 → dispatch 消化下一条
```

## 四、Archon 实际产出质量

| Issue | Archon 产出 | 状态 |
|-------|-----------|:---:|
| #001 CSS+i18n+store | 零（auth 修复前） | 人补完 |
| #002 MobileDrawer+Nav | 1280 行，14 文件，3 实现 commit | ✅ 经 cherry-pick 合入 |
| #003 Sidebar 适配 | 313 行，5 文件，2 实现 commit + 测试 | ✅ 经 cherry-pick 合入 |
| #004 App.tsx 集成 | 🔄 执行中 | — |

**评价**: 修复 #10 + #11 后，Archon 产出代码质量可靠（有实现、有测试、符合 AC）。主要痛点不在代码质量，在**人审流程**（见第五节）。

## 五、Gate 7（人审）现状与改进建议

### 当前瓶颈

```
in_review → 人发现代码在 archon 分支 → 手动 cherry-pick → 
去重冲突 → pnpm build → 改 issue done → 推
```

每次 10-15 分钟，全在终端操作。对用户不友好。

### 改进方案（详见 `docs/gate-7-review-improvement.md`）

| 阶段 | 改什么 | 工作量 |
|------|--------|:---:|
| P0 | PR 推到正确仓库，人浏览器 review | 0.25d |
| P1 | 门禁矩阵入 PR 描述（build/test/lint 结果） | 0.5d |
| P1 | merge PR 后自动标 issue done | 0.25d |
| P2 | bash 确定性风险分类（L0-L4） | 0.5d |

### 关键设计原则（搜索业界证实的）

1. **确定性门禁 > LLM 判断** — 编译、测试、lint、文件路径检查用 bash 退出码，不用 LLM 评分
2. **Writer/Reviewer 分离** — 实现节点和审查节点用不同模型/上下文
3. **文件路径是最大风险信号** — 改 auth/security 和改 CSS 的审查深度完全不同
4. **门禁数据直接入 PR 描述** — 人打开 PR 3 秒看到全貌，不用手动 grep

## 六、给原始设计的建议

1. **install.sh 需要更新的地方**: 见 `/opt/ai-dev-flow-server/` 的 git log（我们已推了 4 个 commit）
2. **dispatch.sh 与 reconcile.sh 的 `blocked_by` 解析需要统一** — 当前两处 sed 不同步
3. **Archon workflow 建议默认从当前分支创建 worktree** — `--from` 是核心修复
4. **check_constitution.py 的 warning/fail 区分** — 建议 warning 不阻塞，或者 effort 字段在 issue 模板中有明确指引
5. **Gate 7 需正常化** — 见 `docs/gate-7-review-improvement.md`，这是全流程唯一的断层

## 七、后续计划

- [ ] `docs/gate-7-review-improvement.md` 实施
- [ ] `--from` 修复合并到 ai-dev-flow-server 主分支
- [ ] 跑通全部 5 条 issue（当前到 #004）
- [ ] 多个项目并行测试（验证架构的横向扩展能力）
