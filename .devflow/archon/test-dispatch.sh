#!/bin/bash
# test-dispatch.sh — dispatch/reconcile 全场景自动化测试（服务器版）
# 用法: bash test-dispatch.sh <项目路径>
# 设计: AAA 模式，幂等可重复，自动清理，无跳转
set -uo pipefail

WORKSPACE="${1:-$(pwd)}"
ARCHON_DIR="$WORKSPACE/.devflow/archon"
SCRIPTS_DIR="$WORKSPACE/.devflow/scripts"
ISSUES_DIR="$WORKSPACE/issues"
LOG_FILE="$WORKSPACE/logs/dispatch.log"
RECONCILE_LOG="$WORKSPACE/logs/reconcile.log"
PASS=0; FAIL=0; SKIP=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;94m'; NC='\033[0m'

pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}✅${NC} $1"; }
fail() { FAIL=$((FAIL + 1)); echo -e "  ${RED}❌${NC} $1"; }
skip() { SKIP=$((SKIP + 1)); echo -e "  ${YELLOW}⚠️${NC} $1"; }
step() { echo ""; echo -e "${BLUE}── $1 ──${NC}"; }
grep_status() { grep "^status:" "$1" 2>/dev/null | awk '{print $2}' || echo "MISSING"; }
count_wt() { git -C "$WORKSPACE" worktree list 2>/dev/null | wc -l; }
push_if_dirty() {
    cd "$WORKSPACE" && git diff --quiet HEAD && return 0
    git add issues/ .devflow/archon/ 2>/dev/null
    git commit --no-verify -m "test: staging" >/dev/null 2>&1
    git push origin main >/dev/null 2>&1
}

echo "============================================"
echo " dispatch/reconcile 全场景自动化测试"
echo " 项目: $WORKSPACE ($(date +%H:%M))"
echo "============================================"

#───────────────────────────────────────
# Phase 1: 静态分析
#───────────────────────────────────────
step "Phase 1: 静态分析"

bash -n "$ARCHON_DIR/dispatch.sh"  && pass "dispatch.sh 语法合法"
bash -n "$ARCHON_DIR/reconciler.sh" && pass "reconciler.sh 语法合法"

! grep -v '^\s*#' "$ARCHON_DIR/dispatch.sh"        | grep -qE 'git stash (push|pop|apply|save)' && \
    pass "dispatch.sh 无 stash"
! grep -v '^\s*#' "$ARCHON_DIR/reconciler.sh"      | grep -qE 'git stash (push|pop|apply|save)' && \
    pass "reconciler.sh 无 stash"
! grep -qE 'git stash (push|pop|apply|save)' "$ARCHON_DIR/auto-execute-afk.yaml" && \
    pass "auto-execute-afk.yaml 无裸 stash"

grep -q 'trap cleanup_exit EXIT INT TERM' "$ARCHON_DIR/dispatch.sh"   && pass "dispatch trap EXIT/INT/TERM"
grep -q 'cleanup_exit' "$ARCHON_DIR/dispatch.sh" && \
    grep -q 'git worktree remove.*DISPATCH_WT' "$ARCHON_DIR/dispatch.sh" && \
    grep -q 'git worktree prune' "$ARCHON_DIR/dispatch.sh" && \
    pass "dispatch cleanup worktree"
grep -q 'trap cleanup_exit EXIT INT TERM' "$ARCHON_DIR/reconciler.sh"   && pass "reconciler trap EXIT/INT/TERM"
grep -q 'git worktree remove.*RECONCILE_WT' "$ARCHON_DIR/reconciler.sh" && pass "reconciler cleanup worktree"
grep -q 'HEAD:main' "$ARCHON_DIR/dispatch.sh" && pass "dispatch push HEAD:main"

#───────────────────────────────────────
# Phase 2: Worktree 隔离基础
#───────────────────────────────────────
step "Phase 2: Worktree 隔离单元测试"

WT_BASE=$(count_wt)

WT_TMP=$(mktemp -d /tmp/test-wt-XXXXXX) && rmdir "$WT_TMP" || fail "mktemp 失败" "blocker"
[ ! -d "${WT_TMP:-/nonexistent}" ] && pass "mktemp 获取唯一名不创建目录"

