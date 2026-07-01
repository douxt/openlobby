---
type: AFK
estimate: 0.5d
effort: small
status: in_review
blocked_by: []
needs_llm: true
needs_vision: false
needs_pdf: false
needs_docker: false
test_files: ["tests/test_mock.py"]
---

# TEST: dispatch worktree 全程验证

## 背景
模拟 issue，验证 dispatch.sh worktree 隔离全流程。

## Acceptance Criteria
- [ ] AC1: dispatch 成功从 origin/main 创建 worktree
- [ ] AC2: 宪法检查通过
- [ ] AC3: issue 被抢占（ready → in_progress）
- [ ] AC4: dispatch 退出后 worktree 已清理
- [ ] AC5: 日志无 FATAL 或 stash 残留
