---
type: AFK
estimate: 0.5d
effort: small
status: ready
blocked_by: []
needs_llm: true
needs_vision: false
needs_pdf: false
needs_docker: false
test_files: ["tests/test_mock.py"]
---

# TEST: Worktree 集成测试

## 背景
自动化测试 mock issue，验证 dispatch.sh 的 worktree 隔离机制。

## Acceptance Criteria
- [ ] AC1: dispatch 成功创建 worktree（从 origin/main --detach）
- [ ] AC2: dispatch 退出后 worktree 已清理（git worktree list 数量回归）
- [ ] AC3: 日志无 FATAL 或 stash 残留

## 代码目录
- 实现: `src/`（不存在，预期 Archon 失败）
- 测试: `tests/test_mock.py`（不存在）
