# AFK 管线可观察性方案

> **日期**: 2026-06-27
> **状态**: 设计阶段，待实现
> **关联**: [[06-AFK脚本栈规范]] [[02-Step-Gate流程]]
> **参考**: Datadog Harness-First Engineering, Proof Loop evidence-backed done, OTel AgentOps 五支柱

## 问题陈述

当前管线调试困难：Archon worktree 内零可见，AC 完成状态无法追踪，dispatch.log 信息稀疏。排查 #001 死循环问题（3 次 claim→review 循环，lobby-store 从未被实现）暴露了缺乏 checkpoint、验证仅有 LLM（无线素检查）、无结构化 done 判定三个根本缺陷。

## 架构约束

| 约束 | 说明 |
|------|------|
| Archon v0.5.0 | DAG 仅前进，无回环；节点类型仅 `prompt`(LLM) 或 `bash` |
| Worktree 隔离 | 每次运行独立 clone，不保留上次产物 |
| 零新依赖 | bash + python3 即可，不引入 npm/pip 包 |
| DeepSeek 代理 | ANTHROPIC_BASE_URL 指向 DeepSeek，非原生 Claude API |
| systemd 调度 | dispatch.timer(5分) + reconcile.timer(15分) |

---

## 五层方案

### 第 1 层：dispatch.sh 结构化日志（P0）

**目标**: 捕获 Archon 每个节点的结构化输出，替代纯文本日志。

**改动位置**: `.devflow/archon/dispatch.sh` — Archon 调用段

```bash
# 现有
archon workflow run "$ARCHON_WORKFLOW" "$ISSUE_PATH" >> "$LOG_FILE" 2>&1

# 改为
archon workflow run "$ARCHON_WORKFLOW" "$ISSUE_PATH" 2>&1 | while IFS= read -r line; do
    echo "$line" >> "$LOG_FILE"
    # 捕获结构化标记
    echo "$line" | grep -qE "##\[(AC_DONE|AC_EXISTS|AC_FAIL|IMPLEMENT_RESULT|AC_VERIFY_RESULT|HARD_GATE)\]" && \
        log "ARCHON_NODE: $line"
done
```

**新增日志关键词**:

| 标记 | 来源 | 含义 |
|------|------|------|
| `##[AC_DONE]` | implement | 单个 AC 实现完成 |
| `##[AC_EXISTS]` | implement | AC 已有代码，跳过 |
| `##[AC_FAIL]` | implement | AC 实现失败 |
| `##[IMPLEMENT_RESULT]` | implement | 实现阶段汇总：ALL_DONE 或 AC_GAP |
| `##[AC_VERIFY_RESULT]` | ac-verify | 验证阶段汇总：VERIFIED 或 GAP |
| `##[HARD_GATE]` | hard-gate | 确定性检查结果：PASS 或 FAIL |

**效果**: `grep ARCHON_NODE logs/dispatch.log` 一眼看到每次 Archon 运行的核心结果。

---

### 第 2 层：status.sh 统一仪表盘（P1）

**目标**: 单命令输出完整管线视图，替代手动跑 6+ 个命令。

**文件**: `.devflow/scripts/status.sh`

**输出格式**:
```
┌─ Pipeline Status ─────────────────── 2026-06-27 21:15 ─┐
│ Timers: dispatch ✅  reconcile ✅                       │
│ Gates:  1✅ 2✅ 3✅ 4✅ 5✅ 6✅  7⬜                   │
├─ Issues ───────────────────────────────────────────────┤
│ #001  in_review  AFK   0.75d  AC:2/5 ❌  [LOOP:3×]     │
│ #002  backlog    AFK   0.75d  blocks: #001              │
│ #003  backlog    AFK   0.5d   blocks: #001              │
│ #004  backlog    AFK   1d     blocks: #002,#003         │
│ #005  backlog    HITL  0.5d   blocks: #004              │
├─ Checkpoints ──────────────────────────────────────────┤
│ #001  AC1:done  AC2:done  AC3:pending  AC4:pending     │
├─ Recent Activity ──────────────────────────────────────┤
│ 21:15  dispatch: NO_MORE_TASKS                          │
│ 21:00  reconcile: 无需修复                              │
└─────────────────────────────────────────────────────────┘
```

**实现要点**:
- 纯 bash，无外部依赖
- `grep status:` 解析 issue frontmatter
- 读取 `.archon/checkpoints/<issue>.json` 显示 AC 进度
- `tail -5 logs/dispatch.log` 提取最近活动
- 检测 `blocked_by` 依赖是否 done → 显示可自动提升状态

**用法**: `bash .devflow/scripts/status.sh` 或通过 cron 定期输出到文件。

---

### 第 3 层：workflow 结构化标记（P2）

**目标**: Archon 各节点输出机器可解析的结构化标记，下游节点据此决策。

**改动位置**: `.archon/workflows/auto-execute-afk.yaml`