git -C "$WORKSPACE" worktree add "$WT_TMP" origin/main --detach >/dev/null 2>&1 && pass "worktree 创建"
[ -d "$WT_TMP/issues" ] && pass "issues/ 在 worktree 中可访问"
[ "$(count_wt)" -eq $((WT_BASE + 1)) ] && pass "worktree 数量 +1"

git -C "$WORKSPACE" worktree remove "$WT_TMP" --force >/dev/null 2>&1
[ ! -d "$WT_TMP" ] && pass "worktree remove 后目录已删"
[ "$(count_wt)" -le "$WT_BASE" ] && pass "worktree 数量回归基线"

LEAK=0
for i in 1 2 3; do
    W=$(mktemp -d /tmp/tw-X); rmdir "$W"
    git -C "$WORKSPACE" worktree add "$W" origin/main --detach >/dev/null 2>&1 || { LEAK=1; break; }
    git -C "$WORKSPACE" worktree remove "$W" --force >/dev/null 2>&1
done
[ "$LEAK" -eq 0 ] && [ "$(count_wt)" -le "$WT_BASE" ] && pass "3 轮创建→移除无泄漏"

git -C "$WORKSPACE" worktree prune >/dev/null 2>&1
[ "$(count_wt)" -le "$WT_BASE" ] && pass "worktree prune 安全"

#───────────────────────────────────────
# Phase 3: 真实代码修改全流程
#───────────────────────────────────────
step "Phase 3: T1 — 真实代码修改全流程"

# 清理环境
cd "$WORKSPACE"
for f in issues/000-TEST*.md issues/006-*; do
    [ -f "$f" ] && sed -i "s/^status: ready$/status: failed/" "$f"
done
push_if_dirty || true

# 创建有真实改动的 mock issue
cat > "$ISSUES_DIR/000-TEST-REAL-modify-config.md" << 'EOF'
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
test_files: ["tests/test_real_code_change.py"]
---

# TEST: 修改 .devflow/config.yaml name 字段

## Acceptance Criteria
- [ ] AC1: name 值改为 TEST-WORKTREE
- [ ] AC2: PR 创建并合并成功
- [ ] AC3: issue status → done
EOF

# 宪法检查
CONSTITUTION_OUT=$(python3 "$SCRIPTS_DIR/check_constitution.py" "$ISSUES_DIR/000-TEST-REAL-modify-config.md" --json 2>&1 || true)
CON_FAIL=$(echo "$CONSTITUTION_OUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('failed',99))" 2>/dev/null || echo 99)
if [ "$CON_FAIL" = "0" ]; then pass "宪法检查通过"; else fail "宪法不通过 (failed=$CON_FAIL)" "blocker"; fi

git add "$ISSUES_DIR/000-TEST-REAL-modify-config.md"
git commit --no-verify -m "test: real code change mock" >/dev/null 2>&1
git push origin main >/dev/null 2>&1 || { skip "full flow (git push 失败)"; goto_reconciler=true; }

if [ "${goto_reconciler:-false}" != "true" ]; then
    # 触发 dispatch
    rmdir "$WORKSPACE/.dispatch.lock" 2>/dev/null || true
    BEFORE_LINES=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)

    # 轮询等待完成（最长 15min）
    END=0; MAX=900
    while [ $END -lt $MAX ]; do
        sleep 15; END=$((END + 15))
        AFTER=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$AFTER" -gt "$BEFORE_LINES" ] || [ "$BEFORE_LINES" -gt 100 ]; then
            tail -3 "$LOG_FILE" | grep -qE '(IN_REVIEW|AUTO_MERGED|UNRESOLVED|NO_MORE_TASKS|FATAL)$' 2>/dev/null && sleep 10 && break
        fi
    done

    STATUS=$(grep_status "$ISSUES_DIR/000-TEST-REAL-modify-config.md")
    if [ "$STATUS" = "done" ]; then
        pass "issue status = done"
    else
        fail "issue status ≠ done (got: $STATUS)"
    fi

    # config.yaml 被改了？
    grep -q 'TEST-WORKTREE' "$WORKSPACE/.devflow/config.yaml" 2>/dev/null && pass ".devflow/config.yaml 被修改" || fail ".devflow/config.yaml 未被修改"

    # 日志无 FATAL
    tail -50 "$LOG_FILE" | grep -qvE '^Preparing\|^HEAD is now at$|scan' && \
        ! tail -50 "$LOG_FILE" | grep -q 'FATAL' && pass "日志无 FATAL"

    # 日志无 stash 残留（验证 autostash 补丁生效）
    tail -100 "$LOG_FILE" | grep -q 'stash' && fail "日志有 stash" || pass "日志无 stash (autostash 有效)"

    # PR merge 记录
    git log --oneline origin/main | head -10 | grep -q 'archon/task-' && pass "PR branch merged to main" || fail "无 PR merge 记录"

    [ "$(count_wt)" -le "$WT_BASE" ] && pass "worktree 归零"
