# Gate 7 人工审查改进方案

> **日期**: 2026-06-28
> **参考**: Squid 5-agent pipeline, Rewind Diff Vader deterministic gate, Yalla binary review gates, GitHub Copilot code review best practices

## 现状

Gate 7（人工审查）完全手工：人需 cherry-pick Archon 分支代码、grep 验证 AC、跑 build、手动改 issue 状态。无 GitHub PR 流程、无自动验证结果、无风险分级。

## 目标

人工审查变成：**打开 GitHub PR → 看门禁矩阵 → 扫 diff → 点 Approve → 自动合入**。

---

## 详细设计

### 阶段 1：恢复正常 PR 流程（P0）

**现状问题**: Archon 代码只在 worktree 的 `archon/task-*` 分支，未推送我们的 fork。PR 创建到上游 kkkkkk1k1/openlobby。

**修复点**:

| # | 改动 | 位置 | 工作量 |
|---|------|------|:---:|
| 1 | create-pr 节点：push archon 分支到 origin | auto-execute-afk.yaml | 5 行 |
| 2 | create-pr 节点：`gh pr create --repo douxt/openlobby` | auto-execute-afk.yaml | 1 行 |
| 3 | mark-in-review 节点：写 PR URL 到 issue frontmatter | auto-execute-afk.yaml | 已有，验证 |

**验证标准**: #004 完成后，GitHub douxt/openlobby 上出现 PR，可从浏览器直接 review。

**工作量**: 0.25d（测试一个 issue 跑通即可）

### 阶段 2：门禁矩阵入 PR 描述（P1）

**现状问题**: 人看不到 AC 通过情况，不知道测试是否通过，只能自己跑。

**修复点**:

| # | 改动 | 位置 | 工作量 |
|---|------|------|:---:|
| 1 | auto-review/hard-gate 节点输出结构化 JSON | auto-execute-afk.yaml | ~20 行 |
| 2 | create-pr 节点读取 JSON，生成 PR body 模板 | auto-execute-afk.yaml | ~15 行 |

**PR 描述模板**:
```markdown
## 改动摘要
- 新增: packages/web/src/components/MobileDrawer.tsx (136行)
- 修改: packages/web/src/components/Sidebar.tsx (36行)

## 门禁矩阵
| AC | 状态 | 证据 |
|----|:---:|------|
| AC1: 响应式宽度 | ✅ | Sidebar.tsx: w-full md:w-72 |
| AC2: onSessionSelect | ✅ | Sidebar.tsx:15 |
| ... | | |

| 检查 | 结果 |
|------|:---:|
| TypeScript 编译 | ✅ |
| 单元测试 | ✅ 12/12 |
| Lint | ✅ |
| 安全扫描 | ⬜ (未配置) |

## 审查建议
🟢 低风险 — 仅修改前端组件，不涉及后端/数据库/认证
⏱️ 预计审查时间: 3-5 分钟
```

**工作量**: 0.5d

### 阶段 3：merge 后自动 done（P1）

**现状问题**: 人 merge PR 后需手动改 issue done。

**方案**: reconcile.sh 新增一步 — 检测 in_review issue 的 PR 已合并 → 自动标 done

```bash
# reconciler.sh 新增步骤
# 5. in_review + PR 已合并 → done
for f in $(grep -rl "^status: in_review$" "$ISSUES_DIR"); do
    PR_URL=$(grep "^pr:" "$f" | head -1)
    if gh pr view "$PR_URL" --json mergedAt | grep -q "20"; then
        sed -i "s/^status: in_review$/status: done/" "$f"
        log "AUTO_DONE: $(basename $f) PR 已合并"
    fi
done
```

**工作量**: 0.25d

### 阶段 4：风险标记（P2）

**方案**: bash 确定性评分，非 LLM 判断。参考 Crush Override 2026 三层模型。

**评分算法**:
```bash
RISK_SCORE=0

# 高敏路径: +100（立即 critical）
if echo "$CHANGED_FILES" | grep -qE 'auth|crypto|security|payment|secret|token|password'; then
    RISK_SCORE=$((RISK_SCORE + 100))
fi

# 大改动: +50
if [ "$LINES_CHANGED" -gt 200 ]; then RISK_SCORE=$((RISK_SCORE + 50)); fi

# 无测试: +25
if ! git diff HEAD~1 --name-only | grep -q "test\|spec\|__tests__"; then
    RISK_SCORE=$((RISK_SCORE + 25))
fi

# 分级
if [ "$RISK_SCORE" -ge 100 ]; then RISK_LEVEL="critical"
elif [ "$RISK_SCORE" -ge 50 ]; then RISK_LEVEL="high"
elif [ "$RISK_SCORE" -ge 25 ]; then RISK_LEVEL="medium"
else RISK_LEVEL="low"
fi
```

**与我们项目的映射**:

| 风险 | 触发路径 | 审查要求 |
|:---:|------|------|
| **critical** | `packages/server/src/auth`, `packages/server/src/db`, `.github/workflows`, 依赖安全 | 必须人类 review + 双模型审查一致 |
| **high** | `packages/(core\|server\|cli)`, 200+ 行改动, 无测试 | 人工逐条 AC |
| **medium** | `packages/web/src/stores`, 有代码改动 + 有测试 | 5 分钟快速扫 |
| **low** | `packages/web/src/components`, CSS, i18n, 测试文件, docs | 3 分钟扫或 auto-approve |

**工作量**: 0.5d

---

## 总工作量

| 阶段 | 内容 | 工作量 | 优先级 |
|:---:|------|:---:|:---:|
| 1 | 正常 PR 流程 | 0.25d | **P0** |
| 2 | 门禁矩阵入 PR 描述 | 0.5d | **P1** |
| 3 | merge 自动 done | 0.25d | **P1** |
| 4 | 风险标记 | 0.5d | **P2** |
| **合计** | | **1.5d** | |

## 预期效果

```
改进前:
  in_review → 人 cherry-pick → grep AC → pnpm build → 手动 done
  耗时: 10-15 分钟，依赖终端

改进后:
  in_review → 人打开 GitHub PR → 看门禁矩阵(3秒) → 扫 diff(3分钟) → Approve
  耗时: 3-5 分钟，全在浏览器完成
```