**implement 节点**:
```yaml
- id: implement
  prompt: |
    阅读 $ARGUMENTS（issue 文件路径）。
    
    ## 第1步：读取 checkpoint
    读取 .archon/checkpoints/<issue_slug>.json（如存在）
    对 status=done 的 AC 跳过实现，输出 ##[AC_EXISTS] AC<n>: <commit>
    
    ## 第2步：实现未完成 AC
    每个 AC 完成后必须输出：
    ##[AC_DONE] AC<n>: <描述>
    实现失败输出：
    ##[AC_FAIL] AC<n>: <原因>

    全部处理完毕后输出汇总：
    ##[IMPLEMENT_RESULT] status=ALL_DONE|AC_GAP done=N total=N
```

**ac-verify 节点**:
```yaml
- id: ac-verify
  prompt: |
    逐条验证 $ARGUMENTS 的 Acceptance Criteria。
    
    对每条 AC 找到代码证据（文件:行号）：
    输出结果表 + 汇总行：
    ##[AC_VERIFY_RESULT] status=VERIFIED|GAP verified=N total=N

    GAP 时输出缺失明细：
    ##[AC_GAP_DETAIL] AC<n>: <缺失描述>
```

**新增 hard-gate 节点（插入 ac-verify 和 validate 之间）**:
```yaml
- id: hard-gate
  depends_on: [ac-verify]
  bash: |
    # 确定性检查：grep 必需字段/模式
    ISSUE="$ARGUMENTS"
    FAILS=0
    
    # 示例规则：如果 issue 提到 lobby-store，检查 drawerOpen 是否存在
    if grep -q "drawerOpen\|lobby-store" "$ISSUE"; then
      grep -q "drawerOpen" packages/web/src/stores/lobby-store.ts || {
        echo "##[HARD_GATE] FAIL: drawerOpen 字段缺失于 lobby-store.ts"
        FAILS=$((FAILS + 1))
      }
    fi
    
    if [ $FAILS -eq 0 ]; then
      echo "##[HARD_GATE] PASS"
    else
      echo "##[HARD_GATE] FAIL: $FAILS 项检查不通过"
      exit 1
    fi
```

**mark-in-review 节点增强**:
```bash
# 检查硬门禁和验证结果
ARCHON_LOG="$ARCHON_WORKSPACE/archon_output.log"
HARD_GATE=$(grep "##\[HARD_GATE\]" "$ARCHON_LOG" | tail -1)
VERIFY=$(grep "##\[AC_VERIFY_RESULT\]" "$ARCHON_LOG" | tail -1)

if echo "$HARD_GATE" | grep -q "FAIL"; then
    echo "FATAL: HARD_GATE failed"
    exit 1
fi

if echo "$VERIFY" | grep -q "GAP"; then
    echo "FATAL: AC_GAP detected"
    exit 1
fi

# 全部通过 → 写入 verdict.json
cat > "$ARCHON_WORKSPACE/.archon/verdict.json" << EOF
{"issue": "$(basename "$ISSUE_FILE" .md)", "verdict": "PASS",
 "timestamp": "$(date -Iseconds)"}
EOF
```

**DAG 更新**:
```
implement → ac-verify → hard-gate → validate → auto-review → cross-review → merge-reviews → create-pr → mark-in-review
```

---

### 第 4 层：checkpoints.json 断点续跑（P2）🆕

**对标**: Proof Loop "evidence-backed done" + CoDD checkpoint resumability

**目标**: 每次 AC 完成后落地状态，中断后下次运行从断点继续，不再重做。

**文件**: `.archon/checkpoints/<issue-slug>.json`

**格式**:
```json
{
  "issue": "001-css-i18n-store-foundation",
  "created": "2026-06-27T16:30:00Z",
  "updated": "2026-06-27T16:34:55Z",
  "attempts": 1,
  "ac_status": {
    "AC1": {
      "status": "done",
      "commit": "19ea8fc",
      "timestamp": "2026-06-27T16:33:54Z",
      "evidence": "packages/web/src/index.css: +54 lines, 6 CSS rules"
    },
    "AC2": {
      "status": "done",
      "commit": "61a2457",
      "timestamp": "2026-06-27T16:34:55Z",
      "evidence": "packages/web/src/i18n/en.ts:+4, zh-CN.ts:+4, types.ts:+4"
    },
    "AC3": { "status": "pending" },
    "AC4": { "status": "pending" },
    "AC5": { "status": "pending" }
  }
}
```

**生命周期**:

| 阶段 | 谁操作 | 动作 |
|------|:------|------|
| issue 首次 claim | dispatch.sh | 从 issue frontmatter 初始化 checkpoint（全 AC pending） |
| 每个 AC 完成 | implement 节点 | 更新对应 AC status → done + evidence |
| 每次运行前 | implement 节点 | 读取 checkpoint，跳过 done AC |
| issue done/failed | reconciler.sh | 归档或删除 checkpoint |

**与 Archon worktree 的关系**:

Archon worktree 是独立 git clone，checkpoint 文件需要跨 worktree 持久化。方案：
- dispatch.sh 在调用 Archon 前，将 checkpoint 复制到 worktree
- mark-in-review 将 worktree 中的 checkpoint 回写到主项目
- 如果 Archon 中断（进程被杀），主项目的 checkpoint 保持上次状态，下次运行复用

```bash
# dispatch.sh 中新增（Archon 调用前）
CHECKPOINT="$WORKSPACE/.archon/checkpoints/${ISSUE_SLUG}.json"
if [ -f "$CHECKPOINT" ]; then
    cp "$CHECKPOINT" "$ARCHON_WORKSPACE/.archon/checkpoints/"
    log "CHECKPOINT_RESTORE: $(grep -c '"done"' "$CHECKPOINT") ACs already done"
fi

# mark-in-review 中新增（完成后）
cp "$ARCHON_WORKSPACE/.archon/checkpoints/${ISSUE_SLUG}.json" \
   "$WORKSPACE/.archon/checkpoints/" 2>/dev/null || true
```

**效果**: #001 中断后重跑，AC1/AC2 已标记 done，implement 只做 AC3-AC5。彻底消灭死循环。

---

### 第 5 层：确定性验证门禁（P2）🆕

**对标**: Datadog Harness-First "deterministic Simulation Testing" + SonarSource "loop is only as good as the thing allowed to tell it no"

**核心原则**: LLM 验证（ac-verify）是顾问性的，不做最终裁决。最终裁决来自硬门禁（bash grep + test 退出码）。

**两层结构**:

```
implement → ac-verify (LLM, 顾问) → hard-gate (bash, 硬门禁) → validate (test) → ...
                  ↓                              ↓
          "看起来没问题"                    grep 确认字段存在
                                           test 确认全绿
```

**hard-gate 规则来源**: 从 issue 的 AC 清单自动派生确定性检查。

```bash
# 通用规则（所有 issue 适用）
build_check() {
    cd "$WORKSPACE" && eval "$TEST_CMD" --if-present 2>&1 | tail -5
    return ${PIPESTATUS[0]}
}

# 从 issue 派生规则：扫描 AC 中的关键词
derive_gates() {
    local issue="$1"
    grep -q "lobby-store" "$issue" && echo "grep drawerOpen packages/web/src/stores/lobby-store.ts"
    grep -q "i18n" "$issue" && echo "grep 'nav.sessions' packages/web/src/i18n/en.ts"
    grep -q "index.css" "$issue" && echo "grep 'mobile-adaptation' packages/web/src/index.css"
}
```

**为什么 valid？** 因为我们的 AC 设计已经是"可量化可自动化"，硬门禁只是用 grep/test 替代人眼验证。不引入新概念，只是把 AC 描述变成可执行检查。

---

## 业界对齐

| 业界实践 | 我们对应的层 | 来源 |
|---------|:----------:|------|
| Harness-First Engineering | 第 5 层 hard-gate | Datadog Helix project |
| Evidence-Backed Done | 第 4 层 checkpoints + verdict.json | Proof Loop |
| Checkpoint Resumability | 第 4 层 checkpoints.json | CoDD `--resume` |
| Two-Tier Verification | 第 3 层 ac-verify + 第 5 层 hard-gate | SonarSource loop engineering |
| AgentOps Observability | 第 1 层 结构化日志 + 第 2 层 status.sh | MachineLearningMastery 五支柱 |
| Repo-Native State | checkpoints/verdict 存在 `.archon/`（repo 内） | AgentSpec handoff model |

## 不适合的实践（理由）

| 实践 | 不适合原因 |
|------|-----------|
| OpenTelemetry 集成 | 走 DeepSeek 代理，非 Anthropic SDK，无 OTel 导出能力 |
| Feature flags 生产回退 | 纯前端改动，无生产部署环境 |
| Human-in-loop 工作流暂停 | Archon DAG 只前进；人工审批在 Gate 7 层面已有 |

---

## 实现优先级

| 优先级 | 层 | 工作量 | 解决问题 |
|:---:|:---|:---:|------|
| **P0** | 第 4 层 checkpoints | ~60行 Python | #001 死循环 |
| **P0** | 第 1 层 dispatch.sh 日志 | ~10行 bash | 盲调 |
| **P1** | 第 5 层 hard-gate | ~30行 bash | 假通过 |
| **P1** | 第 2 层 status.sh | ~80行 bash | 手动巡检 |
| **P2** | 第 3 层 workflow 标记 | ~40行 YAML | 结构化判定 |

---

## 关联改进

- `dispatch.log` 重复行：排查 timer 是否被重复 enable，或 dispatch.sh 加 pidfile 互斥
- `git pull` 间歇失败：dispatch.sh pull 重试 3 次（已有重试框架）
- Archon model：当前 sonnet→DeepSeek，需评估模型在代码生成上的实际能力