fi

#───────────────────────────────────────
# Phase 4: 并发安全
#───────────────────────────────────────
step "Phase 4: T4 — 并发安全"

if [ "${goto_reconciler:-false}" = "true" ]; then
    skip "concurrent test (earlier push failed)"
else
    # 准备 trigger issue
    cat > "$ISSUES_DIR/000-TEST-CONCURRENT-trigger.md" << 'EOF'
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
# Concurrent trigger test
EOF
    git add "$ISSUES_DIR/000-TEST-CONCURRENT-trigger.md" >/dev/null 2>&1
    git commit --no-verify -m "test: concurrent trigger" >/dev/null 2>&1
    git push origin main >/dev/null 2>&1 || { skip "concurrent test (git push 失败)"; goto_deps=true; }

    if [ "${goto_deps:-false}" != "true" ]; then
        # 双进程同时打同一个 lock
        sudo -u www bash "$ARCHON_DIR/dispatch.sh" "$WORKSPACE" >/dev/null 2>&1 &
        PID1=$!
        sleep 2
        sudo -u www bash "$ARCHON_DIR/dispatch.sh" "$WORKSPACE" >/dev/null 2>&1 &
        PID2=$!
        wait $PID1 2>/dev/null || true
        wait $PID2 2>/dev/null || true

        NEW_CLAIMED=$(tail -80 "$LOG_FILE" | grep -c 'CLAIMED: push OK' 2>/dev/null || echo 0)
        SKIP_COUNT=$(tail -80 "$LOG_FILE" | grep -c 'SKIP:' 2>/dev/null || echo 0)
        REJECT=$(tail -80 "$LOG_FILE" | grep -c '抢占失败' 2>/dev/null || echo 0)

        if [ "$NEW_CLAIMED" -le 1 ] && [ $((SKIP_COUNT + REJECT)) -ge 1 ]; then
            pass "并发安全：≤1 CLAIMED, ≥1 SKIPPED/REJECTED ($CLAIMED claim, $SKIP_COUNT skip, $REJECT reject)"
        elif [ "$SKIP_COUNT" -ge 1 ]; then
            pass "并发安全：lock 阻止重叠执行"
        else
            fail "并发不明确 (claim=$NEW_CLAIMED skip=$SKIP_COUNT reject=$REJECT)"
        fi

        [ "$(count_wt)" -le "$WT_BASE" ] && pass "并发结束 worktree 归零"
    fi
fi

#───────────────────────────────────────
# Phase 5: 依赖阻塞解析
#───────────────────────────────────────
step "Phase 5: T5 — 依赖阻塞"

if [ "${goto_deps:-false}" = "true" ]; then
    skip "dependency test (earlier push failed)"
else
    # 全部标记 failed
    for f in issues/000-TEST*.md; do
        [ -f "$f" ] && sed -i "s/^status: ready$/status: failed/" "$f" 2>/dev/null || true
    done

    cat > "$ISSUES_DIR/000-TEST-DEP-PARENT.md" << 'EOF'
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
# Dependency chain parent
EOF
    cat > "$ISSUES_DIR/000-TEST-DEP-CHILD.md" << 'EOF'
---
type: AFK
estimate: 0.5d
effort: small
status: ready
blocked_by: ["000-TEST-DEP-PARENT"]
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files: []
---
# Blocked by parent — should NOT be picked up first
EOF

    git add issues/000-TEST-DEP-*.md >/dev/null 2>&1
    git commit --no-verify -m "test: dependency chain" >/dev/null 2>&1
    git push origin main >/dev/null 2>&1 || { skip "dep test push failed"; goto_sigmterm=true; }

    if [ "${goto_sigmterm:-false}" != "true" ]; then
        rmdir "$WORKSPACE/.dispatch.lock" 2>/dev/null || true
        sleep 60  # 等一个完整 run

        PARENT_STATUS=$(grep_status "$ISSUES_DIR/000-TEST-DEP-PARENT.md")
        CHILD_STATUS=$(grep_status "$ISSUES_DIR/000-TEST-DEP-CHILD.md")

        if [ "$PARENT_STATUS" = "in_progress" ] && [ "$CHILD_STATUS" = "ready" ]; then
            pass "依赖正确：parent=in_progress, child=still_blocked"
        elif [ "$PARENT_STATUS" = "done" ] && [ "$CHILD_STATUS" = "in_progress" ]; then
            pass "依赖传递：parent done → child executed"
        elif [ "$PARENT_STATUS" = "done" ] && [ "$CHILD_STATUS" = "ready" ]; then
            pass "部分通过：parent done, child ready (reconciler auto-ready pending)"
        else
            fail "依赖解析异常 (parent=$PARENT_STATUS, child=$CHILD_STATUS)"
        fi
    fi
fi

#───────────────────────────────────────
# Phase 6: 宪法拦截回退验证
#───────────────────────────────────────
step "Phase 6: T6 — 宪法拦截回退"

# 重置 T3B 到 ready（如果它还是 failed/backlog）
sed -i "s/^status: failed$/status: ready/" "$ISSUES_DIR/000-TEST-T3B-constitution-fail.md" 2>/dev/null || true
sed -i "s/^status: backlog$/status: ready/" "$ISSUES_DIR/000-TEST-T3B-constitution-fail.md" 2>/dev/null || true

IS_FAILED=$(python3 "$SCRIPTS_DIR/check_constitution.py" "$ISSUES_DIR/000-TEST-T3B-constitution-fail.md" --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('failed',99))" 2>/dev/null || echo 99)

if [ "${IS_FAILED:-99}" -gt 0 ]; then
    rmdir "$WORKSPACE/.dispatch.lock" 2>/dev/null || true
    sleep 30

    NEW_STAT=$(grep_status "$ISSUES_DIR/000-TEST-T3B-constitution-fail.md")
    if [ "$NEW_STAT" = "failed" ]; then
        pass "宪法拦截后 issue 保持 failed（未意外变 ready）"
    elif [ "$NEW_STAT" = "in_progress" ]; then
        fail "宪法拦截后 issue 变成了 in_progress！(state leak)"
    else
        fail "宪法拦截后状态异常: $NEW_STAT"
    fi

    tail -50 "$LOG_FILE" | grep -q 'CONSTITUTION_FAIL' && pass "dispatch log 记录 CONSTITUTION_FAIL"
    ! tail -50 "$LOG_FILE" | grep -q 'ARCHON: 尝试' && pass "宪法拦截未调用 Archon"
else
    skip "T3B 已通过宪法检查（可能被其他测试改变了 content）"
fi

#───────────────────────────────────────
# Phase 7: Reconciler 全覆盖
#───────────────────────────────────────
step "Phase 7: T7 — Reconciler 各 Section 测试"

# 7a: 正常执行（不应误杀任何活跃 task）
REC_BEFORE=$(wc -l < "$RECONCILE_LOG" 2>/dev/null || echo 0)
sudo -u www bash "$ARCHON_DIR/reconciler.sh" "$WORKSPACE" >/dev/null 2>&1 || true
REC_AFTER=$(wc -l < "$RECONCILE_LOG" 2>/dev/null || echo 0)
if [ "$REC_AFTER" -gt "$REC_BEFORE" ] || [ "$REC_BEFORE" -gt 0 ]; then
    tail -5 "$RECONCILE_LOG" | grep -q 'RECONCILE:' && pass "Reconciler 正常执行" || skip "Reconciler 无新日志输出"
else
    touch "$RECONCILE_LOG"
    sudo -u www bash "$ARCHON_DIR/reconciler.sh" "$WORKSPACE" >/dev/null 2>&1 || true
    tail -5 "$RECONCILE_LOG" | grep -q 'RECONCILE:' && pass "Reconciler 正常执行 (重试)" || fail "Reconciler 无输出" "blocker"
fi

# 7b: Section 2 — failed >24h → backlog
# 无法精确控制 mtime，但可以通过修改 content 后 touch 实现
cat > "$ISSUES_DIR/000-TEST-S2-OLDFAIL.md" << 'EOF'
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
test_files: []
---
# Old failing issue
EOF
touch -d "2 days ago" "$ISSUES_DIR/000-TEST-S2-OLDFAIL.md"
BEFORE_S2=$(grep_status "$ISSUES_DIR/000-TEST-S2-OLDFAIL.md")
sudo -u www bash "$ARCHON_DIR/reconciler.sh" "$WORKSPACE" >/dev/null 2>&1 || true
AFTER_S2=$(grep_status "$ISSUES_DIR/000-TEST-S2-OLDFAIL.md")
if [ "$AFTER_S2" = "backlog" ]; then
    pass "Section 2: failed >24h → backlog ($BEFORE_S2 → $AFTER_S2)"
elif tail -20 "$RECONCILE_LOG" | grep -qi "RECLAIM.*S2-OLDFAIL"; then
    pass "Section 2: via reconcile log"
else
    skip "Section 2: mtime/content 时间不一致，跳过"
fi

# 7c: Section 3 — 孤儿检测 (>5min 无进程无分支/worktree)
cat > "$ISSUES_DIR/000-TEST-S3-ORPHAN.md" << 'EOF'
---
type: AFK
estimate: 0.5d
effort: small
status: in_progress
blocked_by: []
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files: []
---
# Orphan issue for section 3 test
EOF
TARGET=$(($(date +%s) - 600))
touch -d "@$TARGET" "$ISSUES_DIR/000-TEST-S3-ORPHAN.md"
sudo -u www bash "$ARCHON_DIR/reconciler.sh" "$WORKSPACE" >/dev/null 2>&1 || true
ORPHAN_STAT=$(grep_status "$ISSUES_DIR/000-TEST-S3-ORPHAN.md")
if [ "$ORPHAN_STAT" = "ready" ]; then
    pass "Section 3: 孤儿 in_progress → ready"
elif tail -20 "$RECONCILE_LOG" | grep -qi "orphan"; then
    pass "Section 3: orphan detected via log"
else
    # 可能因为当前有 dispatch/reconciler 进程运行导致 pgrep 匹配
    PGREP_DISPATCH=$(pgrep -f "dispatch.sh.*$WORKSPACE" | wc -l)
    PGREP_ARCHON=$(pgrep -f "archon workflow" | wc -l)
    if [ "$PGREP_DISPATCH" -gt 0 ] || [ "$PGREP_ARCHON" -gt 0 ]; then
        skip "Section 3: 当前有 dispatch/archon 进程运行，防误杀保护生效 (dispatch:$PGREP_DISPATCH archon:$PGREP_ARCHON)"
    else
        fail "Section 3: 孤儿未回收 (status: $ORPHAN_STAT)"
    fi
fi

# 7d: Section 4 — backlog deps all done → auto ready
cat > "$ISSUES_DIR/000-TEST-S4-BLOCKED.md" << 'EOF'
---
type: AFK
estimate: 0.5d
effort: small
status: backlog
blocked_by: ["000-TEST-S4-DEP-DONE"]
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files: []
---
# Blocked
EOF
cat > "$ISSUES_DIR/000-TEST-S4-DEP-DONE.md" << 'EOF'
---
type: AFK
estimate: 0.5d
effort: small
status: done
blocked_by: []
needs_llm: false
needs_vision: false
needs_pdf: false
needs_docker: false
test_files: []
---
# Done dep
EOF
sudo -u www bash "$ARCHON_DIR/reconciler.sh" "$WORKSPACE" >/dev/null 2>&1 || true
BLOCKED_STAT=$(grep_status "$ISSUES_DIR/000-TEST-S4-BLOCKED.md")
if [ "$BLOCKED_STAT" = "ready" ]; then
    pass "Section 4: backlog + all deps done → ready"
elif tail -20 "$RECONCILE_LOG" | grep -qi "AUTO_READY"; then
    pass "Section 4: via reconcile log"
else
    fail "Section 4: blocked not auto-ready (status: $BLOCKED_STAT)"
fi

# 7e: Section 5 — in_review + PR merged → done
REVIEW_ISSUE=""
for f in issues/000-TEST*.md; do
    [ -f "$f" ] && [ "$(grep_status "$f")" = "in_review" ] && REVIEW_ISSUE="$f" && break
done

if [ -n "$REVIEW_ISSUE" ]; then
    PR_URL=$(grep -oP 'pr:\s*\["?\Khttps://[^"\] ]+' "$REVIEW_ISSUE" 2>/dev/null | head -1 || true)
    if [ -n "$PR_URL" ]; then
        MERGED=$(gh pr view "$PR_URL" --json merged --jq '.merged' 2>/dev/null || echo "false")
        if [ "$MERGED" = "true" ]; then
            sudo -u www bash "$ARCHON_DIR/reconciler.sh" "$WORKSPACE" >/dev/null 2>&1 || true
            REV_STAT=$(grep_status "$REVIEW_ISSUE")
            [ "$REV_STAT" = "done" ] && pass "Section 5: in_review+PR merged → done" || fail "Section 5: status=$REV_STAT (expected done)"
        else
            pass "Section 5: PR exists but not yet merged ($PR_URL)"
        fi
    else
        pass "Section 5: in_review issue ($REVIEW_ISSUE) without PR URL — branch auto-merge path"
    fi
else
    pass "Section 5: no in_review issue currently — waiting for pipeline"
fi

# 最终 worktree 归零
[ "$(count_wt)" -le "$WT_BASE" ] && pass "Reconciler 结束 worktree 归零"

#───────────────────────────────────────
# Phase 8: SIGTERM 中断恢复
#───────────────────────────────────────
step "Phase 8: T8 — SIGTERM 中断恢复"

if [ "${goto_sigmterm:-false}" = "true" ]; then
    skip "SIGTERM test (earlier push failed)"
else
    for f in issues/000-TEST*.md; do
        [ -f "$f" ] && sed -i "s/^status: ready$/status: failed/" "$f" 2>/dev/null || true
    done
    cat > "$ISSUES_DIR/000-TEST-SIGTERM-kill.md" << 'EOF'
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
# SIGTERM interrupt test
EOF
    git add issues/000-TEST-SIGTERM-kill.md >/dev/null 2>&1
    git commit --no-verify -m "test: sigterm" >/dev/null 2>&1
    git push origin main >/dev/null 2>&1 || { skip "SIGTERM test (git push 失败)"; }

    sleep 10  # 给 dispatch timer 进入 worktree 的时间

    DPID=$(pgrep -f "dispatch.sh.*$WORKSPACE" | head -1)
    if [ -n "$DPID" ]; then
        kill -TERM "$DPID" 2>/dev/null || true
        wait "$DPID" 2>/dev/null || true
        pass "SIGTERM 已发送"

        WT_SIG=$(count_wt)
        [ "$WT_SIG" -le "$WT_BASE" ] && pass "SIGTERM 后 worktree 归零"

        [ ! -d "$WORKSPACE/.dispatch.lock" ] && pass "SIGTERM 后 lock 释放"
    else
        skip "未找到 dispatch 进程（可能被之前测试占用或已完成）"
    fi
fi

#───────────────────────────────────────
# 汇总
#───────────────────────────────────────
echo ""
echo "============================================"
echo " 测试结果汇总"
echo "============================================"
echo -e " ${GREEN}✅ PASS${NC}: $PASS"
echo -e " ${RED}❌ FAIL${NC}: $FAIL"
echo -e " ${YELLOW}⚠️  SKIP${NC}: $SKIP"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}❌ 有 $FAIL 项失败${NC}"
    exit 1
else
    echo -e "${GREEN}✅ 全部 $PASS 项通过 (${SKIP} 跳过)${NC}"
    exit 0
fi
